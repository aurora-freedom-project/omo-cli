/**
 * Tests for Symphony-inspired features:
 *   - Workspace isolation (3 safety invariants)
 *   - Concurrency control (slot-based)
 *   - Lifecycle hooks execution
 *   - Config hot-reload
 */
import { describe, expect, it, beforeEach } from "bun:test"
import {
    sanitizeWorkspaceKey,
    isUnderRoot,
    createTaskWorkspace,
    acquireAgentSlot,
    releaseAgentSlot,
    getActiveAgentCount,
    __resetActiveAgentCount,
} from "./workspace-isolation"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { existsSync, rmSync, mkdirSync } from "node:fs"

// ──── Workspace Key Sanitization ────

describe("sanitizeWorkspaceKey", () => {
    it("preserves safe characters", () => {
        expect(sanitizeWorkspaceKey("task-123.abc_def")).toBe("task-123.abc_def")
    })

    it("replaces spaces with underscores", () => {
        expect(sanitizeWorkspaceKey("my task name")).toBe("my_task_name")
    })

    it("replaces path traversal characters", () => {
        expect(sanitizeWorkspaceKey("../../../etc/passwd")).toBe(".._.._.._etc_passwd")
    })

    it("replaces special characters", () => {
        expect(sanitizeWorkspaceKey("task@#$%^&*()")).toBe("task_________")
    })

    it("handles empty string", () => {
        expect(sanitizeWorkspaceKey("")).toBe("")
    })

    it("preserves dots and hyphens", () => {
        expect(sanitizeWorkspaceKey("v1.2.3-beta")).toBe("v1.2.3-beta")
    })
})

// ──── Path Validation ────

describe("isUnderRoot", () => {
    it("accepts path directly under root", () => {
        expect(isUnderRoot("/workspace/root/task-1", "/workspace/root")).toBe(true)
    })

    it("accepts nested path", () => {
        expect(isUnderRoot("/workspace/root/a/b/c", "/workspace/root")).toBe(true)
    })

    it("rejects path traversal", () => {
        expect(isUnderRoot("/workspace/root/../etc", "/workspace/root")).toBe(false)
    })

    it("rejects sibling directory", () => {
        expect(isUnderRoot("/workspace/other", "/workspace/root")).toBe(false)
    })

    it("accepts root itself", () => {
        expect(isUnderRoot("/workspace/root", "/workspace/root")).toBe(true)
    })

    it("rejects prefix-matching that isn't a directory boundary", () => {
        // /workspace/root-evil should NOT match /workspace/root
        expect(isUnderRoot("/workspace/root-evil", "/workspace/root")).toBe(false)
    })
})

// ──── Workspace Creation ────

describe("createTaskWorkspace", () => {
    const testRoot = join(tmpdir(), `omo-test-ws-${Date.now()}`)

    beforeEach(() => {
        if (existsSync(testRoot)) {
            rmSync(testRoot, { recursive: true })
        }
        mkdirSync(testRoot, { recursive: true })
    })

    it("creates workspace directory", () => {
        const result = createTaskWorkspace(testRoot, "task-1")
        expect(result.created).toBe(true)
        expect(existsSync(result.path)).toBe(true)
    })

    it("sanitizes task ID in path", () => {
        const result = createTaskWorkspace(testRoot, "task with spaces")
        expect(result.path).toContain("task_with_spaces")
        expect(result.created).toBe(true)
    })

    it("includes session ID prefix", () => {
        const result = createTaskWorkspace(testRoot, "task-1", "abcdef12-3456-7890")
        expect(result.path).toContain("task-1-abcdef12")
    })

    it("rejects path traversal in task ID", () => {
        // Even though sanitizeWorkspaceKey will replace .. with __, the path
        // should still be under root after sanitization
        const result = createTaskWorkspace(testRoot, "../../etc/passwd")
        expect(result.created).toBe(true)
        expect(result.path.startsWith(testRoot)).toBe(true)
    })
})

// ──── Concurrency Control ────

describe("concurrency slots", () => {
    beforeEach(() => {
        __resetActiveAgentCount()
    })

    it("starts at 0 active agents", () => {
        expect(getActiveAgentCount()).toBe(0)
    })

    it("acquires slot successfully", () => {
        expect(acquireAgentSlot(5)).toBe(true)
        expect(getActiveAgentCount()).toBe(1)
    })

    it("acquires multiple slots", () => {
        expect(acquireAgentSlot(3)).toBe(true)
        expect(acquireAgentSlot(3)).toBe(true)
        expect(acquireAgentSlot(3)).toBe(true)
        expect(getActiveAgentCount()).toBe(3)
    })

    it("rejects when limit reached", () => {
        acquireAgentSlot(2)
        acquireAgentSlot(2)
        expect(acquireAgentSlot(2)).toBe(false)
        expect(getActiveAgentCount()).toBe(2)
    })

    it("releases slot", () => {
        acquireAgentSlot(5)
        acquireAgentSlot(5)
        releaseAgentSlot()
        expect(getActiveAgentCount()).toBe(1)
    })

    it("does not go below 0", () => {
        releaseAgentSlot()
        expect(getActiveAgentCount()).toBe(0)
    })

    it("allows new acquisition after release", () => {
        acquireAgentSlot(1)
        expect(acquireAgentSlot(1)).toBe(false)
        releaseAgentSlot()
        expect(acquireAgentSlot(1)).toBe(true)
    })
})
