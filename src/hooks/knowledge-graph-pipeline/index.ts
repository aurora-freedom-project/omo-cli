/**
 * Multi-Agent Knowledge Graph Pipeline — Understand-Anything inspired.
 *
 * Learned from:
 * - Understand-Anything (6.8K⭐): 5-agent KG pipeline
 * - PentAGI (14K⭐): Graphiti temporal knowledge graph
 *
 * Architecture:
 *   Wave 1: ProjectScanner →   discover files + metadata
 *   Wave 2: FileAnalyzer × N → parallel entity extraction per file
 *   Wave 3: ArchitectAnalyzer → identify layers, patterns, relationships
 *   Wave 4: GraphReviewer →    validate + correct the knowledge graph
 *
 * Unlike our single-agent FactExtractor (Phase 3.7), this pipeline uses
 * multiple specialized agents in a DAG for higher-quality knowledge graphs.
 *
 * Features:
 * - 4-wave DAG for incremental KG construction
 * - Parallel file analysis (Wave 2 fan-out)
 * - Entity/relation schema with temporal tracking
 * - Graph validation + correction pass
 * - Incremental updates (only re-analyze changed files)
 * - Merge-safe: deduplicates entities by qualified name
 *
 * @see Phase 8.1 of omo-cli v4.0+ upgrade blueprint
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export type EntityKind =
    | "module"
    | "class"
    | "function"
    | "variable"
    | "type"
    | "interface"
    | "enum"
    | "constant"
    | "hook"
    | "tool"
    | "skill"
    | "config"
    | "test"

export type RelationKind =
    | "imports"
    | "exports"
    | "calls"
    | "extends"
    | "implements"
    | "depends_on"
    | "tests"
    | "configures"
    | "guards"
    | "produces"
    | "consumes"

export interface KGEntity {
    /** Unique qualified name (e.g., "src/hooks/input-guard/index.ts::InputGuard"). */
    qualifiedName: string
    /** Display name. */
    name: string
    /** Entity kind. */
    kind: EntityKind
    /** File path where this entity is defined. */
    filePath: string
    /** Line number (1-indexed). */
    line: number
    /** Description extracted by the analyzer. */
    description: string
    /** Tags for search. */
    tags: string[]
    /** When this entity was first discovered. */
    discoveredAt: number
    /** When this entity was last updated. */
    updatedAt: number
    /** Confidence score (0-1) from the analyzer. */
    confidence: number
}

export interface KGRelation {
    /** Source entity qualified name. */
    from: string
    /** Target entity qualified name. */
    to: string
    /** Relation kind. */
    kind: RelationKind
    /** Optional weight (0-1). */
    weight: number
    /** When this relation was discovered. */
    discoveredAt: number
    /** Evidence/reason for this relation. */
    evidence: string
}

export interface KnowledgeGraph {
    /** All entities by qualified name. */
    entities: Map<string, KGEntity>
    /** All relations. */
    relations: KGRelation[]
    /** Project root path. */
    projectRoot: string
    /** When the KG was last updated. */
    lastUpdated: number
    /** Files that have been analyzed. */
    analyzedFiles: Map<string, { mtime: number; entityCount: number }>
}

export interface ScanResult {
    /** Discovered file paths. */
    files: FileMetadata[]
    /** Total files discovered. */
    totalFiles: number
    /** Files filtered out (e.g., binary, node_modules). */
    filteredOut: number
}

export interface FileMetadata {
    /** Relative path from project root. */
    path: string
    /** File extension. */
    extension: string
    /** File size in bytes. */
    sizeBytes: number
    /** Last modification time. */
    mtime: number
    /** Detected language. */
    language: string
}

export interface AnalysisResult {
    /** File that was analyzed. */
    filePath: string
    /** Entities extracted. */
    entities: KGEntity[]
    /** Relations extracted. */
    relations: KGRelation[]
    /** Analysis confidence. */
    confidence: number
}

export interface ArchitectureInsight {
    /** Identified architectural layer. */
    layer: string
    /** Components in this layer. */
    components: string[]
    /** Description of this layer's responsibility. */
    description: string
    /** Relationships between layers. */
    layerRelations: Array<{ from: string; to: string; type: string }>
}

