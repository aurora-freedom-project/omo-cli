/**
 * Workpad Tracker — Session-level artifact and state tracking.
 *
 * Feature #27 from the 27-feature integration plan.
 * Inspired by Symphony's workpad pattern: each session maintains a lightweight
 * "workpad" of artifacts produced during the session (files created/modified,
 * tools used, decisions made).
 *
 * This enables:
 *  - Post-session summaries (what was accomplished)
 *  - Cross-session continuity (resume from last workpad)
 *  - Audit trail (what changed and why)
 */

/** A single workpad entry — one artifact or action tracked in a session. */
export interface WorkpadEntry {
    readonly timestamp: string
    readonly type: "file_created" | "file_modified" | "tool_used" | "decision" | "note"
    readonly path?: string
    readonly tool?: string
    readonly summary: string
}

/** Session workpad — accumulates entries during a session's lifetime. */
export interface Workpad {
    readonly sessionId: string
    readonly startedAt: string
    readonly entries: WorkpadEntry[]
}

// ─── In-memory workpad state (cleaned up on session.deleted) ─────────────────

const _workpads = new Map<string, Workpad>()

/** Get or create a workpad for a session. */
export function getWorkpad(sessionId: string): Workpad {
    let wp = _workpads.get(sessionId)
    if (!wp) {
        wp = {
            sessionId,
            startedAt: new Date().toISOString(),
            entries: [],
        }
        _workpads.set(sessionId, wp)
    }
    return wp
}

/** Track a file creation. */
export function trackFileCreated(sessionId: string, path: string, summary?: string): void {
    getWorkpad(sessionId).entries.push({
        timestamp: new Date().toISOString(),
        type: "file_created",
        path,
        summary: summary ?? `Created ${path}`,
    })
}

/** Track a file modification. */
export function trackFileModified(sessionId: string, path: string, summary?: string): void {
    getWorkpad(sessionId).entries.push({
        timestamp: new Date().toISOString(),
        type: "file_modified",
        path,
        summary: summary ?? `Modified ${path}`,
    })
}

/** Track a tool use. */
export function trackToolUsed(sessionId: string, tool: string, summary?: string): void {
    getWorkpad(sessionId).entries.push({
        timestamp: new Date().toISOString(),
        type: "tool_used",
        tool,
        summary: summary ?? `Used ${tool}`,
    })
}

/** Track a decision or note. */
export function trackDecision(sessionId: string, summary: string): void {
    getWorkpad(sessionId).entries.push({
        timestamp: new Date().toISOString(),
        type: "decision",
        summary,
    })
}

/** Get a session summary from the workpad. */
export function summarizeWorkpad(sessionId: string): string {
    const wp = _workpads.get(sessionId)
    if (!wp || wp.entries.length === 0) return "(empty workpad)"

    const created = wp.entries.filter(e => e.type === "file_created").length
    const modified = wp.entries.filter(e => e.type === "file_modified").length
    const tools = wp.entries.filter(e => e.type === "tool_used").length
    const decisions = wp.entries.filter(e => e.type === "decision").length

    return [
        `📋 Workpad for session ${sessionId.slice(0, 8)}...`,
        `   Started: ${wp.startedAt}`,
        `   Files created: ${created}`,
        `   Files modified: ${modified}`,
        `   Tools used: ${tools}`,
        `   Decisions: ${decisions}`,
        `   Total entries: ${wp.entries.length}`,
    ].join("\n")
}

/** Clean up workpad for a deleted session. */
export function cleanupWorkpad(sessionId: string): void {
    _workpads.delete(sessionId)
}
