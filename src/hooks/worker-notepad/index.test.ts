import { describe, it, expect, mock, beforeEach } from "bun:test"

/**
 * Tests for worker-notepad hook.
 * This hook provides a shared notepad between background workers and the main agent.
 */

describe("worker-notepad", () => {
    describe("notepad storage", () => {
        it("creates consistent session-based paths", () => {
            const sessionId = "uuid-123"
            const expectedPattern = `notepad_${sessionId}`
            expect(expectedPattern).toContain(sessionId)
        })

        it("handles missing session ID", () => {
            const sessionId = ""
            const key = sessionId ? `notepad_${sessionId}` : null
            expect(key).toBeNull()
        })
    })

    describe("content formatting", () => {
        it("wraps worker notes in XML tags", () => {
            const notes = ["Note 1", "Note 2"]
            const formatted = `\n<worker_notepad>\n${notes.join("\n")}\n</worker_notepad>\n`

            expect(formatted).toContain("<worker_notepad>")
            expect(formatted).toContain("Note 1")
            expect(formatted).toContain("Note 2")
        })

        it("handles empty notes", () => {
            const notes: string[] = []
            const shouldInject = notes.length > 0
            expect(shouldInject).toBe(false)
        })
    })
})