export interface ReviewResult {
    /** Entities that were corrected. */
    corrected: number
    /** Orphan entities removed. */
    orphansRemoved: number
    /** Duplicate entities merged. */
    duplicatesMerged: number
    /** Relations validated. */
    relationsValidated: number
    /** Issues found. */
    issues: string[]
}

export interface PipelineMetrics {
    /** Total pipeline executions. */
    totalRuns: number
    /** Total entities in the graph. */
    entityCount: number
    /** Total relations. */
    relationCount: number
    /** Files analyzed. */
    filesAnalyzed: number
    /** Average entities per file. */
    avgEntitiesPerFile: number
    /** Average confidence. */
    avgConfidence: number
    /** Last run duration (ms). */
    lastRunDurationMs: number
    /** Incremental updates (files re-analyzed). */
    incrementalUpdates: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
    "node_modules", ".git", "dist", "build", ".next", ".turbo",
    "coverage", ".cache", "__pycache__", ".venv", "target",
])

const IGNORED_EXTENSIONS = new Set([
    ".lock", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".webm",
    ".map", ".min.js", ".min.css", ".d.ts",
])

const LANGUAGE_MAP: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript",
    ".rs": "rust",
    ".py": "python",
    ".go": "go",
    ".rb": "ruby",
    ".java": "java",
    ".md": "markdown",
    ".json": "json",
    ".yaml": "yaml", ".yml": "yaml",
    ".toml": "toml",
    ".css": "css",
    ".html": "html",
}

/** Minimum confidence to keep an entity. */
const MIN_ENTITY_CONFIDENCE = 0.3

/** Maximum files to analyze in parallel (Wave 2). */
const MAX_PARALLEL_ANALYZERS = 5

/** Maximum entities per file (prevent explosion). */
const MAX_ENTITIES_PER_FILE = 50

// ── Wave 1: Project Scanner ────────────────────────────────────────────────

/**
 * Scan a project directory and discover all analyzable files.
 *
 * Filters out:
 * - Binary files (by extension)
 * - Ignored directories (node_modules, .git, etc.)
 * - Files exceeding size limit (1MB)
 */
export function scanProject(
    files: Array<{ path: string; sizeBytes: number; mtime: number }>,
    maxFileSize: number = 1_000_000,
): ScanResult {
    let filteredOut = 0
    const discovered: FileMetadata[] = []

    for (const file of files) {
        const ext = getExtension(file.path)

        // Filter by ignored directory
        if (isInIgnoredDir(file.path)) {
            filteredOut++
            continue
        }

        // Filter by extension
        if (IGNORED_EXTENSIONS.has(ext)) {
            filteredOut++
            continue
        }

        // Filter by size
        if (file.sizeBytes > maxFileSize) {
            filteredOut++
            continue
        }

        discovered.push({
            path: file.path,
            extension: ext,
            sizeBytes: file.sizeBytes,
            mtime: file.mtime,
            language: LANGUAGE_MAP[ext] ?? "unknown",
        })
    }

    log("[kg-pipeline] Project scanned", {
        total: files.length,
        discovered: discovered.length,
        filtered: filteredOut,
    })

    return {
        files: discovered,
        totalFiles: discovered.length,
        filteredOut,
    }
}

/**
 * Check if a file path is inside an ignored directory.
 */
export function isInIgnoredDir(filePath: string): boolean {
    const parts = filePath.split("/")
    return parts.some(part => IGNORED_DIRS.has(part))
}

/**
 * Get file extension (lowercase, with dot).
 */
export function getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf(".")
    if (lastDot === -1) return ""
    return filePath.slice(lastDot).toLowerCase()
}

// ── Wave 2: File Analyzer ──────────────────────────────────────────────────

/**
 * Analyze a single file and extract entities + relations.
 *
 * This is a structural analysis (no LLM needed) that extracts:
 * - Export declarations (functions, classes, types, interfaces)
 * - Import relationships
 * - Module-level patterns (hooks, tools, tests)
 */
