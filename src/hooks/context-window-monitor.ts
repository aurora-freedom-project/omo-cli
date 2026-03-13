import type { PluginInput } from "@opencode-ai/plugin"
import { formatSystemDirective, SystemDirectiveTypes } from "../shared/system-directive"
import type { ContextBudget } from "../shared/context-budget"

const DEFAULT_DISPLAY_LIMIT = 1_000_000

// 4-tier pressure system — aligned with Omni Rust context_budget.rs
const CONTEXT_MEDIUM_THRESHOLD = 0.50   // Start conserving
const CONTEXT_HIGH_THRESHOLD = 0.75     // Aggressive truncation
const CONTEXT_CRITICAL_THRESHOLD = 0.90 // Wrap up / compact

const MEDIUM_REMINDER = `${formatSystemDirective(SystemDirectiveTypes.CONTEXT_WINDOW_MONITOR)}

Context window is filling up. Complete your current task efficiently.
- Avoid reading large files — use grep/search instead.
- Keep tool outputs focused and concise.`

const HIGH_REMINDER = `${formatSystemDirective(SystemDirectiveTypes.CONTEXT_WINDOW_MONITOR)}

⚠️ Context window getting full — be aggressive.
- Complete ONLY the current sub-task.
- Delegate remaining work to sub-agents via delegate_task.
- Do NOT read new files or explore further.`

const CRITICAL_REMINDER = `${formatSystemDirective(SystemDirectiveTypes.CONTEXT_WINDOW_MONITOR)}

🚨 Context window CRITICAL — wrap up immediately.
- Finish current action and stop.
- Any new work must go to a sub-agent.
- Do NOT add any more context.`

type WarningTier = "medium" | "high" | "critical"

interface AssistantMessageInfo {
  role: "assistant"
  providerID: string
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
}

interface MessageWrapper {
  info: { role: string } & Partial<AssistantMessageInfo>
}

export function createContextWindowMonitorHook(ctx: PluginInput, budget?: ContextBudget) {
  const remindedSessions = new Map<string, WarningTier>()

  const toolExecuteAfter = async (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: unknown }
  ) => {
    const { sessionID } = input
    const currentTier = remindedSessions.get(sessionID)

    // Already at critical tier — nothing more to warn about
    if (currentTier === "critical") return

    try {
      const response = await ctx.client.session.messages({
        path: { id: sessionID },
      })

      const messages = (response.data ?? response) as MessageWrapper[]

      const assistantMessages = messages
        .filter((m) => m.info.role === "assistant")
        .map((m) => m.info as AssistantMessageInfo)

      if (assistantMessages.length === 0) return

      const lastAssistant = assistantMessages[assistantMessages.length - 1]
      const lastTokens = lastAssistant.tokens
      const totalInputTokens = (lastTokens?.input ?? 0) + (lastTokens?.cache?.read ?? 0)

      // Use budget's context limit if available, otherwise default
      const actualLimit = budget?.getContextLimit() ?? 200_000
      const actualUsagePercentage = totalInputTokens / actualLimit

      // Determine which tier to fire (4-tier: medium → high → critical)
      let reminder: string | null = null
      let tier: WarningTier | null = null

      const tierStr = currentTier as string | undefined
      if (actualUsagePercentage >= CONTEXT_CRITICAL_THRESHOLD && tierStr !== "critical") {
        reminder = CRITICAL_REMINDER
        tier = "critical"
      } else if (actualUsagePercentage >= CONTEXT_HIGH_THRESHOLD && tierStr !== "high" && tierStr !== "critical") {
        reminder = HIGH_REMINDER
        tier = "high"
      } else if (actualUsagePercentage >= CONTEXT_MEDIUM_THRESHOLD && tierStr === undefined) {
        reminder = MEDIUM_REMINDER
        tier = "medium"
      }

      if (!reminder || !tier) return

      remindedSessions.set(sessionID, tier)

      const displayLimit = Math.max(actualLimit, DEFAULT_DISPLAY_LIMIT)
      const displayUsagePercentage = totalInputTokens / displayLimit
      const usedPct = (displayUsagePercentage * 100).toFixed(1)
      const remainingPct = ((1 - displayUsagePercentage) * 100).toFixed(1)
      const usedTokens = totalInputTokens.toLocaleString()
      const limitTokens = displayLimit.toLocaleString()

      output.output += `\n\n${reminder}
[Context Status: ${usedPct}% used (${usedTokens}/${limitTokens} tokens), ${remainingPct}% remaining]`
    } catch {
      // Graceful degradation - do not disrupt tool execution
    }
  }

  const eventHandler = async ({ event }: { event: { type: string; properties?: unknown } }) => {
    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined
      if (sessionInfo?.id) {
        remindedSessions.delete(sessionInfo.id)
      }
    }
  }

  return {
    "tool.execute.after": toolExecuteAfter,
    event: eventHandler,
  }
}

