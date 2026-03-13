import type { PluginInput } from "@opencode-ai/plugin"
import type { ExperimentalConfig } from "../config/schema"
import { createDynamicTruncator } from "../shared/dynamic-truncator"
import type { ContextBudget } from "../shared/context-budget"
import { Effect } from "effect"

const FALLBACK_MAX_TOKENS = 50_000 // ~200k chars — only when no budget
const WEBFETCH_MAX_TOKENS = 10_000 // ~40k chars - web pages need aggressive truncation
const MAX_TOKENS_RATIO = 0.25 // Tool output should never exceed 25% of context limit

// Pressure-based max chars — aligned with Omni Rust context_budget.rs
// Low (<50%): no limit, Medium (50-75%): 8K, High (75-90%): 3K, Critical (>90%): 1K
const PRESSURE_MAX_CHARS: Record<string, number> = {
  low: Infinity,
  medium: 8000,   // ~2K tokens
  high: 3000,     // ~750 tokens
  critical: 1000, // ~250 tokens
}

const TRUNCATABLE_TOOLS = [
  "grep",
  "Grep",
  "safe_grep",
  "glob",
  "Glob",
  "safe_glob",
  "lsp_diagnostics",
  "ast_grep_search",
  "interactive_bash",
  "Interactive_bash",
  "skill_mcp",
  "webfetch",
  "WebFetch",
]

const TOOL_SPECIFIC_MAX_TOKENS: Record<string, number> = {
  webfetch: WEBFETCH_MAX_TOKENS,
  WebFetch: WEBFETCH_MAX_TOKENS,
}

interface ToolOutputTruncatorOptions {
  experimental?: ExperimentalConfig
}

/**
 * Effect variant for truncating tool output.
 * Gracefully degrades on error (returns void, never blocks tool execution).
 */
export const truncateToolOutputEffect = (
  truncator: ReturnType<typeof createDynamicTruncator>,
  input: { tool: string; sessionID: string },
  output: { output: string },
  targetMaxTokens: number
): Effect.Effect<void, never> =>
  Effect.tryPromise({
    try: async () => {
      const { result, truncated } = await truncator.truncate(
        input.sessionID,
        output.output,
        { targetMaxTokens }
      )
      if (truncated) {
        output.output = result
      }
    },
    catch: () => undefined as never
  }).pipe(Effect.catchAll(() => Effect.void))

export function createToolOutputTruncatorHook(ctx: PluginInput, options?: ToolOutputTruncatorOptions, budget?: ContextBudget) {
  const truncator = createDynamicTruncator(ctx, budget)

  // Dynamic max tokens based on model context limit
  const contextLimit = budget?.getContextLimit() ?? 200_000
  const dynamicMaxTokens = Math.floor(contextLimit * MAX_TOKENS_RATIO)

  // Auto-enable on small models (<200K) — Read/Write/Edit outputs can be huge
  const isSmallModel = contextLimit < 200_000
  const truncateAll = isSmallModel || (options?.experimental?.truncate_all_tool_outputs ?? false)

  const toolExecuteAfter = async (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: unknown }
  ) => {
    if (!truncateAll && !TRUNCATABLE_TOOLS.includes(input.tool)) return

    // Per-call dynamic: use real-time context usage for progressive truncation
    // Early in session → generous, late in session → aggressive
    let targetMaxTokens = TOOL_SPECIFIC_MAX_TOKENS[input.tool] ?? dynamicMaxTokens

    if (!TOOL_SPECIFIC_MAX_TOKENS[input.tool]) {
      const usage = await truncator.getUsage(input.sessionID)
      if (usage) {
        // Pressure-based cap (aligned with Omni Rust context_budget.rs)
        const usageRatio = usage.usagePercentage
        const pressure = usageRatio > 0.9 ? "critical" : usageRatio > 0.75 ? "high" : usageRatio > 0.5 ? "medium" : "low"
        const pressureMaxChars = PRESSURE_MAX_CHARS[pressure] ?? Infinity
        const pressureMaxTokens = Math.floor(pressureMaxChars / 4) // chars/4 heuristic

        // Cap at pressure limit OR 50% of remaining OR model ratio — smallest wins
        targetMaxTokens = Math.min(
          Math.max(usage.remainingTokens * 0.5, 1000), // at least 1K tokens
          dynamicMaxTokens,
          pressureMaxTokens
        )
      }
    }

    await Effect.runPromise(truncateToolOutputEffect(truncator, input, output, targetMaxTokens))
  }

  return {
    "tool.execute.after": toolExecuteAfter,
  }
}