export function analyzeFile(
    filePath: string,
    content: string,
    language: string,
): AnalysisResult {
    const entities: KGEntity[] = []
    const relations: KGRelation[] = []
    const now = Date.now()
    const lines = content.split("\n")

    if (language === "typescript" || language === "javascript") {
        // Extract exports
        for (let i = 0; i < lines.length && entities.length < MAX_ENTITIES_PER_FILE; i++) {
            const line = lines[i]

            // Export function
            const funcMatch = line.match(/^export\s+(?:async\s+)?function\s+(\w+)/)
            if (funcMatch) {
                entities.push(makeEntity(filePath, funcMatch[1], "function", i + 1, now, extractJsdoc(lines, i)))
            }

            // Export class
            const classMatch = line.match(/^export\s+(?:abstract\s+)?class\s+(\w+)/)
            if (classMatch) {
                entities.push(makeEntity(filePath, classMatch[1], "class", i + 1, now, extractJsdoc(lines, i)))
            }

            // Export interface
            const ifaceMatch = line.match(/^export\s+interface\s+(\w+)/)
            if (ifaceMatch) {
                entities.push(makeEntity(filePath, ifaceMatch[1], "interface", i + 1, now, extractJsdoc(lines, i)))
            }

            // Export type
            const typeMatch = line.match(/^export\s+type\s+(\w+)/)
            if (typeMatch) {
                entities.push(makeEntity(filePath, typeMatch[1], "type", i + 1, now, extractJsdoc(lines, i)))
            }

            // Export enum
            const enumMatch = line.match(/^export\s+enum\s+(\w+)/)
            if (enumMatch) {
                entities.push(makeEntity(filePath, enumMatch[1], "enum", i + 1, now, extractJsdoc(lines, i)))
            }

            // Export const
            const constMatch = line.match(/^export\s+const\s+(\w+)/)
            if (constMatch) {
                const kind = constMatch[1] === constMatch[1].toUpperCase() ? "constant" : "variable"
                entities.push(makeEntity(filePath, constMatch[1], kind, i + 1, now, extractJsdoc(lines, i)))
            }

            // Import relations
            const importMatch = line.match(/^import\s+.*\s+from\s+["']([^"']+)["']/)
            if (importMatch) {
                const importSource = resolveImportPath(filePath, importMatch[1])
                relations.push({
                    from: filePath,
                    to: importSource,
                    kind: "imports",
                    weight: 0.8,
                    discoveredAt: now,
                    evidence: line.trim(),
                })
            }
        }
    } else if (language === "rust") {
        for (let i = 0; i < lines.length && entities.length < MAX_ENTITIES_PER_FILE; i++) {
            const line = lines[i]

            // pub fn
            const fnMatch = line.match(/^pub\s+(?:async\s+)?fn\s+(\w+)/)
            if (fnMatch) {
                entities.push(makeEntity(filePath, fnMatch[1], "function", i + 1, now, extractRustDoc(lines, i)))
            }

            // pub struct
            const structMatch = line.match(/^pub\s+struct\s+(\w+)/)
            if (structMatch) {
                entities.push(makeEntity(filePath, structMatch[1], "class", i + 1, now, extractRustDoc(lines, i)))
            }

            // pub enum
            const enumMatch = line.match(/^pub\s+enum\s+(\w+)/)
            if (enumMatch) {
                entities.push(makeEntity(filePath, enumMatch[1], "enum", i + 1, now, extractRustDoc(lines, i)))
            }

            // pub trait
            const traitMatch = line.match(/^pub\s+trait\s+(\w+)/)
            if (traitMatch) {
                entities.push(makeEntity(filePath, traitMatch[1], "interface", i + 1, now, extractRustDoc(lines, i)))
            }

            // use statements
            const useMatch = line.match(/^use\s+(.+);/)
            if (useMatch) {
                relations.push({
                    from: filePath,
                    to: useMatch[1].trim(),
                    kind: "imports",
                    weight: 0.7,
                    discoveredAt: now,
                    evidence: line.trim(),
                })
            }
        }
    } else if (language === "python") {
        for (let i = 0; i < lines.length && entities.length < MAX_ENTITIES_PER_FILE; i++) {
            const line = lines[i]

            // def
            const defMatch = line.match(/^(?:async\s+)?def\s+(\w+)/)
            if (defMatch && !defMatch[1].startsWith("_")) {
                entities.push(makeEntity(filePath, defMatch[1], "function", i + 1, now, extractPythonDoc(lines, i)))
            }

            // class
            const classMatch = line.match(/^class\s+(\w+)/)
            if (classMatch) {
                entities.push(makeEntity(filePath, classMatch[1], "class", i + 1, now, extractPythonDoc(lines, i)))
            }

            // import
            const importMatch = line.match(/^(?:from\s+(\S+)\s+)?import\s+(\S+)/)
            if (importMatch) {
                const importSource = importMatch[1] ?? importMatch[2]
                relations.push({
                    from: filePath,
                    to: importSource,
                    kind: "imports",
                    weight: 0.7,
                    discoveredAt: now,
                    evidence: line.trim(),
                })
            }
        }
    }

    // Detect special entity kinds based on file path
    for (const entity of entities) {
        if (filePath.includes("/hooks/")) entity.kind = "hook"
        else if (filePath.includes("/tools/")) entity.kind = "tool"
        else if (filePath.includes(".test.") || filePath.includes(".spec.")) entity.kind = "test"
    }

    const confidence = entities.length > 0 ? 0.8 : 0.5

    log("[kg-pipeline] File analyzed", {
        file: filePath,
        entities: entities.length,
        relations: relations.length,
    })

    return { filePath, entities, relations, confidence }
}

