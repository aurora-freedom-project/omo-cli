import { log } from "../../shared/logger"
import { addConcept, searchSimilar } from "../../cli/memory/surreal-client"
import { generateEmbedding } from "../../cli/memory/embedder"
import type { MemoryConfig } from "../../config/schema"

interface ChatMessageInput {
    sessionID: string
    agent?: string
    messageID?: string
}

interface ChatMessageOutput {
    message: Record<string, unknown>
    parts: Array<{ type: string; text?: string;[key: string]: unknown }>
}

// Patterns that signal important architectural/decision content
const DECISION_PATTERNS = [
    /\b(decided|decision|choose|using|pattern|architecture|convention|rule|always|never|must|should|avoid)\b/i,
    /\b(important|note|remember|key|critical|crucial)\b/i,
    /\b(because|reason|therefore|so that|in order to)\b/i,
]

const MIN_CONTENT_LENGTH = 30
const MAX_CONTENT_LENGTH = 500
const SIMILARITY_THRESHOLD = 0.92 // Skip if almost duplicate exists

function isWorthCapturing(text: string): boolean {
    if (text.length < MIN_CONTENT_LENGTH) return false
    return DECISION_PATTERNS.some((p) => p.test(text))
}

function extractKeyInsights(text: string): string[] {
    // Split by newlines, filter for insightful sentences
    const sentences = text
        .split(/[.\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= MIN_CONTENT_LENGTH && s.length <= MAX_CONTENT_LENGTH)
        .filter(isWorthCapturing)
        .slice(0, 3) // Max 3 insights per message

    return sentences
}

function extractTags(text: string, agent?: string): string[] {
    const tags: string[] = []

    if (agent) tags.push(agent)

    const techPatterns: [RegExp, string][] = [
        [/typescript|ts\b/i, "typescript"],
        [/react|nextjs|next\.js/i, "react"],
        [/database|sql|postgres|supabase/i, "database"],
        [/api|rest|graphql/i, "api"],
        [/test|spec|vitest|jest/i, "testing"],
        [/auth|authentication|login/i, "auth"],
        [/docker|container/i, "docker"],
        [/security|permission|access/i, "security"],
        [/architecture|design|pattern/i, "architecture"],
        [/performance|optimize|speed/i, "performance"],
    ]

    for (const [pattern, tag] of techPatterns) {
        if (pattern.test(text)) tags.push(tag)
    }

    return [...new Set(tags)]
}

export function createMemoryCaptureHook(config: MemoryConfig, directory: string) {
    if (!config.enabled || !config.auto_capture) {
        log("[memory-capture] Hook disabled (memory.enabled or auto_capture is false)")
        return null
    }

    return {
        "chat.message": async (
            input: ChatMessageInput,
            output: ChatMessageOutput
        ): Promise<void> => {
            try {
                const promptText = output.parts
                    .filter((p) => p.type === "text" && p.text)
                    .map((p) => p.text)
                    .join("\n")
                    .trim()

                if (!promptText) return

                const insights = extractKeyInsights(promptText)
                if (insights.length === 0) return

                for (const insight of insights) {
                    // Deduplicate: check if very similar concept already exists
                    const embedding = await generateEmbedding(insight)
                    const similar = await searchSimilar(embedding, 1, directory)

                    if (similar.length > 0 && similar[0].score >= SIMILARITY_THRESHOLD) {
                        log("[memory-capture] Skipping duplicate concept", {
                            score: similar[0].score,
                            sessionID: input.sessionID,
                        })
                        continue
                    }

                    const tags = extractTags(promptText, input.agent)

                    await addConcept({
                        content: insight,
                        tags,
                        embedding,
                        source: "auto",
                        project: directory,
                    })

                    log("[memory-capture] Auto-captured insight", {
                        length: insight.length,
                        tags,
                        sessionID: input.sessionID,
                    })
                }
            } catch (err) {
                // Silent — never break the chat pipeline
                log("[memory-capture] Error (ignored)", { err })
            }
        },
    }
}
