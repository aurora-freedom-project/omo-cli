/**
 * Git Worktree Isolation — Safe parallel branch execution.
 *
 * Provides tools for creating isolated git worktrees so that swarm agents
 * can work on different branches/tasks in parallel without file conflicts.
 * This is essential for the diamond DAG pattern where parallel coders
 * need to modify files without stepping on each other.
 *
 * Features:
 * - Create temporary worktrees for parallel execution
 * - Auto-cleanup worktrees on session end
 * - Merge worktree changes back to main branch
 * - List and manage active worktrees
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { execSync } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { log } from "../../shared/logger"

// ── State ──────────────────────────────────────────────────────────────────

interface WorktreeInfo {
    path: string
    branch: string
    sessionID: string
    createdAt: number
}

const activeWorktrees = new Map<string, WorktreeInfo>()

// ── Helpers ────────────────────────────────────────────────────────────────

function execGit(cwd: string, args: string): string {
    return execSync(`git ${args}`, {
        cwd,
        encoding: "utf-8",
        timeout: 15000,
        stdio: ["pipe", "pipe", "pipe"],
    }).trim()
}

function isGitRepo(dir: string): boolean {
    try {
        execGit(dir, "rev-parse --git-dir")
        return true
    } catch {
        return false
    }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a new git worktree for isolated work.
 */
export function createWorktree(
    repoPath: string,
    branchName: string,
    sessionID: string,
): { path: string; branch: string } | { error: string } {
    if (!isGitRepo(repoPath)) {
        return { error: `'${repoPath}' is not a git repository` }
    }

    const worktreeName = `wt-${branchName}-${Date.now()}`
    const worktreePath = join(repoPath, ".worktrees", worktreeName)

    try {
        // Create the worktree with a new branch
        execGit(repoPath, `worktree add -b ${branchName} ${JSON.stringify(worktreePath)}`)

        const info: WorktreeInfo = {
            path: worktreePath,
            branch: branchName,
            sessionID,
            createdAt: Date.now(),
        }
        activeWorktrees.set(worktreeName, info)

        log("[git-worktree] Created", { worktreePath, branch: branchName, sessionID })
        return { path: worktreePath, branch: branchName }
    } catch (err: unknown) {
        const error = err as { message?: string; stderr?: Buffer | string }
        const msg = error.stderr?.toString() || error.message || String(err)

        // If branch already exists, try adding worktree without -b
        if (msg.includes("already exists")) {
            try {
                execGit(repoPath, `worktree add ${JSON.stringify(worktreePath)} ${branchName}`)
                const info: WorktreeInfo = {
                    path: worktreePath,
                    branch: branchName,
                    sessionID,
                    createdAt: Date.now(),
                }
                activeWorktrees.set(worktreeName, info)
                return { path: worktreePath, branch: branchName }
            } catch (err2: unknown) {
                return { error: `Failed to create worktree: ${(err2 as Error)?.message || String(err2)}` }
            }
        }

        return { error: `Failed to create worktree: ${msg}` }
    }
}

/**
 * Remove a worktree and clean up.
 */
export function removeWorktree(
    repoPath: string,
    worktreeName: string,
): string {
    const info = activeWorktrees.get(worktreeName)
    if (!info) return `Worktree '${worktreeName}' not found in active list`

    try {
        execGit(repoPath, `worktree remove ${JSON.stringify(info.path)} --force`)
        activeWorktrees.delete(worktreeName)
        log("[git-worktree] Removed", { worktreeName, path: info.path })
        return `Removed worktree '${worktreeName}' at ${info.path}`
    } catch (err: unknown) {
        // Force cleanup if git command fails
        if (existsSync(info.path)) {
            rmSync(info.path, { recursive: true, force: true })
        }
        activeWorktrees.delete(worktreeName)
        return `Force-cleaned worktree '${worktreeName}'`
    }
}

/**
 * List all active worktrees for a repo.
 */
export function listWorktrees(repoPath: string): string {
    if (!isGitRepo(repoPath)) return "Not a git repository"

    try {
        const output = execGit(repoPath, "worktree list --porcelain")
        const managed = Array.from(activeWorktrees.entries()).map(
            ([name, info]) => `  ${name}: ${info.branch} (${info.path})`
        )

        return [
            "Git Worktrees:",
            output,
            "",
            `Managed by omo-cli (${managed.length}):`,
            ...managed,
        ].join("\n")
    } catch {
        return "Error: Failed to list worktrees"
    }
}

/**
 * Clean up all worktrees for a session.
 */
export function cleanupSession(repoPath: string, sessionID: string): number {
    let cleaned = 0
    for (const [name, info] of activeWorktrees.entries()) {
        if (info.sessionID === sessionID) {
            removeWorktree(repoPath, name)
            cleaned++
        }
    }
    return cleaned
}

// ── Tools ──────────────────────────────────────────────────────────────────

export function createGitWorktreeTools(repoPath: string): Record<string, ToolDefinition> {
    return {
        git_worktree_create: tool({
            description:
                "Create a git worktree for isolated parallel work. " +
                "Creates a new branch in a separate directory so multiple agents can work simultaneously.",
            args: {
                branch: tool.schema.string().describe("Branch name for the worktree."),
            },
            execute: async (args): Promise<string> => {
                const branch = args.branch?.trim()
                if (!branch) return "Error: Missing 'branch' parameter"

                const result = createWorktree(repoPath, branch, "manual")
                if ("error" in result) return `Error: ${result.error}`

                return `✅ Worktree created:\n  Path: ${result.path}\n  Branch: ${result.branch}\n\nUse this path for file operations in the isolated branch.`
            },
        }),

        git_worktree_list: tool({
            description: "List all git worktrees for the current repository.",
            args: {},
            execute: async (): Promise<string> => {
                return listWorktrees(repoPath)
            },
        }),

        git_worktree_remove: tool({
            description: "Remove a git worktree and clean up.",
            args: {
                name: tool.schema.string().describe("Worktree name to remove."),
            },
            execute: async (args): Promise<string> => {
                if (!args.name) return "Error: Missing 'name' parameter"
                return removeWorktree(repoPath, args.name)
            },
        }),
    }
}
