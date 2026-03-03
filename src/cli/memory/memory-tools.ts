import type { PluginInput } from "@opencode-ai/plugin"
import { Effect } from "effect"
import { log } from "../../shared/logger"
import { addConcept, searchSimilar, graphTraverse, initSchema, configureSurreal } from "./surreal-client"
import { generateEmbedding } from "./embedder"
import { ensureSurrealDBRunning } from "./docker-manager"
import type { MemoryConfig } from "../../config/schema"

export interface Tool {
    description: string
    parameters: {
        type: string
        properties: Record<string, { type: string; description: string; items?: unknown; enum?: string[] }>
        required: string[]
    }
    execute: (args: Record<string, unknown>) => Promise<string>
}

let schemaInitialized = false

async function ensureReady(config: MemoryConfig) {
    // Configure connection based on mode
    if (config.mode === "external") {
        const port = config.port ?? 18000
        configureSurreal({
            url: config.url ?? `http://127.0.0.1:${port}/rpc`,
            user: config.user ?? "root",
            pass: config.pass ?? "omo-secret",
            namespace: config.namespace ?? "omo",
            database: config.database ?? "memory",
        })
        log("[memory-tools] External mode — skipping Docker, connecting to existing service")
    } else {
        // Managed mode: configure with managed defaults, start Docker if needed
        const port = config.port ?? 18000
        configureSurreal({
            url: `http://127.0.0.1:${port}/rpc`,
            user: config.user ?? "root",
            pass: config.pass ?? "omo-secret",
            namespace: config.namespace ?? "omo",
            database: config.database ?? "memory",
        })
        await ensureSurrealDBRunning(config)
    }

    if (!schemaInitialized) {
        await initSchema()
        schemaInitialized = true
    }
}

