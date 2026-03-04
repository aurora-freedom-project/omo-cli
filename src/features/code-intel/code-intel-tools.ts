import type { PluginInput } from "@opencode-ai/plugin"
import { Effect } from "effect"
import {
    searchCode,
    findCallers,
    findDependencies,
    getCodeOverview,
    isConnected,
    initSchema,
    configureSurreal,
} from "../../cli/memory/surreal-client"
import type { MemoryConfig } from "../../config/schema"
import { log } from "../../shared/logger"
import { basename } from "path"

// ---------------------------------------------------------------------------
// Types — Tool interface matches memory-tools.ts pattern
// ---------------------------------------------------------------------------

interface Tool {
    description: string
    parameters: {
        type: string
        required?: string[]
        properties: Record<string, unknown>
    }
    execute: (args: Record<string, unknown>) => Promise<string>
}

// ---------------------------------------------------------------------------
// Ensure SurrealDB is ready
// ---------------------------------------------------------------------------

let schemaInitialized = false

async function ensureReady(config: MemoryConfig): Promise<boolean> {
    return Effect.runPromise(
        Effect.tryPromise({
            try: async () => {
                const port = config.port ?? 18000
                if (config.mode === "external") {
                    configureSurreal({
                        url: config.url ?? `http://127.0.0.1:${port}/rpc`,
                        user: config.user ?? "root",
                        pass: config.pass ?? "omo-secret",
                        namespace: config.namespace ?? "omo",
                        database: config.database ?? "memory",
                    })
                } else {
                    configureSurreal({
                        url: `http://127.0.0.1:${port}/rpc`,
                        user: config.user ?? "root",
                        pass: config.pass ?? "omo-secret",
                        namespace: config.namespace ?? "omo",
                        database: config.database ?? "memory",
                    })
                }

                const connected = await isConnected()
                if (!connected) return false

                if (!schemaInitialized) {
                    await initSchema()
                    schemaInitialized = true
                }
                return true
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
    )
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createCodeIntelTools(
    ctx: PluginInput,
    config: MemoryConfig
): Record<string, Tool> {
    const project = basename(ctx.directory)

    const code_search: Tool = {
        description: "Search the pre-indexed codebase for functions, classes, interfaces, and types by name or description. Uses BM25 full-text search — faster and more precise than grep for code navigation. Requires 'omo-cli index' to have been run.",
        parameters: {
            type: "object",
            required: ["query"],
            properties: {
                query: {
                    type: "string",
                    description: "Search query — function name, class name, or descriptive words",
                },
                kind: {
                    type: "string",
                    description: "Optional filter: 'function', 'class', 'method', 'interface', 'type'",
                },
                limit: {
                    type: "number",
                    description: "Max results (default: 10)",
                },
            },
        },
        execute: async (args) => {
            const ready = await ensureReady(config)
            if (!ready) return "Code intelligence unavailable. SurrealDB not connected. Run 'omo-cli memory start' and 'omo-cli index'."

            return Effect.runPromise(
                Effect.tryPromise({
                    try: async () => {
                        const results = await searchCode(args.query as string, {
                            kind: args.kind as string | undefined,
                            limit: (args.limit ?? 10) as number,
                            project,
                        })

                        if (results.length === 0) {
                            return `No results found for "${args.query}". Make sure 'omo-cli index' has been run.`
                        }

                        return results.map((r: Record<string, unknown>) =>
                            `${r.kind} ${r.name} (${r.file}:${r.line_start})\n  ${r.signature}${r.docstring ? "\n  " + r.docstring : ""}`
                        ).join("\n\n")
                    },
                    catch: (err) => err,
                }).pipe(Effect.catchAll((err) => {
                    log("[code-intel] search failed", { err })
                    return Effect.succeed(`Search error: ${err}`)
                }))
            )
        },
    }

    const code_callers: Tool = {
        description: "Find all functions that CALL a given function. Essential for impact analysis before modifying code — shows the 'blast radius' of a change. Requires 'omo-cli index' to have been run.",
        parameters: {
            type: "object",
            required: ["name"],
            properties: {
                name: {
                    type: "string",
                    description: "Function or method name to find callers of",
                },
            },
        },
        execute: async (args) => {
            const ready = await ensureReady(config)
            if (!ready) return "Code intelligence unavailable. SurrealDB not connected."

            return Effect.runPromise(
                Effect.tryPromise({
                    try: async () => {
                        const results = await findCallers(args.name as string, project)

                        if (results.length === 0) {
                            return `No callers found for "${args.name}". Note: call relationships are best-effort based on AST analysis.`
                        }

                        return `${results.length} callers of "${args.name}":\n` +
                            results.map((r: Record<string, unknown>) =>
                                `  ${r.kind ?? r.caller_kind} ${r.name ?? r.caller_name} (${r.file ?? r.caller_file}:${r.line_start ?? r.caller_line})`
                            ).join("\n")
                    },
                    catch: (err) => err,
                }).pipe(Effect.catchAll((err) => {
                    log("[code-intel] callers query failed", { err })
                    return Effect.succeed(`Callers query error: ${err}`)
                }))
            )
        },
    }

    const code_deps: Tool = {
        description: "Show import/export relationships for a file — what it imports and what imports it. Use to understand module boundaries and dependency structure. Requires 'omo-cli index' to have been run.",
        parameters: {
            type: "object",
            required: ["file"],
            properties: {
                file: {
                    type: "string",
                    description: "Relative file path to analyze (e.g., 'src/auth/handler.ts')",
                },
            },
        },
        execute: async (args) => {
            const ready = await ensureReady(config)
            if (!ready) return "Code intelligence unavailable. SurrealDB not connected."

            return Effect.runPromise(
                Effect.tryPromise({
                    try: async () => {
                        const deps = await findDependencies(args.file as string, project)

                        const lines = [`File: ${args.file}\n`]
                        lines.push(`Imports (${deps.imports.length}):`)
                        for (const imp of deps.imports) {
                            lines.push(`  → ${imp}`)
                        }
                        lines.push(`\nImported by (${deps.importedBy.length}):`)
                        for (const by of deps.importedBy) {
                            lines.push(`  ← ${by}`)
                        }

                        return lines.join("\n")
                    },
                    catch: (err) => err,
                }).pipe(Effect.catchAll((err) => {
                    log("[code-intel] deps query failed", { err })
                    return Effect.succeed(`Dependencies query error: ${err}`)
                }))
            )
        },
    }

    const code_overview: Tool = {
        description: "Get a structural overview of the indexed project — file count, element counts by kind (functions, classes, interfaces, types), and number of exported symbols. Requires 'omo-cli index' to have been run.",
        parameters: {
            type: "object",
            properties: {},
        },
        execute: async () => {
            const ready = await ensureReady(config)
            if (!ready) return "Code intelligence unavailable. SurrealDB not connected."

            return Effect.runPromise(
                Effect.tryPromise({
                    try: async () => {
                        const overview = await getCodeOverview(project)

                        const lines = [
                            `Project Index Overview:`,
                            `  Files: ${overview.fileCount}`,
                            `  Exported symbols: ${overview.exportCount}`,
                            ``,
                            `Elements by kind:`,
                        ]
                        for (const { kind, count } of overview.elementCounts) {
                            lines.push(`  ${kind}: ${count}`)
                        }

                        if (overview.fileCount === 0) {
                            lines.push(`\nNo files indexed yet. Run 'omo-cli index' to build the code intelligence index.`)
                        }

                        return lines.join("\n")
                    },
                    catch: (err) => err,
                }).pipe(Effect.catchAll((err) => {
                    log("[code-intel] overview query failed", { err })
                    return Effect.succeed(`Overview query error: ${err}`)
                }))
            )
        },
    }

    log("[code-intel-tools] Code intelligence tools registered", { project })

    return { code_search, code_callers, code_deps, code_overview }
}
