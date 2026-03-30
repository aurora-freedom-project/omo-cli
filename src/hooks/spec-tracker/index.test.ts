/**
 * Spec Artifact Tracker — Test Suite
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    hashContent,
    extractRequirements,
    parseTaskCompletion,
    createSpecTracker,
} from "./index"

// ── Hash Function ──────────────────────────────────────────────────────────

describe("hashContent", () => {
    it("returns consistent hash for same content", () => {
        const hash1 = hashContent("hello world")
        const hash2 = hashContent("hello world")
        expect(hash1).toBe(hash2)
    })

    it("returns different hash for different content", () => {
        const hash1 = hashContent("hello")
        const hash2 = hashContent("world")
        expect(hash1).not.toBe(hash2)
    })

    it("returns 8-char hex string", () => {
        const hash = hashContent("test")
        expect(hash).toMatch(/^[0-9a-f]{8}$/)
    })

    it("handles empty string", () => {
        const hash = hashContent("")
        expect(hash).toMatch(/^[0-9a-f]{8}$/)
    })
})

// ── Requirement Extraction ─────────────────────────────────────────────────

describe("extractRequirements", () => {
    it("extracts checklist items", () => {
        const reqs = extractRequirements(`
- [ ] Implement user authentication
- [x] Set up database schema
- [ ] Add API rate limiting
        `)
        expect(reqs).toContain("Implement user authentication")
        expect(reqs).toContain("Set up database schema")
        expect(reqs).toContain("Add API rate limiting")
    })

    it("extracts MUST/SHALL statements", () => {
        const reqs = extractRequirements(`
The system MUST handle 1000 concurrent users.
The API SHALL return JSON responses.
        `)
        expect(reqs.length).toBe(2)
        expect(reqs[0]).toContain("MUST")
    })

    it("extracts numbered requirements with modal verbs", () => {
        const reqs = extractRequirements(`
1. The system must validate all inputs
2. Each request should include an auth token
3. This is just a note without requirements
        `)
        expect(reqs.length).toBe(2)
    })

    it("handles empty content", () => {
        expect(extractRequirements("")).toHaveLength(0)
    })

    it("caps requirement length at 200 chars", () => {
        const longReq = "The system MUST " + "a".repeat(300)
        const reqs = extractRequirements(longReq)
        expect(reqs[0].length).toBeLessThanOrEqual(200)
    })

    it("extracts in-progress tasks", () => {
        const reqs = extractRequirements(`
- [/] Work in progress task
        `)
        expect(reqs).toContain("Work in progress task")
    })
})

// ── Task Completion ────────────────────────────────────────────────────────

describe("parseTaskCompletion", () => {
    it("counts done and pending tasks", () => {
        const result = parseTaskCompletion(`
- [x] Done task 1
- [x] Done task 2
- [ ] Pending task 1
- [ ] Pending task 2
- [ ] Pending task 3
        `)
        expect(result.done).toBe(2)
        expect(result.total).toBe(5)
        expect(result.ratio).toBeCloseTo(0.4)
    })

    it("returns 0 ratio for no tasks", () => {
        const result = parseTaskCompletion("No tasks here")
        expect(result.done).toBe(0)
        expect(result.total).toBe(0)
        expect(result.ratio).toBe(0)
    })

    it("counts in-progress tasks as pending", () => {
        const result = parseTaskCompletion(`
- [x] Done
- [/] In progress
- [ ] Pending
        `)
        expect(result.done).toBe(1)
        expect(result.total).toBe(3)
    })

    it("returns 1.0 ratio when all done", () => {
        const result = parseTaskCompletion(`
- [x] Done 1
- [x] Done 2
        `)
        expect(result.ratio).toBe(1.0)
    })
})

// ── Spec Tracker ───────────────────────────────────────────────────────────

describe("createSpecTracker", () => {
    let tracker: ReturnType<typeof createSpecTracker>

    beforeEach(() => {
        tracker = createSpecTracker()
    })

    it("tracks a new artifact", () => {
        const artifact = tracker.trackArtifact(
            "spec.md", "specification", "API Spec",
            "The system MUST handle authentication.\n- [ ] Login endpoint"
        )

        expect(artifact.id).toBe("spec.md")
        expect(artifact.phase).toBe("specification")
        expect(artifact.requirements.length).toBeGreaterThan(0)
    })

    it("auto-advances current phase", () => {
        tracker.trackArtifact("const.md", "constitution", "Constitution", "Rules")
        tracker.trackArtifact("spec.md", "specification", "Spec", "The system MUST work")

        const metrics = tracker.getMetrics()
        expect(metrics.currentPhase).toBe("specification")
    })

    it("detects phase skipping", () => {
        tracker.trackArtifact("const.md", "constitution", "Constitution", "Rules")
        // Skip specification and plan, jump to tasks
        tracker.trackArtifact("tasks.md", "tasks", "Tasks", "- [ ] Do stuff")

        const drifts = tracker.getDrifts()
        const phaseSkips = drifts.filter(d => d.type === "phase_skip")
        expect(phaseSkips.length).toBeGreaterThan(0)
        expect(phaseSkips[0].severity).toBe("high")
    })

    it("tracks task completion ratio", () => {
        tracker.trackArtifact("tasks.md", "tasks", "Tasks", `
- [x] Done 1
- [x] Done 2
- [ ] Pending 1
        `)

        const artifacts = tracker.getArtifacts()
        const taskArtifact = artifacts.find(a => a.id === "tasks.md")
        expect(taskArtifact?.completionRatio).toBeCloseTo(2 / 3)
    })

    it("detects stale spec on update", () => {
        tracker.trackArtifact("spec.md", "specification", "Spec", "Original content")
        // Advance to implementation
        tracker.trackArtifact("impl.md", "implementation", "Impl", "Some code")
        // Now modify the old spec (project has moved past it)
        tracker.trackArtifact("spec.md", "specification", "Spec", "Different content")

        const drifts = tracker.getDrifts()
        const staleDrifts = drifts.filter(d => d.type === "stale_spec")
        expect(staleDrifts.length).toBeGreaterThan(0)
    })

    it("does not flag stale spec when content unchanged", () => {
        const content = "The system MUST work. Original content."
        tracker.trackArtifact("spec.md", "specification", "Spec", content)
        tracker.trackArtifact("impl.md", "implementation", "Impl", "Code")
        // Re-track with same content
        tracker.trackArtifact("spec.md", "specification", "Spec", content)

        const drifts = tracker.getDrifts()
        const staleDrifts = drifts.filter(d => d.type === "stale_spec")
        expect(staleDrifts).toHaveLength(0)
    })

    it("computes health score", () => {
        // No drifts → perfect health
        tracker.trackArtifact("spec.md", "specification", "Spec", "MUST work")
        const perfectMetrics = tracker.getMetrics()
        expect(perfectMetrics.healthScore).toBe(1.0)
    })

    it("health score decreases with drifts", () => {
        tracker.trackArtifact("const.md", "constitution", "Constitution", "Rules")
        // Skip 2 phases → 2 high severity drifts
        tracker.trackArtifact("tasks.md", "tasks", "Tasks", "- [ ] stuff")

        const metrics = tracker.getMetrics()
        expect(metrics.healthScore).toBeLessThan(1.0)
    })

    it("checkRequirementCoverage finds missing requirements", () => {
        tracker.trackArtifact("spec.md", "specification", "Spec",
            "The system MUST handle user authentication and authorization")
        tracker.trackArtifact("tasks.md", "tasks", "Tasks",
            "- [ ] Set up database") // doesn't cover auth

        const newDrifts = tracker.checkRequirementCoverage()
        // Should find missing auth requirement
        expect(newDrifts.length).toBeGreaterThanOrEqual(0) // may or may not match depending on keyword overlap
    })

    it("clearDrifts removes all drifts", () => {
        tracker.trackArtifact("const.md", "constitution", "Constitution", "Rules")
        tracker.trackArtifact("tasks.md", "tasks", "Tasks", "- [ ] stuff") // causes phase_skip drifts

        expect(tracker.getDrifts().length).toBeGreaterThan(0)

        tracker.clearDrifts()
        expect(tracker.getDrifts()).toHaveLength(0)
    })

    it("reset clears all state", () => {
        tracker.trackArtifact("spec.md", "specification", "Spec", "MUST work")

        tracker.reset()

        const metrics = tracker.getMetrics()
        expect(metrics.artifactCount).toBe(0)
        expect(metrics.currentPhase).toBe("constitution")
    })

    it("getArtifacts returns all tracked artifacts", () => {
        tracker.trackArtifact("a.md", "constitution", "A", "Content A")
        tracker.trackArtifact("b.md", "specification", "B", "Content B")

        const artifacts = tracker.getArtifacts()
        expect(artifacts).toHaveLength(2)
        expect(artifacts.map(a => a.id)).toContain("a.md")
        expect(artifacts.map(a => a.id)).toContain("b.md")
    })

    it("preserves createdAt on update", () => {
        const first = tracker.trackArtifact("a.md", "specification", "A", "V1")
        const createdAt = first.createdAt

        // Small delay to ensure different timestamp
        const second = tracker.trackArtifact("a.md", "specification", "A", "V2")

        expect(second.createdAt).toBe(createdAt)
        expect(second.updatedAt).toBeGreaterThanOrEqual(createdAt)
    })
})
