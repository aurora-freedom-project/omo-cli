/**
 * Input Guard — Prompt injection detection hook.
 *
 * Scans incoming chat messages for prompt injection patterns and PII leakage.
 * Must be registered BEFORE memoryCapture in the chat.message chain to prevent
 * auto-capturing injected prompts into permanent memory.
 *
 * Based on ruflo's AIDefence patterns (simplified).
 */

import { log } from "../../shared/logger"
import { detectThreats } from "./patterns"

/** Configuration for the input guard hook (matches InputGuardConfigSchema in schema.ts). */
export interface InputGuardConfig {
    enabled?: boolean
    /** "warn" = inject warning text, "block" = reserved for future use */
    mode?: "warn" | "block"
    /** Whether to include PII detection patterns (default: true) */
    pii_detection?: boolean
}

interface ChatMessageInput {
    sessionID: string
    agent?: string
    messageID?: string
}

interface ChatMessageOutput {
    message: Record<string, unknown>
    parts: Array<{ type: string; text?: string; [key: string]: unknown }>
}

/**
 * Creates the input guard hook.
 *
 * @param config - Configuration for the hook
 * @returns Hook object with chat.message handler, or null if disabled
 */
export function createInputGuardHook(config?: InputGuardConfig) {
    if (config?.enabled === false) return null

    const mode = config?.mode ?? "warn"
    const piiEnabled = config?.pii_detection !== false

    return {
        "chat.message": async (
            input: ChatMessageInput,
            output: ChatMessageOutput
        ): Promise<void> => {
            const text = output.parts
                .filter(p => p.type === "text" && p.text)
                .map(p => p.text!)
                .join("\n")

            // Skip very short messages (not enough to be a threat)
            if (!text || text.length < 10) return

            const threats = detectThreats(text, { pii: piiEnabled })

            if (threats.length === 0) return

            const uniqueTypes = [...new Set(threats.map(t => t.type))]
            const hasCritical = threats.some(t => t.severity === "critical")

            log("[input-guard] Threats detected", {
                count: threats.length,
                types: uniqueTypes,
                severities: threats.map(t => t.severity),
                sessionID: input.sessionID,
                agent: input.agent,
            })

            if (mode === "warn") {
                const severityLabel = hasCritical ? "🔴 CRITICAL" : "⚠️ WARNING"
                output.parts.push({
                    type: "text",
                    text: `\n\n${severityLabel} [OMO Security] Potential prompt injection detected: ${uniqueTypes.join(", ")}. Proceeding with caution.`,
                })
            }
            // "block" mode: future — could throw or clear output.parts
        },
    }
}
