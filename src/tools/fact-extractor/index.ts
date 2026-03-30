/**
 * Fact Extractor — Ollama-powered Knowledge Graph extraction.
 *
 * Ported from Omni's fact_extractor.rs. Sends text to a local Ollama model
 * and asks it to return JSON with entities and relations for building
 * knowledge graphs.
 *
 * Features:
 * - Entity extraction (Concepts, Tools, Files, People, Patterns)
 * - Relation extraction (DEPENDS_ON, CREATES, USES, RELATED_TO)
 * - Pure JSON parsing fallback (no LLM needed for validation)
 * - OpenCode tool interface for on-demand extraction
 *
 * @see OmniUltraAgent_Kit/src/agents/fact_extractor.rs
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export interface Entity {
    name: string
    type: string
    description?: string
}

export interface Relation {
    source: string
    target: string
    relation: string
}

export interface ExtractedFact {
    entities: Entity[]
    relations: Relation[]
}

// ── System Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Knowledge Graph Extractor.
Identify key *Entities* (Concepts, Tools, Files, People, architectural patterns)
and *Relations* between them from the user's text.

Output STRICT JSON only. No markdown code blocks. No preamble.

Format:
{
  "entities": [
    {"name": "EntityName", "type": "Category", "description": "Short summary"}
  ],
  "relations": [
    {"source": "EntityName1", "target": "EntityName2", "relation": "DEPENDS_ON|CREATES|USES|RELATED_TO"}
  ]
}`

// ── Core Logic (Pure) ──────────────────────────────────────────────────────

/**
 * Parse extracted facts from raw JSON string.
 * Pure function — no I/O.
 */
export function parseFacts(json: string): ExtractedFact {
    const parsed = JSON.parse(json)

    // Validate structure
    if (!Array.isArray(parsed.entities)) {
        throw new Error("Missing 'entities' array")
    }
    if (!Array.isArray(parsed.relations)) {
        throw new Error("Missing 'relations' array")
    }

    return {
        entities: parsed.entities.map((e: Record<string, unknown>) => ({
            name: String(e.name || ""),
            type: String(e.type || "unknown"),
            description: e.description ? String(e.description) : undefined,
        })),
        relations: parsed.relations.map((r: Record<string, unknown>) => ({
            source: String(r.source || ""),
            target: String(r.target || ""),
            relation: String(r.relation || "RELATED_TO"),
        })),
    }
}

/**
 * Format extracted facts as a human-readable summary.
 */
export function formatFacts(facts: ExtractedFact): string {
    if (facts.entities.length === 0 && facts.relations.length === 0) {
        return "No entities or relations extracted."
    }

    const lines: string[] = [
        `📊 Knowledge Graph: ${facts.entities.length} entities, ${facts.relations.length} relations`,
        "",
        "Entities:",
    ]

    for (const e of facts.entities) {
        lines.push(`  • ${e.name} [${e.type}]${e.description ? ` — ${e.description}` : ""}`)
    }

    if (facts.relations.length > 0) {
        lines.push("", "Relations:")
        for (const r of facts.relations) {
            lines.push(`  ${r.source} —[${r.relation}]→ ${r.target}`)
        }
    }

    return lines.join("\n")
}

// ── I/O: Ollama Extraction ─────────────────────────────────────────────────

/**
 * Extract facts from text using a local Ollama model.
 */
export async function extractFactsViaOllama(
    text: string,
    ollamaUrl: string,
    model: string = "llama3.2",
): Promise<ExtractedFact> {
    const url = `${ollamaUrl.replace(/\/+$/, "")}/api/generate`

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            prompt: text,
            system: SYSTEM_PROMPT,
            format: "json",
            stream: false,
        }),
        signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`)
    }

    const data = await response.json() as { response?: string }
    const rawJson = data.response || ""

    return parseFacts(rawJson)
}

// ── Tool ───────────────────────────────────────────────────────────────────

export function createFactExtractor(ollamaUrl?: string): ToolDefinition {
    const baseUrl = ollamaUrl || process.env.OLLAMA_HOST || "http://localhost:11434"

    return tool({
        description:
            "Extract entities and relations from text using an Ollama model. " +
            "Builds a knowledge graph from natural language. Returns entities and relations in structured format. " +
            "Ported from Omni's Fact Extractor.",
        args: {
            text: tool.schema.string().describe("Text to extract facts from."),
            model: tool.schema.string().optional().describe("Ollama model to use (default: llama3.2)."),
        },
        execute: async (args): Promise<string> => {
            const text = args.text?.trim()
            if (!text) return "Error: Missing 'text' parameter"
            if (text.length < 20) return "Error: Text too short for meaningful extraction (min 20 chars)"

            const model = args.model || "llama3.2"

            try {
                const facts = await extractFactsViaOllama(text, baseUrl, model)

                log("[fact-extractor] Extracted", {
                    entities: facts.entities.length,
                    relations: facts.relations.length,
                    model,
                })

                return formatFacts(facts)
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err)

                if (errorMsg.includes("fetch") || errorMsg.includes("ECONNREFUSED")) {
                    return `Error: Cannot connect to Ollama at ${baseUrl}. Is Ollama running?`
                }
                if (errorMsg.includes("JSON")) {
                    return `Error: Model returned invalid JSON. Try a different model or more specific text.\n\nRaw error: ${errorMsg}`
                }

                return `Error: ${errorMsg}`
            }
        },
    })
}