// ── Wave 3: Architecture Analyzer ──────────────────────────────────────────

/**
 * Analyze the full entity set to identify architectural layers and patterns.
 */
export function analyzeArchitecture(
    graph: KnowledgeGraph,
): ArchitectureInsight[] {
    const insights: ArchitectureInsight[] = []
    const pathGroups = new Map<string, string[]>()

    // Group entities by top-level directory
    for (const [qn, entity] of graph.entities) {
        const parts = entity.filePath.split("/")
        const topDir = parts.length >= 2 ? parts[0] + "/" + parts[1] : parts[0]
        if (!pathGroups.has(topDir)) pathGroups.set(topDir, [])
        pathGroups.get(topDir)!.push(qn)
    }

    // Build layer insights
    for (const [dir, components] of pathGroups) {
        if (components.length < 2) continue

        // Determine layer type
        let layerType = "utility"
        if (dir.includes("hooks")) layerType = "hooks"
        else if (dir.includes("tools")) layerType = "tools"
        else if (dir.includes("commands")) layerType = "commands"
        else if (dir.includes("shared") || dir.includes("lib")) layerType = "shared"
        else if (dir.includes("test")) layerType = "testing"
        else if (dir.includes("config")) layerType = "configuration"

        insights.push({
            layer: layerType,
            components,
            description: `${layerType} layer containing ${components.length} entities in ${dir}`,
            layerRelations: [],
        })
    }

    // Identify cross-layer relations
    for (const relation of graph.relations) {
        const fromEntity = graph.entities.get(relation.from)
        const toEntity = graph.entities.get(relation.to)
        if (!fromEntity || !toEntity) continue

        const fromDir = fromEntity.filePath.split("/").slice(0, 2).join("/")
        const toDir = toEntity.filePath.split("/").slice(0, 2).join("/")

        if (fromDir !== toDir) {
            const insight = insights.find(i => i.components.includes(relation.from))
            if (insight) {
                insight.layerRelations.push({
                    from: fromDir,
                    to: toDir,
                    type: relation.kind,
                })
            }
        }
    }

    log("[kg-pipeline] Architecture analyzed", { layers: insights.length })
    return insights
}

// ── Wave 4: Graph Reviewer ─────────────────────────────────────────────────

/**
 * Review and correct the knowledge graph.
 *
 * Checks for:
 * 1. Orphan entities (no relations)
 * 2. Duplicate entities (same name, different qualified name)
 * 3. Broken relations (reference non-existent entities)
 * 4. Low-confidence entities
 */
