/**
 * Tree-of-Thought Reasoning — autoresearch/Rogue-inspired branching deliberation.
 *
 * Learned from:
 * - autoresearch (Karpathy): Branching hypothesis exploration
 * - Rogue: Vulnerability exploitation decision trees
 * - Literature: "Tree of Thoughts" (Yao et al., 2023)
 *
 * Instead of linear reasoning, ToT explores multiple reasoning paths in parallel:
 *   Root Problem
 *   ├── Approach A (score: 0.8)
 *   │   ├── Sub-approach A1 (score: 0.7) ← explore
 *   │   └── Sub-approach A2 (score: 0.3) ← prune
 *   └── Approach B (score: 0.6)
 *       ├── Sub-approach B1 (score: 0.9) ← explore ★ best
 *       └── Sub-approach B2 (score: 0.4) ← prune
 *
 * Key features:
 * - BFS exploration with beam width control
 * - Per-node scoring via evaluation function
 * - Automatic pruning of low-scoring branches
 * - Backtracking to unexplored siblings
 * - Configurable depth limit
 *
 * @see Phase 7.4 of omo-cli v4.0+ upgrade blueprint
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export interface ThoughtNode {
    /** Unique node ID. */
    id: string
    /** Parent node ID (null for root). */
    parentId: string | null
    /** The thought/reasoning at this node. */
    thought: string
    /** Evaluation score (0-1, higher is better). */
    score: number
    /** Depth in the tree (0 = root). */
    depth: number
    /** Children node IDs. */
    children: string[]
    /** Node state. */
    state: "pending" | "exploring" | "completed" | "pruned"
    /** Whether this node was selected as part of the best path. */
    isBestPath: boolean
    /** Metadata for tracking. */
    metadata?: Record<string, unknown>
}

export interface ThoughtTree {
    /** All nodes by ID. */
    nodes: Map<string, ThoughtNode>
    /** Root node ID. */
    rootId: string
    /** Maximum depth explored. */
    maxDepthReached: number
    /** Total nodes generated. */
    totalGenerated: number
    /** Total nodes pruned. */
    totalPruned: number
    /** Best leaf node found. */
    bestLeaf: ThoughtNode | null
}

export interface ToTConfig {
    /** Maximum depth per branch. */
    maxDepth: number
    /** Beam width (how many branches to keep at each level). */
    beamWidth: number
    /** Minimum score to keep exploring a branch. */
    pruneThreshold: number
    /** Maximum total nodes to generate. */
    maxNodes: number
}

export interface ToTMetrics {
    /** Total trees created. */
    treesCreated: number
    /** Total nodes generated across all trees. */
    totalNodes: number
    /** Total nodes pruned across all trees. */
    totalPruned: number
    /** Average depth reached. */
    avgDepth: number
    /** Average best leaf score. */
    avgBestScore: number
}

// ── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: ToTConfig = {
    maxDepth: 4,
    beamWidth: 3,
    pruneThreshold: 0.3,
    maxNodes: 50,
}

// ── Tree Operations (pure) ─────────────────────────────────────────────────

let globalNodeCounter = 0

/**
 * Create a new thought tree with a root problem.
 */
export function createTree(problem: string, score: number = 0.5): ThoughtTree {
    const rootId = `node_${++globalNodeCounter}`
    const root: ThoughtNode = {
        id: rootId,
        parentId: null,
        thought: problem,
        score,
        depth: 0,
        children: [],
        state: "exploring",
        isBestPath: true,
    }

    return {
        nodes: new Map([[rootId, root]]),
        rootId,
        maxDepthReached: 0,
        totalGenerated: 1,
        totalPruned: 0,
        bestLeaf: root,
    }
}

/**
 * Add a child thought to a parent node.
 */
