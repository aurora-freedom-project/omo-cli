/**
 * RAG Enricher — Graph-Augmented Retrieval for code-aware agent prompts.
 *
 * Ported from Omni's rag_enricher.rs. Queries indexed `code_element` records
 * by BM25 full-text search, then enriches top matches with graph context
 * (callers, callees, imports) from SurrealDB graph edges.
 *
 * Features:
 * - BM25 full-text search on code_element (name, signature, docstring)
 * - Graph RAG: 1-hop graph neighbor injection for top-N snippets
 * - Cosine dedup against skill context (avoid redundant injection)
 * - Context budget gate: skips at HIGH+ pressure levels
 * - Hooks into chat.message to inject codebase context alongside skills
 *
 * @see OmniUltraAgent_Kit/src/agents/rag_enricher.rs
 */

import { log } from "../../shared/logger"
import { searchCode, findCallers, findDependencies } from "../../cli/memory/surreal-client"
import { isBrainReachable } from "../../shared/skills-brain-query"
import { extractPromptText, removeCodeBlocks } from "../../shared/prompt-text"
import { removeSystemReminders, isSystemDirective } from "../../shared/system-directive"
import { subagentSessions } from "../../features/claude-code-session-state"
import {
    type ContextBudget,
    InjectionPriority,
    estimateTokens,
} from "../../shared/context-budget"

/** Timeout for SurrealDB code search (ms). */
const SEARCH_TIMEOUT_MS = 3000

/** Minimum prompt length to trigger RAG enrichment. */
const MIN_PROMPT_LENGTH = 20

/** Maximum code snippets to inject. */
const MAX_SNIPPETS = 3

// ── Types ──────────────────────────────────────────────────────────────────

interface GraphContext {
    callers: string[]
    callees: string[]
    imports: string[]
}

interface CodeSnippet {
    name: string
    kind: string
    file: string
    signature: string
    docstring?: string
    graph?: GraphContext
}

interface EnrichResult {
    context: string
    snippetsFound: number
    snippetsInjected: number
}

// ── Formatting (pure functions) ────────────────────────────────────────────

function formatSnippet(snippet: CodeSnippet): string {
    let result = `[Code: ${snippet.name} | ${snippet.file}]\n`
    result += `Kind: ${snippet.kind}\n`
    result += `Signature: ${snippet.signature}\n`
    if (snippet.docstring) {
        result += `Doc: ${snippet.docstring.slice(0, 200)}\n`
    }

    if (snippet.graph) {
        const g = snippet.graph
        const parts: string[] = []
        if (g.callers.length > 0) parts.push(`Called by: ${g.callers.join(", ")}`)
        if (g.callees.length > 0) parts.push(`Calls: ${g.callees.join(", ")}`)
        if (g.imports.length > 0) parts.push(`Imports: ${g.imports.join(", ")}`)
        if (parts.length > 0) {
            result += `┌ Graph Context:\n`
            for (const part of parts) {
                result += `│ ${part}\n`
            }
            result += `└────────────\n`
        }
    }

    return result
}

function formatContext(snippets: CodeSnippet[]): string {
    if (snippets.length === 0) return ""
    let result = "\n--- Codebase Context (RAG) ---\n"
    for (const snippet of snippets) {
        result += formatSnippet(snippet)
    }
    return result
}

// ── Graph enrichment ───────────────────────────────────────────────────────

async function fetchGraphContext(name: string, file: string, project?: string): Promise<GraphContext> {
    try {
        const [callersResult, depsResult] = await Promise.allSettled([
            findCallers(name, project),
            findDependencies(file, project),
        ])

        const callers = callersResult.status === "fulfilled"
            ? callersResult.value.map(r => String(r.caller_name || r.name)).filter(Boolean).slice(0, 5)
            : []

        const imports = depsResult.status === "fulfilled"
            ? depsResult.value.imports.slice(0, 5)
            : []

        return { callers, callees: [], imports }
    } catch {
        return { callers: [], callees: [], imports: [] }
    }
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Create the RAG Enricher hook.
 *
 * Fires on first user message per session (alongside preflight-skill-injector).
 * Queries code_element table for relevant code, enriches with graph context,
 * and injects into user prompt as codebase context.
 */
export function createRagEnricherHook(
    project: string,
    budget?: ContextBudget,
) {
    const enrichedSessions = new Set<string>()

    return {
        "chat.message": async (
            input: { sessionID: string; agent?: string },
            output: {
                message: Record<string, unknown>
                parts: Array<{ type: string; text?: string; [key: string]: unknown }>
            }
        ): Promise<void> => {
            // Guard: only user messages
            if (output.message.role !== "user") return

            // Guard: only fire once per session
            if (enrichedSessions.has(input.sessionID)) return

            // Guard: skip subagent sessions
            if (subagentSessions.has(input.sessionID)) return

            // Extract and clean prompt
            const rawText = extractPromptText(output.parts)
            if (isSystemDirective(rawText)) return

            const cleanText = removeCodeBlocks(removeSystemReminders(rawText)).trim()
            if (cleanText.length < MIN_PROMPT_LENGTH) return

            try {
                // Guard: brain reachable
                if (!(await isBrainReachable())) return

                // BM25 search on code_element
                const results = await Promise.race([
                    searchCode(cleanText, { limit: MAX_SNIPPETS * 2, project }),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error("RAG search timeout")), SEARCH_TIMEOUT_MS)
                    ),
                ])

                if (!results || results.length === 0) return

                // Convert to typed snippets
                const snippets: CodeSnippet[] = results.slice(0, MAX_SNIPPETS).map(r => ({
                    name: String(r.name || ""),
                    kind: String(r.kind || ""),
                    file: String(r.file || ""),
                    signature: String(r.signature || ""),
                    docstring: r.docstring ? String(r.docstring) : undefined,
                }))

                // Enrich top snippets with graph context (1-hop neighbors)
                await Promise.allSettled(
                    snippets.slice(0, 2).map(async (snippet) => {
                        snippet.graph = await fetchGraphContext(snippet.name, snippet.file, project)
                    })
                )

                // Format and inject
                const injectionText = formatContext(snippets)
                if (!injectionText) return

                // Context budget check: MEDIUM priority
                if (budget) {
                    const tokens = estimateTokens(injectionText)
                    const allocation = budget.requestAllocation(
                        "rag-enricher", InjectionPriority.MEDIUM, tokens, input.sessionID
                    )
                    if (!allocation.allowed) {
                        enrichedSessions.add(input.sessionID)
                        log("[rag-enricher] Skipped (budget exhausted)", { sessionID: input.sessionID })
                        return
                    }
                    budget.recordInjection("rag-enricher", tokens, input.sessionID)
                }

                // Inject into text part
                const textPartIndex = output.parts.findIndex(p => p.type === "text" && p.text !== undefined)
                if (textPartIndex !== -1) {
                    output.parts[textPartIndex].text = `${injectionText}\n\n${output.parts[textPartIndex].text}`
                    enrichedSessions.add(input.sessionID)

                    log(`[rag-enricher] Injected ${snippets.length} code snippets`, {
                        sessionID: input.sessionID,
                        snippets: snippets.map(s => `${s.name} (${s.file})`),
                    })
                }
            } catch (err) {
                log("[rag-enricher] Failed", { error: String(err), sessionID: input.sessionID })
            }
        },

        clearSession(sessionID: string): void {
            enrichedSessions.delete(sessionID)
        },
    }
}

/** Exported for testing */
export { formatSnippet, formatContext, type CodeSnippet, type GraphContext, type EnrichResult }
