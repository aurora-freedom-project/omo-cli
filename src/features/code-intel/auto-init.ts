import { Effect } from "effect"
import { log } from "../../shared/logger"
import { ensureSurrealDBRunning } from "../../cli/memory/docker-manager"
import { isConnected, initSchema, getIndexedFiles, configureSurreal } from "../../cli/memory/surreal-client"
import { indexProject, type IndexResult } from "./indexer"
import type { MemoryConfig } from "../../config/schema"
import { spawnSync } from "child_process"
import { computeFileHash } from "./code-parser"
import { readFileSync, existsSync } from "fs"
import { resolve, basename } from "path"
import { LANG_EXTENSIONS } from "../../tools/ast-grep/constants"

// ---------------------------------------------------------------------------
// State tracking
// ---------------------------------------------------------------------------

let autoInitRunning = false
let lastAutoIndexResult: IndexResult | null = null

/**
 * Background auto-init: ensures SurrealDB is running + runs incremental index.
 * Called on plugin load. Non-blocking — runs in background, never throws.
 *
 * Flow:
 *   1. Check Docker + SurrealDB → start if needed
 *   2. Configure SurrealDB connection
 *   3. Check if code changed since last index → skip if not
 *   4. Run incremental index (only changed files)
 */
export function startAutoInit(projectDir: string, config: MemoryConfig): void {
    if (autoInitRunning) {
        log("[code-intel-auto] Auto-init already running, skipping")
        return
    }

    autoInitRunning = true

    // Fire-and-forget — never block plugin load
    autoInitBackground(projectDir, config)
        .catch((err) => {
            log("[code-intel-auto] Auto-init failed (non-fatal)", { err: String(err) })
        })
        .finally(() => {
            autoInitRunning = false
        })
}

async function autoInitBackground(projectDir: string, config: MemoryConfig): Promise<void> {
    const project = basename(projectDir)

    // Step 1: Ensure SurrealDB is running
    log("[code-intel-auto] Checking SurrealDB availability...")
    const surrealCheck = await Effect.runPromise(
        Effect.tryPromise({
            try: async () => {
                await ensureSurrealDBRunning(config)
                return true
            },
            catch: (err) => err,
        }).pipe(Effect.catchAll((err) => {
            log("[code-intel-auto] SurrealDB not available, code-intel disabled", { err: String(err) })
            return Effect.succeed(false)
        }))
    )
    if (!surrealCheck) return

    // Step 2: Configure connection (same pattern as memory-tools)
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

    // Step 3: Verify connection + init schema
    const connected = await isConnected()
    if (!connected) {
        log("[code-intel-auto] SurrealDB not reachable after start, skipping index")
        return
    }
    await initSchema()

    // Step 3b: Check if index needed (fast git-based check)
    const needsIndex = await checkIfIndexNeeded(projectDir, project)
    if (!needsIndex) {
        log("[code-intel-auto] Index up-to-date, skipping")
        return
    }

    // Step 4: Run incremental index in background
    log("[code-intel-auto] Changes detected, running incremental index...")
    const result = await indexProject({
        projectDir,
        project,
        useVectors: false,  // keep it fast — no embeddings in auto mode
        rebuild: false,     // always incremental
    })

    lastAutoIndexResult = result
    log("[code-intel-auto] Auto-index complete", {
        filesScanned: result.filesScanned,
        filesSkipped: result.filesSkipped,
        elementsIndexed: result.elementsIndexed,
        durationMs: result.durationMs,
        errors: result.errors.length,
    })
}

/**
 * Fast check: are there any code files that changed since last index?
 * Uses git status + hash comparison to decide if full indexing is needed.
 */
async function checkIfIndexNeeded(projectDir: string, project: string): Promise<boolean> {
    try {
        // Get files modified since last commit (working tree + staged)
        const gitResult = spawnSync("git", ["status", "--porcelain", "-s"], {
            cwd: projectDir,
            encoding: "utf-8",
            timeout: 5000,
        })

        if (gitResult.status !== 0) {
            // Can't check git — assume index needed
            return true
        }

        const modifiedFiles = (gitResult.stdout ?? "")
            .split("\n")
            .filter(Boolean)
            .map(line => line.slice(3).trim()) // Remove status prefix like " M " or "?? "
            .filter(f => {
                const ext = "." + f.split(".").pop()?.toLowerCase()
                const allExtensions = new Set<string>()
                for (const exts of Object.values(LANG_EXTENSIONS)) {
                    for (const e of exts as string[]) allExtensions.add(e)
                }
                return allExtensions.has(ext)
            })

        if (modifiedFiles.length > 0) {
            log("[code-intel-auto] Modified code files detected", {
                count: modifiedFiles.length,
                files: modifiedFiles.slice(0, 5),
            })
            return true
        }

        // No modified files in working tree — check if we have any index at all
        const indexed = await getIndexedFiles(project)
        if (indexed.length === 0) {
            log("[code-intel-auto] No existing index found, first-time index needed")
            return true
        }

        // Also sample-check a few indexed files for hash changes
        // (catches cases where commits were made without our knowledge)
        const sampleSize = Math.min(10, indexed.length)
        const sample = indexed.slice(0, sampleSize)
        for (const { file, fileHash } of sample) {
            const absPath = resolve(projectDir, file)
            if (!existsSync(absPath)) {
                log("[code-intel-auto] Indexed file no longer exists", { file })
                return true
            }
            try {
                const content = readFileSync(absPath, "utf-8")
                const currentHash = computeFileHash(content)
                if (currentHash !== fileHash) {
                    log("[code-intel-auto] File content changed since last index", { file })
                    return true
                }
            } catch {
                // Can't read file — index to be safe
                return true
            }
        }

        return false
    } catch {
        // Any error → assume index needed
        return true
    }
}

/**
 * Get the result of the last auto-index run (for diagnostics).
 */
export function getLastAutoIndexResult(): IndexResult | null {
    return lastAutoIndexResult
}

/**
 * Check if auto-init is currently running.
 */
export function isAutoInitRunning(): boolean {
    return autoInitRunning
}
