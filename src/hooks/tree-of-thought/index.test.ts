/**
 * Tree-of-Thought Reasoning — Test Suite
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    createTree,
    addThought,
    pruneLevel,
    beamSelect,
    findBestPath,
    getLeaves,
    getLevel,
    formatTree,
    createToTManager,
    DEFAULT_CONFIG,
    type ToTConfig,
} from "./index"

// ── Tree Operations ────────────────────────────────────────────────────────

describe("createTree", () => {
    it("creates a tree with a root node", () => {
        const tree = createTree("How to fix the auth bug?")
        expect(tree.rootId).toBeTruthy()
        expect(tree.nodes.size).toBe(1)
        expect(tree.totalGenerated).toBe(1)

        const root = tree.nodes.get(tree.rootId)!
        expect(root.thought).toBe("How to fix the auth bug?")
        expect(root.depth).toBe(0)
        expect(root.parentId).toBeNull()
        expect(root.state).toBe("exploring")
    })
})

describe("addThought", () => {
    it("adds a child to the root", () => {
        const tree = createTree("Root")
        const child = addThought(tree, tree.rootId, "Approach A", 0.8)

        expect(child).not.toBeNull()
        expect(child!.depth).toBe(1)
        expect(child!.parentId).toBe(tree.rootId)
        expect(tree.nodes.size).toBe(2)
        expect(tree.totalGenerated).toBe(2)
    })

    it("updates best leaf when child has higher score", () => {
        const tree = createTree("Root", 0.5)
        addThought(tree, tree.rootId, "Better", 0.9)

        expect(tree.bestLeaf!.score).toBe(0.9)
    })

    it("clamps score to [0, 1]", () => {
        const tree = createTree("Root")
        const child = addThought(tree, tree.rootId, "Over", 1.5)
        expect(child!.score).toBe(1.0)

        const child2 = addThought(tree, tree.rootId, "Under", -0.5)
        expect(child2!.score).toBe(0.0)
    })

    it("returns null for invalid parent", () => {
        const tree = createTree("Root")
        const result = addThought(tree, "nonexistent", "Orphan", 0.5)
        expect(result).toBeNull()
    })

    it("tracks max depth", () => {
        const tree = createTree("Root")
        const c1 = addThought(tree, tree.rootId, "L1", 0.5)!
        const c2 = addThought(tree, c1.id, "L2", 0.5)!
        addThought(tree, c2.id, "L3", 0.5)

        expect(tree.maxDepthReached).toBe(3)
    })
})

describe("pruneLevel", () => {
    it("prunes nodes below threshold", () => {
        const tree = createTree("Root")
        addThought(tree, tree.rootId, "Good", 0.8)
        addThought(tree, tree.rootId, "Bad", 0.1)

        const pruned = pruneLevel(tree, 1, { ...DEFAULT_CONFIG, pruneThreshold: 0.3 })
        expect(pruned).toBe(1)
    })

    it("does not prune above threshold", () => {
        const tree = createTree("Root")
        addThought(tree, tree.rootId, "Good", 0.8)
        addThought(tree, tree.rootId, "OK", 0.5)

        const pruned = pruneLevel(tree, 1, { ...DEFAULT_CONFIG, pruneThreshold: 0.3 })
        expect(pruned).toBe(0)
    })

    it("does not prune already-pruned nodes", () => {
        const tree = createTree("Root")
        const bad = addThought(tree, tree.rootId, "Bad", 0.1)!
        bad.state = "pruned"

        const pruned = pruneLevel(tree, 1, { ...DEFAULT_CONFIG, pruneThreshold: 0.3 })
        expect(pruned).toBe(0)
    })
})

describe("beamSelect", () => {
    it("selects top-K nodes", () => {
        const tree = createTree("Root")
        addThought(tree, tree.rootId, "A", 0.9)
        addThought(tree, tree.rootId, "B", 0.5)
        addThought(tree, tree.rootId, "C", 0.3)
        addThought(tree, tree.rootId, "D", 0.1)

        const selected = beamSelect(tree, 1, { ...DEFAULT_CONFIG, beamWidth: 2 })
        expect(selected.length).toBe(2)
        expect(selected[0].score).toBeGreaterThanOrEqual(selected[1].score)
    })

    it("marks non-selected as pruned", () => {
        const tree = createTree("Root")
        addThought(tree, tree.rootId, "A", 0.9)
        addThought(tree, tree.rootId, "B", 0.5)
        addThought(tree, tree.rootId, "C", 0.3)

        beamSelect(tree, 1, { ...DEFAULT_CONFIG, beamWidth: 1 })

        const pruned = [...tree.nodes.values()].filter(n => n.state === "pruned")
        expect(pruned.length).toBe(2)
    })
})

describe("findBestPath", () => {
    it("finds path from root to best leaf", () => {
        const tree = createTree("Root", 0.5)
        const c1 = addThought(tree, tree.rootId, "L1-A", 0.7)!
        addThought(tree, tree.rootId, "L1-B", 0.3)
        const c2 = addThought(tree, c1.id, "L2-Best", 0.95)!

        const path = findBestPath(tree)
        expect(path.length).toBe(3) // Root → L1-A → L2-Best
        expect(path[0].id).toBe(tree.rootId)
        expect(path[path.length - 1].score).toBe(0.95)
    })

    it("returns empty for tree without best leaf", () => {
        const tree = createTree("Root")
        tree.bestLeaf = null
        expect(findBestPath(tree)).toHaveLength(0)
    })

    it("marks best path nodes", () => {
        const tree = createTree("Root", 0.5)
        const c = addThought(tree, tree.rootId, "Best child", 0.9)!

        findBestPath(tree)

        const root = tree.nodes.get(tree.rootId)!
        expect(root.isBestPath).toBe(true)
        expect(c.isBestPath).toBe(true)
    })
})

describe("getLeaves", () => {
    it("returns leaf nodes", () => {
        const tree = createTree("Root")
        addThought(tree, tree.rootId, "Child A", 0.8)
        addThought(tree, tree.rootId, "Child B", 0.6)

        const leaves = getLeaves(tree)
        expect(leaves.length).toBe(2) // both children are leaves
    })

    it("excludes pruned leaves", () => {
        const tree = createTree("Root")
        const child = addThought(tree, tree.rootId, "Pruned", 0.1)!
        child.state = "pruned"

        const leaves = getLeaves(tree)
        expect(leaves.length).toBe(0) // root has children so not a leaf, pruned child excluded
    })
})

describe("getLevel", () => {
    it("returns nodes at specific depth", () => {
        const tree = createTree("Root")
        addThought(tree, tree.rootId, "A", 0.8)
        addThought(tree, tree.rootId, "B", 0.6)

        expect(getLevel(tree, 0).length).toBe(1) // root
        expect(getLevel(tree, 1).length).toBe(2) // children
    })
})

describe("formatTree", () => {
    it("produces readable output", () => {
        const tree = createTree("Root problem")
        addThought(tree, tree.rootId, "Approach A", 0.8)
        addThought(tree, tree.rootId, "Approach B", 0.4)

        const output = formatTree(tree)
        expect(output).toContain("Root problem")
        expect(output).toContain("Approach A")
        expect(output).toContain("Approach B")
        expect(output).toContain("3 nodes")
    })
})

// ── ToT Manager ────────────────────────────────────────────────────────────

describe("createToTManager", () => {
    let manager: ReturnType<typeof createToTManager>

    beforeEach(() => {
        manager = createToTManager({
            maxDepth: 3,
            beamWidth: 2,
            pruneThreshold: 0.3,
            maxNodes: 20,
        })
        manager.reset()
    })

    it("starts reasoning and creates a tree", () => {
        const tree = manager.startReasoning("Fix the login bug")
        expect(tree.nodes.size).toBe(1)
    })

    it("expands nodes with child thoughts", () => {
        const tree = manager.startReasoning("Problem")
        const expanded = manager.expandNode(tree, tree.rootId, [
            { thought: "Approach A", score: 0.8 },
            { thought: "Approach B", score: 0.5 },
            { thought: "Approach C", score: 0.2 },
        ])

        expect(expanded.length).toBe(3)
        expect(tree.nodes.size).toBe(4)
    })

    it("respects depth limit", () => {
        const tree = manager.startReasoning("Problem")
        const l1 = manager.expandNode(tree, tree.rootId, [{ thought: "L1", score: 0.8 }])
        const l2 = manager.expandNode(tree, l1[0].id, [{ thought: "L2", score: 0.8 }])
        const l3 = manager.expandNode(tree, l2[0].id, [{ thought: "L3", score: 0.8 }])
        // Depth 3 = maxDepth, should not expand further
        const l4 = manager.expandNode(tree, l3[0].id, [{ thought: "L4", score: 0.8 }])

        expect(l4.length).toBe(0) // blocked by depth limit
    })

    it("respects node limit", () => {
        const config: ToTConfig = { maxDepth: 10, beamWidth: 100, pruneThreshold: 0, maxNodes: 5 }
        const mgr = createToTManager(config)
        mgr.reset()

        const tree = mgr.startReasoning("Problem")
        const expanded = mgr.expandNode(tree, tree.rootId,
            Array.from({ length: 10 }, (_, i) => ({ thought: `T${i}`, score: 0.5 }))
        )

        // Should stop at maxNodes (5 total, root + 4 children)
        expect(tree.totalGenerated).toBeLessThanOrEqual(5)
    })

    it("exploreBFS prunes and selects", () => {
        const tree = manager.startReasoning("Problem")
        manager.expandNode(tree, tree.rootId, [
            { thought: "Great", score: 0.9 },
            { thought: "Good", score: 0.6 },
            { thought: "Bad", score: 0.1 },
        ])

        const selected = manager.exploreBFS(tree, 1)
        // beamWidth=2, so at most 2 selected
        expect(selected.length).toBeLessThanOrEqual(2)
        // "Bad" (0.1) should be pruned (below threshold 0.3)
        expect(selected.every(n => n.score >= 0.3)).toBe(true)
    })

    it("completeReasoning returns best path", () => {
        const tree = manager.startReasoning("Problem")
        manager.expandNode(tree, tree.rootId, [
            { thought: "Winner", score: 0.9 },
            { thought: "Loser", score: 0.2 },
        ])

        const path = manager.completeReasoning(tree)
        expect(path.length).toBeGreaterThanOrEqual(1)
        // Path should include the root and the best child
        expect(path[path.length - 1].score).toBe(0.9)
    })

    it("tracks metrics", () => {
        const tree = manager.startReasoning("P1")
        manager.expandNode(tree, tree.rootId, [
            { thought: "A", score: 0.8 },
            { thought: "B", score: 0.5 },
        ])
        manager.completeReasoning(tree)

        const metrics = manager.getMetrics()
        expect(metrics.treesCreated).toBe(1)
        expect(metrics.totalNodes).toBe(3)
    })

    it("reset clears all state", () => {
        manager.startReasoning("P1")
        manager.reset()

        const metrics = manager.getMetrics()
        expect(metrics.treesCreated).toBe(0)
        expect(metrics.totalNodes).toBe(0)
    })
})
