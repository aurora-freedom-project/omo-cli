import type { PluginInput } from "@opencode-ai/plugin"
import { hybridSkillSearch, isBrainReachable } from "../../shared/skills-brain-query"
import { log } from "../../shared/logger"
import { extractPromptText, removeCodeBlocks } from "../../shared/prompt-text"
import { removeSystemReminders, isSystemDirective } from "../../shared/system-directive"
import { subagentSessions } from "../../features/claude-code-session-state"
import type { ExperimentalConfig } from "../../config/schema"
import {
    type ContextBudget,
    InjectionPriority,
    estimateTokens,
} from "../../shared/context-budget"

/** Timeout for the SurrealDB hybrid search call (ms). */
const SEARCH_TIMEOUT_MS = 3000

/** Minimum prompt length to trigger preflight search. */
const MIN_PROMPT_LENGTH = 15

/** Maximum number of skills to inject. */
const MAX_SKILLS = 2

/**
 * Hook: preflight-skill-injector
 *
 * Intercepts user messages at "chat.message" stage on the FIRST long prompt
 * of each session. Performs a hybrid search on SurrealDB and injects top-N
 * relevant skills into the user's context — mimicking OmniUltraAgent's
 * "Pre-flight Injection" pattern to save agent tool calls.
 *
 * Guards:
 * - Only fires on `role === "user"` messages
 * - Only fires once per session (first meaningful prompt)
 * - Skips subagent/background sessions
 * - Skips system directive messages
 * - Skips very short prompts (<15 chars)
 * - Respects ContextBudget (MEDIUM priority — truncated when budget tight)
 * - Has a 3s timeout on SurrealDB search to never block the chat pipeline
 */
export function createPreflightSkillInjectorHook(
    ctx: PluginInput,
    experimentalConfig?: ExperimentalConfig,
    budget?: ContextBudget,
) {
    // Only enabled if explicitly enabled in experimental config
    const isEnabled = experimentalConfig?.preflight_skills === true
    if (!isEnabled) {
        return null
    }

    // Keep track of which sessions we've already injected into
    const injectedSessions = new Set<string>()

    return {
        "chat.message": async (
            input: { sessionID: string; agent?: string; model?: unknown },
            output: {
                message: Record<string, unknown>
                parts: Array<{ type: string; text?: string; [key: string]: unknown }>
            }
        ): Promise<void> => {
            // Guard: only user messages
            if (output.message.role !== "user") {
                return
            }

            // Guard: only fire once per session
            if (injectedSessions.has(input.sessionID)) {
                return
            }

            // Guard: skip background/subagent sessions — these have scoped tasks
            if (subagentSessions.has(input.sessionID)) {
                return
            }

            // Extract and clean prompt
            const rawText = extractPromptText(output.parts)
            if (isSystemDirective(rawText)) return

            const cleanText = removeCodeBlocks(removeSystemReminders(rawText)).trim()

            // Guard: trivial messages ("yes", "ok", "go ahead", "fix this")
            if (cleanText.length < MIN_PROMPT_LENGTH) {
                return
            }

            try {
                // Guard: check if brain DB is reachable
                if (!(await isBrainReachable())) {
                    return
                }

                // Query top skills with timeout to never block the chat pipeline
                const results = await Promise.race([
                    hybridSkillSearch(cleanText, undefined, MAX_SKILLS),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error("Preflight search timeout")), SEARCH_TIMEOUT_MS)
                    ),
                ])

                if (!results || results.length === 0) {
                    return
                }

                // Build injection content
                const skillContextBlocks = results.map(r => {
                    return `## Skill: ${r.name} (Auto-injected Preflight)\n\n**Description**: ${r.description}\n\n${r.content || "*No content*"}`
                })
                const joinedSkills = skillContextBlocks.join("\n\n---\n\n")
                const injectionText = `<injected_skills>\nHere are some automatically retrieved skills that might help with your task:\n\n${joinedSkills}\n</injected_skills>`

                // Context budget check: MEDIUM priority — will be truncated when budget > 60%
                if (budget) {
                    const tokens = estimateTokens(injectionText)
                    const allocation = budget.requestAllocation(
                        "preflight-skill-injector", InjectionPriority.MEDIUM, tokens, input.sessionID
                    )
                    if (!allocation.allowed) {
                        log("[preflight-skill-injector] Skipped (budget exhausted)", {
                            sessionID: input.sessionID,
                            requestedTokens: tokens,
                        })
                        // Still mark as injected so we don't retry
                        injectedSessions.add(input.sessionID)
                        return
                    }
                    budget.recordInjection("preflight-skill-injector", tokens, input.sessionID)
                }

                // Inject prepending to the text
                const textPartIndex = output.parts.findIndex((p) => p.type === "text" && p.text !== undefined)
                if (textPartIndex !== -1) {
                    const originalText = output.parts[textPartIndex].text
                    output.parts[textPartIndex].text = `${injectionText}\n\n${originalText}`

                    // Mark as injected
                    injectedSessions.add(input.sessionID)

                    log(`[preflight-skill-injector] Injected ${results.length} skills`, {
                        sessionID: input.sessionID,
                        skills: results.map(r => r.name),
                    })

                    // Fire a small toast notification
                    ctx.client.tui.showToast({
                        body: {
                            title: "⚡ Preflight Skills",
                            message: `Auto-injected: ${results.map(r => r.name).join(", ")}`,
                            variant: "info",
                            duration: 3000,
                        },
                    }).catch(() => { })
                }
            } catch (err) {
                log("[preflight-skill-injector] Failed to inject", {
                    error: String(err),
                    sessionID: input.sessionID,
                })
            }
        },

        /** Cleanup session tracking when a session is deleted. */
        clearSession(sessionID: string): void {
            injectedSessions.delete(sessionID)
        },
    }
}
