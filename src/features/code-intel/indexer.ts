import { spawnSync } from "child_process"
import { readFileSync, existsSync } from "fs"
import { resolve, relative, basename } from "path"
import { log } from "../../shared/logger"
import { parseFile, computeFileHash, getLanguage } from "./code-parser"
import {
    addCodeElement,
    addCodeRelation,
    clearCodeIndex,
    getIndexedFiles,
    initSchema,
    isConnected,
    type CodeElement,
} from "../../cli/memory/surreal-client"
import { generateEmbedding } from "../../cli/memory/embedder"
import { LANG_EXTENSIONS } from "../../tools/ast-grep/constants"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IndexOptions {
    projectDir: string
    project?: string        // defaults to basename of projectDir
    useVectors?: boolean    // generate embeddings (requires omo-memory)
    rebuild?: boolean       // clear existing index, full re-parse
}

export interface IndexResult {
    filesScanned: number
    filesSkipped: number    // unchanged files (incremental)
    elementsIndexed: number
    relationsIndexed: number
    durationMs: number
    errors: string[]
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function getTrackedFiles(projectDir: string): string[] {
    try {
        const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
            cwd: projectDir,
            encoding: "utf-8",
            timeout: 30000,
        })

        if (result.status !== 0 || !result.stdout) {
            log("[indexer] git ls-files failed, falling back to basic file scan")
            return []
        }

        return result.stdout
            .split("\n")
            .map(f => f.trim())
            .filter(Boolean)
    } catch (err) {
        log("[indexer] Failed to list tracked files", { err })
        return []
    }
}

function filterByLanguage(files: string[]): string[] {
    const allExtensions = new Set<string>()
    for (const exts of Object.values(LANG_EXTENSIONS)) {
        for (const ext of exts as string[]) {
            allExtensions.add(ext)
        }
    }

    return files.filter(f => {
        const ext = "." + f.split(".").pop()?.toLowerCase()
        return allExtensions.has(ext)
    })
}

// ---------------------------------------------------------------------------
// Main indexer
// ---------------------------------------------------------------------------

export async function indexProject(options: IndexOptions): Promise<IndexResult> {
    const startTime = Date.now()
    const {
        projectDir,
        project = basename(projectDir),
        useVectors = false,
        rebuild = false,
    } = options

    const result: IndexResult = {
        filesScanned: 0,
        filesSkipped: 0,
        elementsIndexed: 0,
        relationsIndexed: 0,
        durationMs: 0,
        errors: [],
    }

    // Check SurrealDB connection
    const connected = await isConnected()
    if (!connected) {
        result.errors.push("SurrealDB not connected. Run 'omo-cli memory start' first.")
        result.durationMs = Date.now() - startTime
        return result
    }

    // Initialize schema
    await initSchema()

    // Rebuild: clear existing index
    if (rebuild) {
        log("[indexer] Rebuild requested — clearing existing index", { project })
        await clearCodeIndex(project)
    }

    // Get existing file hashes for incremental indexing
    const existingFiles = rebuild ? [] : await getIndexedFiles(project)
    const existingHashMap = new Map(existingFiles.map(f => [f.file, f.fileHash]))

    // Discover files
    const allFiles = getTrackedFiles(projectDir)
    if (allFiles.length === 0) {
        result.errors.push("No tracked files found. Is this a git repository?")
        result.durationMs = Date.now() - startTime
        return result
    }

    const codeFiles = filterByLanguage(allFiles)
    log("[indexer] Files discovered", {
        total: allFiles.length,
        code: codeFiles.length,
        project,
    })

    // Process each file
    for (const relPath of codeFiles) {
        const absPath = resolve(projectDir, relPath)

        if (!existsSync(absPath)) continue

        try {
            const content = readFileSync(absPath, "utf-8")
            const hash = computeFileHash(content)

            // Incremental: skip unchanged files
            if (existingHashMap.get(relPath) === hash) {
                result.filesSkipped++
                continue
            }

            result.filesScanned++

            // Parse the file
            const parseResult = parseFile(relPath, content, project)

            // Store elements
            for (const element of parseResult.elements) {
                try {
                    // Generate embedding if vector mode
                    if (useVectors) {
                        const embeddingText = [element.name, element.signature, element.docstring]
                            .filter(Boolean)
                            .join(" ")
                        element.embedding = await generateEmbedding(embeddingText)
                    }

                    await addCodeElement(element)
                    result.elementsIndexed++
                } catch (err) {
                    result.errors.push(`Failed to store element ${element.name} in ${relPath}: ${err}`)
                }
            }

            // Store relations
            for (const relation of parseResult.relations) {
                try {
                    await addCodeRelation(relation.sourceId, relation.targetId, relation.kind)
                    result.relationsIndexed++
                } catch (err) {
                    // Relations may fail if target element doesn't exist yet — that's OK
                    log("[indexer] Relation store skipped", { relation, err })
                }
            }
        } catch (err) {
            result.errors.push(`Failed to process ${relPath}: ${err}`)
        }
    }

    result.durationMs = Date.now() - startTime
    log("[indexer] Indexing complete", {
        project,
        filesScanned: result.filesScanned,
        filesSkipped: result.filesSkipped,
        elementsIndexed: result.elementsIndexed,
        relationsIndexed: result.relationsIndexed,
        durationMs: result.durationMs,
        errors: result.errors.length,
    })

    return result
}