export function addThought(
    tree: ThoughtTree,
    parentId: string,
    thought: string,
    score: number,
    metadata?: Record<string, unknown>,
): ThoughtNode | null {
    const parent = tree.nodes.get(parentId)
    if (!parent) return null

    const id = `node_${++globalNodeCounter}`
    const node: ThoughtNode = {
        id,
        parentId,
        thought,
        score: Math.min(1.0, Math.max(0.0, score)),
        depth: parent.depth + 1,
        children: [],
        state: "pending",
        isBestPath: false,
        metadata,
    }

    parent.children.push(id)
    tree.nodes.set(id, node)
    tree.totalGenerated++

    if (node.depth > tree.maxDepthReached) {
        tree.maxDepthReached = node.depth
    }

    // Update best leaf if this node scores higher
    if (!tree.bestLeaf || node.score > tree.bestLeaf.score) {
        tree.bestLeaf = node
    }

    return node
}

/**
 * Prune nodes below the threshold score at a given depth.
 *
 * Returns the number of nodes pruned.
 */
export function pruneLevel(
    tree: ThoughtTree,
    depth: number,
    config: ToTConfig = DEFAULT_CONFIG,
): number {
    let pruned = 0

    for (const node of tree.nodes.values()) {
        if (node.depth === depth && node.state !== "pruned" && node.state !== "completed") {
            if (node.score < config.pruneThreshold) {
                node.state = "pruned"
                pruned++
                tree.totalPruned++
            }
        }
    }

    return pruned
}

/**
 * Select the top-K nodes at a given depth (beam search selection).
 *
 * Returns the selected nodes, marks others as pruned.
 */
export function beamSelect(
    tree: ThoughtTree,
    depth: number,
    config: ToTConfig = DEFAULT_CONFIG,
): ThoughtNode[] {
    const candidates = [...tree.nodes.values()]
        .filter(n => n.depth === depth && n.state !== "pruned")
        .sort((a, b) => b.score - a.score)

    // Keep top-K
    const selected = candidates.slice(0, config.beamWidth)
    const pruned = candidates.slice(config.beamWidth)

    // Mark selected as exploring
    for (const node of selected) {
        node.state = "exploring"
    }

    // Mark rest as pruned
    for (const node of pruned) {
        node.state = "pruned"
        tree.totalPruned++
    }

    return selected
}

/**
 * Find the best path from root to the highest-scoring leaf.
 *
 * Uses greedy backtracking: start from best leaf, walk up to root.
 */
export function findBestPath(tree: ThoughtTree): ThoughtNode[] {
    if (!tree.bestLeaf) return []

    const path: ThoughtNode[] = []
    let current: ThoughtNode | undefined = tree.bestLeaf

    // Walk up from best leaf to root
    while (current) {
        current.isBestPath = true
        path.unshift(current)
        current = current.parentId ? tree.nodes.get(current.parentId) : undefined
    }

    return path
}

/**
 * Get all leaf nodes (nodes with no children).
 */
export function getLeaves(tree: ThoughtTree): ThoughtNode[] {
    return [...tree.nodes.values()].filter(n =>
        n.children.length === 0 && n.state !== "pruned"
    )
}

/**
 * Get nodes at a specific depth.
 */
export function getLevel(tree: ThoughtTree, depth: number): ThoughtNode[] {
    return [...tree.nodes.values()].filter(n => n.depth === depth)
}

/**
 * Format tree as a visual string for debugging.
 */
export function formatTree(tree: ThoughtTree): string {
    const lines: string[] = [`Tree (${tree.totalGenerated} nodes, ${tree.totalPruned} pruned)`]

    function renderNode(nodeId: string, indent: number): void {
        const node = tree.nodes.get(nodeId)
        if (!node) return

        const prefix = "  ".repeat(indent)
        const icon = node.state === "pruned" ? "✂️"
            : node.isBestPath ? "★"
            : node.state === "completed" ? "✅"
            : "○"
        const scoreStr = node.score.toFixed(2)
        lines.push(`${prefix}${icon} [${scoreStr}] ${node.thought.slice(0, 60)}`)

        for (const childId of node.children) {
            renderNode(childId, indent + 1)
        }
    }

    renderNode(tree.rootId, 0)
    return lines.join("\n")
}