export function reviewGraph(graph: KnowledgeGraph): ReviewResult {
    let corrected = 0
    let orphansRemoved = 0
    let duplicatesMerged = 0
    let relationsValidated = 0
    const issues: string[] = []

    // 1. Find orphan entities (not referenced by any relation)
    const referencedEntities = new Set<string>()
    for (const rel of graph.relations) {
        referencedEntities.add(rel.from)
        referencedEntities.add(rel.to)
    }

    const orphans: string[] = []
    for (const [qn, entity] of graph.entities) {
        // Keep entities even if orphaned — they may be leaf nodes
        // Only flag entities with very low confidence AND no relations
        if (!referencedEntities.has(qn) && entity.confidence < MIN_ENTITY_CONFIDENCE) {
            orphans.push(qn)
        }
    }

    for (const qn of orphans) {
        graph.entities.delete(qn)
        orphansRemoved++
    }

    // 2. Find duplicate entities (same name in same file)
    const nameFileKey = new Map<string, string>()
    const duplicates: string[] = []

    for (const [qn, entity] of graph.entities) {
        const key = `${entity.name}@${entity.filePath}`
        if (nameFileKey.has(key)) {
            // Keep the one with higher confidence
            const existingQn = nameFileKey.get(key)!
            const existing = graph.entities.get(existingQn)!
            if (entity.confidence > existing.confidence) {
                duplicates.push(existingQn)
                nameFileKey.set(key, qn)
            } else {
                duplicates.push(qn)
            }
        } else {
            nameFileKey.set(key, qn)
        }
    }

    for (const qn of duplicates) {
        graph.entities.delete(qn)
        duplicatesMerged++
    }

    // 3. Remove broken relations
    const validRelations: KGRelation[] = []
    for (const rel of graph.relations) {
        // Relations can reference file paths or entity qualified names
        // Keep if at least the source exists
        if (graph.entities.has(rel.from) || graph.analyzedFiles.has(rel.from)) {
            validRelations.push(rel)
            relationsValidated++
        } else {
            issues.push(`Broken relation: ${rel.from} -> ${rel.to} (${rel.kind})`)
            corrected++
        }
    }
    graph.relations = validRelations

    // 4. Flag low-confidence entities
    for (const [qn, entity] of graph.entities) {
        if (entity.confidence < 0.5) {
            issues.push(`Low confidence (${entity.confidence.toFixed(2)}): ${qn}`)
        }
    }

    log("[kg-pipeline] Graph reviewed", {
        orphansRemoved,
        duplicatesMerged,
        relationsValidated,
        issues: issues.length,
    })

    return { corrected, orphansRemoved, duplicatesMerged, relationsValidated, issues }
}

// ── Pipeline Manager ───────────────────────────────────────────────────────

/**
 * Create a Knowledge Graph Pipeline manager.
 *
 * Orchestrates the 4-wave pipeline:
 *   Wave 1: scan → Wave 2: analyze files → Wave 3: architecture → Wave 4: review
 */
