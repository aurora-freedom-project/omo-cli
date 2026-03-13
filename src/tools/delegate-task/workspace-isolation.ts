/**
 * @module delegate-task/workspace-isolation
 *
 * Implements Symphony's 3 workspace safety invariants:
 * 1. Agent runs ONLY in per-task workspace directory
 * 2. Workspace MUST be under workspace root
 * 3. Workspace key is sanitized ([A-Za-z0-9._-] only)
 *
 * Also implements lifecycle hooks (before_run/after_run).
 */

import { existsSync, mkdirSync } from "node:fs"
import { join, resolve, sep } from "node:path"
import { execSync } from "node:child_process"
import { log } from "../../shared"

// ─── Workspace Key Sanitization ─────────────────────────────────────────────

/**
 * Sanitize a workspace key to only allow safe characters.
 * Replaces anything not [A-Za-z0-9._-] with underscore.
 * Symphony SPEC §8.3: "workspace key is sanitized".
 */
export function sanitizeWorkspaceKey(key: string): string {
    return key.replace(/[^A-Za-z0-9._-]/g, "_")
}

// ─── Workspace Validation ───────────────────────────────────────────────────

/**
 * Validate that a workspace path is safely under the root.
 * Symphony SPEC §8 Invariant #2: workspace MUST be under workspace root.
 *
 * Prevents path traversal (e.g., ../../etc/passwd).
 */
export function isUnderRoot(workspacePath: string, rootPath: string): boolean {
    const resolved = resolve(workspacePath)
    const resolvedRoot = resolve(rootPath)
    return resolved.startsWith(resolvedRoot + sep) || resolved === resolvedRoot
}

// ─── Workspace Creation ─────────────────────────────────────────────────────

export interface WorkspaceResult {
    path: string
    created: boolean
    error?: string
}

/**
 * Create an isolated workspace directory for a task.
 * Enforces all 3 Symphony safety invariants.
 */
export function createTaskWorkspace(
    workspaceRoot: string,
    taskId: string,
    sessionId?: string,
): WorkspaceResult {
    const sanitizedKey = sanitizeWorkspaceKey(
        taskId + (sessionId ? `-${sessionId.slice(0, 8)}` : "")
    )
    const workspacePath = join(resolve(workspaceRoot), sanitizedKey)

    // Invariant #2: workspace MUST be under root
    if (!isUnderRoot(workspacePath, workspaceRoot)) {
        return {
            path: workspacePath,
            created: false,
            error: `Workspace path escapes root: ${workspacePath} is not under ${workspaceRoot}`,
        }
    }

    // Create if not exists
    if (!existsSync(workspacePath)) {
        try {
            mkdirSync(workspacePath, { recursive: true })
            log("[workspace-isolation] Created workspace", { path: workspacePath })
        } catch (error) {
            return {
                path: workspacePath,
                created: false,
                error: `Failed to create workspace: ${error}`,
            }
        }
    }

    return { path: workspacePath, created: true }
}

// ─── Lifecycle Hooks ────────────────────────────────────────────────────────

export interface LifecycleHookOptions {
    /** Shell command to run */
    command: string
    /** Working directory */
    cwd: string
    /** Timeout in ms */
    timeoutMs: number
    /** Hook name for logging */
    hookName: string
}

/**
 * Execute a lifecycle hook shell command.
 * Symphony SPEC §8.2: hooks run with timeout enforcement.
 *
 * @returns true if successful, false if failed
 */
export function executeLifecycleHook(options: LifecycleHookOptions): boolean {
    const { command, cwd, timeoutMs, hookName } = options

    log(`[lifecycle-hooks] Executing ${hookName}`, { command, cwd, timeoutMs })

    try {
        execSync(command, {
            cwd,
            timeout: timeoutMs,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        })
        log(`[lifecycle-hooks] ${hookName} completed`, { command })
        return true
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log(`[lifecycle-hooks] ${hookName} failed`, { command, error: message })
        return false
    }
}

// ─── Concurrency Control ────────────────────────────────────────────────────

/** Track active agent count for concurrency limiting. */
let _activeAgentCount = 0

/** Get current active agent count. */
export function getActiveAgentCount(): number {
    return _activeAgentCount
}

/** Increment active agent count. Returns false if limit exceeded. */
export function acquireAgentSlot(maxConcurrent: number): boolean {
    if (_activeAgentCount >= maxConcurrent) {
        log("[concurrency] Slot limit reached", {
            active: _activeAgentCount,
            max: maxConcurrent,
        })
        return false
    }
    _activeAgentCount++
    return true
}

/** Decrement active agent count. */
export function releaseAgentSlot(): void {
    if (_activeAgentCount > 0) {
        _activeAgentCount--
    }
}

/** Reset for testing. */
export function __resetActiveAgentCount(): void {
    _activeAgentCount = 0
}