// ── Tree-of-Thought Manager ───────────────────────────────────────────────

/**
 * Create a Tree-of-Thought reasoning manager.
 *
 * Provides a high-level API for BFS exploration with automatic pruning.
 */
export function createToTManager(config: ToTConfig = DEFAULT_CONFIG) {
    const trees: ThoughtTree[] = []
    let metrics: ToTMetrics = {
        treesCreated: 0,
        totalNodes: 0,
        totalPruned: 0,
        avgDepth: 0,
        avgBestScore: 0,
    }

    /**
     * Start reasoning about a problem.
     */
    function startReasoning(problem: string): ThoughtTree {
        const tree = createTree(problem)
        trees.push(tree)
        metrics.treesCreated++
        return tree
    }

    /**
     * Generate and evaluate child thoughts for a parent node.
     *
     * Takes a generator function that produces (thought, score) pairs.
     */
    function expandNode(
        tree: ThoughtTree,
        parentId: string,
        thoughts: Array<{ thought: string; score: number; metadata?: Record<string, unknown> }>,
    ): ThoughtNode[] {
        const parent = tree.nodes.get(parentId)
        if (!parent) return []

        // Check depth limit
        if (parent.depth >= config.maxDepth) return []

        // Check total node limit
        if (tree.totalGenerated >= config.maxNodes) return []

        const created: ThoughtNode[] = []
        for (const t of thoughts) {
            if (tree.totalGenerated >= config.maxNodes) break
            const node = addThought(tree, parentId, t.thought, t.score, t.metadata)
            if (node) created.push(node)
        }

        // Mark parent as completed
        parent.state = "completed"

        return created
    }

    /**
     * Run one level of BFS exploration:
     * 1. Get all exploring nodes at current depth
     * 2. Prune low-scoring ones
     * 3. Select top-K via beam search
     *
     * Returns the selected nodes to expand next.
     */
    function exploreBFS(tree: ThoughtTree, depth: number): ThoughtNode[] {
        // First prune below threshold
        pruneLevel(tree, depth, config)

        // Then select top-K
        return beamSelect(tree, depth, config)
    }

    /**
     * Complete reasoning and return the best path.
     */
    function completeReasoning(tree: ThoughtTree): ThoughtNode[] {
        const path = findBestPath(tree)

        // Update metrics
        metrics.totalNodes += tree.totalGenerated
        metrics.totalPruned += tree.totalPruned
        const allDepths = trees.map(t => t.maxDepthReached)
        metrics.avgDepth = allDepths.reduce((a, b) => a + b, 0) / allDepths.length
        const allScores = trees.map(t => t.bestLeaf?.score ?? 0)
        metrics.avgBestScore = allScores.reduce((a, b) => a + b, 0) / allScores.length

        log("[tree-of-thought] Reasoning complete", {
            nodes: tree.totalGenerated,
            pruned: tree.totalPruned,
            maxDepth: tree.maxDepthReached,
            bestScore: tree.bestLeaf?.score.toFixed(2),
            pathLength: path.length,
        })

        return path
    }

    /**
     * Get current metrics.
     */
    function getMetrics(): ToTMetrics {
        return { ...metrics }
    }

    /**
     * Reset all state (for testing).
     */
    function reset(): void {
        trees.length = 0
        metrics = {
            treesCreated: 0,
            totalNodes: 0,
            totalPruned: 0,
            avgDepth: 0,
            avgBestScore: 0,
        }
        globalNodeCounter = 0
    }

    return {
        startReasoning,
        expandNode,
        exploreBFS,
        completeReasoning,
        getMetrics,
        reset,
    }
}

/** Exported for testing */
export { globalNodeCounter }