export function createMemoryTools(
    ctx: PluginInput,
    config: MemoryConfig
): Record<string, Tool> {
    const project = ctx.directory

    const memory_add: Tool = {
        description:
            "Store a key concept, decision, pattern, or insight into the persistent project memory. Use this when you discover important architectural decisions, recurring patterns, project conventions, or non-obvious facts that would be valuable to remember across sessions.",
        parameters: {
            type: "object",
            properties: {
                content: {
                    type: "string",
                    description: "The concept or insight to remember (1-3 sentences)",
                },
                tags: {
                    type: "array",
                    description: "Relevant tags for categorization (e.g. ['architecture', 'typescript', 'database'])",
                    items: { type: "string" },
                },
                source: {
                    type: "string",
                    description: "Origin of this knowledge",
                    enum: ["user", "auto", "code-analysis"],
                },
            },
            required: ["content", "tags"],
        },
        execute: async (args) => {
            return Effect.runPromise(
                Effect.tryPromise({
                    try: async () => {
                        if (!config.enabled) return "Memory is disabled in config."
                        await ensureReady(config)

                        const content = args.content as string
                        const tags = (args.tags as string[]) ?? []
                        const source = (args.source as string) ?? "user"

                        const embedding = await generateEmbedding(content)
                        const id = await addConcept({ content, tags, embedding, source, project })

                        log("[memory_add] Concept stored", { id, tags })
                        return `✓ Memory stored (${id}). Tags: ${tags.join(", ")}`
                    },
                    catch: (err) => err,
                }).pipe(Effect.catchAll((err) => {
                    log("[memory_add] error", { err })
                    return Effect.succeed(`Memory storage failed: ${err instanceof Error ? err.message : String(err)}`)
                }))
            )
        },
    }

    const memory_search: Tool = {
        description:
            "Search the persistent project memory for concepts similar to a query. Use this at the start of a session, before making architectural decisions, or when you need to recall past decisions.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Natural language query to search memory",
                },
                limit: {
                    type: "string",
                    description: "Maximum number of results to return (default: 5)",
                },
            },
            required: ["query"],
        },
        execute: async (args) => {
            return Effect.runPromise(
                Effect.tryPromise({
                    try: async () => {
                        if (!config.enabled) return "Memory is disabled in config."
                        await ensureReady(config)

                        const query = args.query as string
                        const limit = parseInt((args.limit as string) ?? "5", 10)

                        const embedding = await generateEmbedding(query)
                        const results = await searchSimilar(embedding, limit, project)

                        if (results.length === 0) {
                            return "No relevant memories found."
                        }

                        const formatted = results
                            .map(
                                (r, i) =>
                                    `${i + 1}. [score: ${r.score.toFixed(3)}] ${r.content}\n   Tags: ${r.tags.join(", ")}`
                            )
                            .join("\n\n")

                        return `Found ${results.length} relevant memories:\n\n${formatted}`
                    },
                    catch: (err) => err,
                }).pipe(Effect.catchAll((err) => {
                    log("[memory_search] error", { err })
                    return Effect.succeed(`Memory search failed: ${err instanceof Error ? err.message : String(err)}`)
                }))
            )
        },
    }

    const memory_graph: Tool = {
        description:
            "Traverse the knowledge graph to find related concepts, files, and patterns connected to a specific memory node.",
        parameters: {
            type: "object",
            properties: {
                concept_id: {
                    type: "string",
                    description: "The concept ID to traverse from (e.g. concept:abc123)",
                },
                depth: {
                    type: "string",
                    description: "Graph traversal depth (default: 2, max: 5)",
                },
            },
            required: ["concept_id"],
        },
        execute: async (args) => {
            return Effect.runPromise(
                Effect.tryPromise({
                    try: async () => {
                        if (!config.enabled) return "Memory is disabled in config."
                        await ensureReady(config)

                        const conceptId = args.concept_id as string
                        const depth = parseInt((args.depth as string) ?? "2", 10)

                        const results = await graphTraverse(conceptId, Math.min(depth, 5))

                        if (results.length === 0) {
                            return "No connected concepts found."
                        }

                        const formatted = results
                            .map((r, i) => `${i + 1}. ${r.content}\n   Tags: ${r.tags.join(", ")}`)
                            .join("\n\n")

                        return `Found ${results.length} related concepts:\n\n${formatted}`
                    },
                    catch: (err) => err,
                }).pipe(Effect.catchAll((err) => {
                    log("[memory_graph] error", { err })
                    return Effect.succeed(`Graph traversal failed: ${err instanceof Error ? err.message : String(err)}`)
                }))
            )
        },
    }

    const memory_link: Tool = {
        description:
            "Create a directed relationship between two existing concept entries in the memory graph. Use this to construct knowledge graphs linking related decisions, architectures, or principles. Note: you need the concept_id returned by memory_add or memory_search.",
        parameters: {
            type: "object",
            properties: {
                source_id: {
                    type: "string",
                    description: "The originating concept ID (e.g. concept:abc123)",
                },
                target_id: {
                    type: "string",
                    description: "The destination concept ID (e.g. concept:xyz789)",
                },
                relation_type: {
                    type: "string",
                    description: "The semantic relationship between the two concepts (e.g. 'depends_on', 'implements', 'contradicts')",
                },
            },
            required: ["source_id", "target_id", "relation_type"],
        },
        execute: async (args) => {
            return Effect.runPromise(
                Effect.tryPromise({
                    try: async () => {
                        if (!config.enabled) return "Memory is disabled in config."
                        await ensureReady(config)

                        const sourceId = args.source_id as string
                        const targetId = args.target_id as string
                        const relationType = args.relation_type as string

                        const { linkConcepts } = await import("./surreal-client")
                        await linkConcepts(sourceId, targetId, relationType)

                        return `✓ Successfully linked concepts: ${sourceId} -[${relationType}]-> ${targetId}`
                    },
                    catch: (err) => err,
                }).pipe(Effect.catchAll((err) => {
                    log("[memory_link] error", { err })
                    return Effect.succeed(`Failed to link concepts: ${err instanceof Error ? err.message : String(err)}`)
                }))
            )
        },
    }

    return { memory_add, memory_search, memory_graph, memory_link }
}