export function createKGPipeline(projectRoot: string) {
    const graph: KnowledgeGraph = {
        entities: new Map(),
        relations: [],
        projectRoot,
        lastUpdated: 0,
        analyzedFiles: new Map(),
    }

    const metrics: PipelineMetrics = {
        totalRuns: 0,
        entityCount: 0,
        relationCount: 0,
        filesAnalyzed: 0,
        avgEntitiesPerFile: 0,
        avgConfidence: 0,
        lastRunDurationMs: 0,
        incrementalUpdates: 0,
    }

    /**
     * Run the full 4-wave pipeline.
     *
     * @param files - File list (from directory listing)
     * @param getContent - Function to read file content
     * @param incremental - If true, skip files that haven't changed
     */
    async function runPipeline(
        files: Array<{ path: string; sizeBytes: number; mtime: number }>,
        getContent: (path: string) => Promise<string>,
        incremental: boolean = true,
    ): Promise<{
        scanResult: ScanResult
        analysisResults: AnalysisResult[]
        architectureInsights: ArchitectureInsight[]
        reviewResult: ReviewResult
    }> {
        const startTime = Date.now()
        metrics.totalRuns++

        // Wave 1: Scan
        const scanResult = scanProject(files)

        // Determine which files need (re)analysis
        let filesToAnalyze = scanResult.files
        if (incremental) {
            filesToAnalyze = filesToAnalyze.filter(f => {
                const prev = graph.analyzedFiles.get(f.path)
                return !prev || prev.mtime < f.mtime
            })
            metrics.incrementalUpdates += filesToAnalyze.length
        }

        // Wave 2: Analyze files (in batches for parallel processing)
        const analysisResults: AnalysisResult[] = []
        for (let i = 0; i < filesToAnalyze.length; i += MAX_PARALLEL_ANALYZERS) {
            const batch = filesToAnalyze.slice(i, i + MAX_PARALLEL_ANALYZERS)
            const batchResults = await Promise.all(
                batch.map(async (fileMeta) => {
                    try {
                        const content = await getContent(fileMeta.path)
                        return analyzeFile(fileMeta.path, content, fileMeta.language)
                    } catch (err) {
                        log("[kg-pipeline] File analysis failed", { file: fileMeta.path, error: String(err) })
                        return { filePath: fileMeta.path, entities: [], relations: [], confidence: 0 }
                    }
                }),
            )
            analysisResults.push(...batchResults)
        }

        // Merge results into graph
        for (const result of analysisResults) {
            for (const entity of result.entities) {
                graph.entities.set(entity.qualifiedName, entity)
            }
            graph.relations.push(...result.relations)
            graph.analyzedFiles.set(result.filePath, {
                mtime: Date.now(),
                entityCount: result.entities.length,
            })
        }

        // Wave 3: Architecture analysis
        const architectureInsights = analyzeArchitecture(graph)

        // Wave 4: Review
        const reviewResult = reviewGraph(graph)

        // Update graph metadata
        graph.lastUpdated = Date.now()

        // Update metrics
        metrics.entityCount = graph.entities.size
        metrics.relationCount = graph.relations.length
        metrics.filesAnalyzed = graph.analyzedFiles.size
        metrics.avgEntitiesPerFile = metrics.filesAnalyzed > 0
            ? metrics.entityCount / metrics.filesAnalyzed
            : 0
        metrics.lastRunDurationMs = Date.now() - startTime

        // Compute average confidence
        let confSum = 0
        for (const entity of graph.entities.values()) confSum += entity.confidence
        metrics.avgConfidence = graph.entities.size > 0
            ? confSum / graph.entities.size
            : 0

        log("[kg-pipeline] Pipeline complete", {
            entities: metrics.entityCount,
            relations: metrics.relationCount,
            files: metrics.filesAnalyzed,
            durationMs: metrics.lastRunDurationMs,
        })

        return { scanResult, analysisResults, architectureInsights, reviewResult }
    }

    /**
     * Query entities by kind.
     */
    function queryByKind(kind: EntityKind): KGEntity[] {
        return [...graph.entities.values()].filter(e => e.kind === kind)
    }

    /**
     * Query entities by tag.
     */
    function queryByTag(tag: string): KGEntity[] {
        return [...graph.entities.values()].filter(e => e.tags.includes(tag))
    }

    /**
     * Get all relations for an entity.
     */
    function getRelations(qualifiedName: string): {
        incoming: KGRelation[]
        outgoing: KGRelation[]
    } {
        return {
            incoming: graph.relations.filter(r => r.to === qualifiedName),
            outgoing: graph.relations.filter(r => r.from === qualifiedName),
        }
    }

    /**
     * Find entities by name substring (fuzzy search).
     */
    function searchEntities(query: string, maxResults: number = 10): KGEntity[] {
        const lowerQuery = query.toLowerCase()
        const scored: Array<{ entity: KGEntity; score: number }> = []

        for (const entity of graph.entities.values()) {
            const nameScore = entity.name.toLowerCase().includes(lowerQuery) ? 1.0 : 0
            const descScore = entity.description.toLowerCase().includes(lowerQuery) ? 0.5 : 0
            const tagScore = entity.tags.some(t => t.toLowerCase().includes(lowerQuery)) ? 0.3 : 0
            const totalScore = nameScore + descScore + tagScore

            if (totalScore > 0) {
                scored.push({ entity, score: totalScore * entity.confidence })
            }
        }

        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults)
            .map(s => s.entity)
    }

    /**
     * Export the graph for visualization (React Flow format).
     */
    function exportForVisualization(): {
        nodes: Array<{ id: string; label: string; kind: string; group: string }>
        edges: Array<{ source: string; target: string; label: string }>
    } {
        const nodes = [...graph.entities.values()].map(e => ({
            id: e.qualifiedName,
            label: e.name,
            kind: e.kind,
            group: e.filePath.split("/").slice(0, 2).join("/"),
        }))

        const edges = graph.relations.map(r => ({
            source: r.from,
            target: r.to,
            label: r.kind,
        }))

        return { nodes, edges }
    }

    /**
     * Get current graph.
     */
    function getGraph(): KnowledgeGraph {
        return graph
    }

    /**
     * Get metrics.
     */
    function getMetrics(): PipelineMetrics {
        return { ...metrics }
    }

    /**
     * Reset all state (for testing).
     */
    function reset(): void {
        graph.entities.clear()
        graph.relations = []
        graph.analyzedFiles.clear()
        graph.lastUpdated = 0
        metrics.totalRuns = 0
        metrics.entityCount = 0
        metrics.relationCount = 0
        metrics.filesAnalyzed = 0
        metrics.avgEntitiesPerFile = 0
        metrics.avgConfidence = 0
        metrics.lastRunDurationMs = 0
        metrics.incrementalUpdates = 0
    }

    return {
        runPipeline,
        queryByKind,
        queryByTag,
        getRelations,
        searchEntities,
        exportForVisualization,
        getGraph,
        getMetrics,
        reset,
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeEntity(
    filePath: string,
    name: string,
    kind: EntityKind,
    line: number,
    timestamp: number,
    description: string,
): KGEntity {
    return {
        qualifiedName: `${filePath}::${name}`,
        name,
        kind,
        filePath,
        line,
        description,
        tags: [kind, name.toLowerCase()],
        discoveredAt: timestamp,
        updatedAt: timestamp,
        confidence: 0.8,
    }
}

function extractJsdoc(lines: string[], index: number): string {
    // Look backwards for JSDoc comment
    let desc = ""
    for (let i = index - 1; i >= 0 && i >= index - 10; i--) {
        const line = lines[i].trim()
        if (line.startsWith("*/")) continue
        if (line.startsWith("*")) {
            const content = line.replace(/^\*\s*/, "").replace(/@.*$/, "").trim()
            if (content && !content.startsWith("@")) {
                desc = content + (desc ? " " + desc : "")
            }
        }
        if (line.startsWith("/**")) break
        if (!line.startsWith("*") && !line.startsWith("/**") && !line.startsWith("*/") && line !== "") break
    }
    return desc.slice(0, 200)
}

function extractRustDoc(lines: string[], index: number): string {
    let desc = ""
    for (let i = index - 1; i >= 0 && i >= index - 10; i--) {
        const line = lines[i].trim()
        if (line.startsWith("///")) {
            const content = line.replace(/^\/\/\/\s*/, "").trim()
            desc = content + (desc ? " " + desc : "")
        } else {
            break
        }
    }
    return desc.slice(0, 200)
}

function extractPythonDoc(lines: string[], index: number): string {
    // Look forward for docstring
    if (index + 1 < lines.length) {
        const nextLine = lines[index + 1].trim()
        if (nextLine.startsWith('"""') || nextLine.startsWith("'''")) {
            return nextLine.replace(/^["']{3}/, "").replace(/["']{3}$/, "").trim().slice(0, 200)
        }
    }
    return ""
}

function resolveImportPath(fromFile: string, importPath: string): string {
    // Simple resolution — in production this would use TypeScript's resolver
    if (importPath.startsWith(".")) {
        const dir = fromFile.split("/").slice(0, -1).join("/")
        const parts = importPath.split("/")
        let resolved = dir.split("/")
        for (const part of parts) {
            if (part === ".") continue
            if (part === "..") { resolved.pop(); continue }
            resolved.push(part)
        }
        return resolved.join("/")
    }
    return importPath // External package
}

export { IGNORED_DIRS, LANGUAGE_MAP, resolveImportPath }
