/**
 * Knowledge Graph Pipeline — Test Suite
 *
 * Tests the 4-wave pipeline:
 * Wave 1: scanProject (file discovery + filtering)
 * Wave 2: analyzeFile (entity + relation extraction)
 * Wave 3: analyzeArchitecture (layer identification)
 * Wave 4: reviewGraph (validation + correction)
 * Pipeline: full end-to-end pipeline execution
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    scanProject,
    isInIgnoredDir,
    getExtension,
    analyzeFile,
    analyzeArchitecture,
    reviewGraph,
    createKGPipeline,
    type KnowledgeGraph,
    type KGEntity,
    type KGRelation,
} from "./index"

// ── Helpers ────────────────────────────────────────────────────────────────

function makeFileList(paths: string[]): Array<{ path: string; sizeBytes: number; mtime: number }> {
    return paths.map(path => ({ path, sizeBytes: 1000, mtime: Date.now() }))
}

function makeGraph(
    entities: KGEntity[] = [],
    relations: KGRelation[] = [],
): KnowledgeGraph {
    const entityMap = new Map<string, KGEntity>()
    for (const e of entities) entityMap.set(e.qualifiedName, e)
    return {
        entities: entityMap,
        relations,
        projectRoot: "/test",
        lastUpdated: Date.now(),
        analyzedFiles: new Map(),
    }
}

function makeEntity(overrides: Partial<KGEntity> = {}): KGEntity {
    const name = overrides.name ?? "TestEntity"
    return {
        qualifiedName: overrides.qualifiedName ?? `test.ts::${name}`,
        name,
        kind: "function",
        filePath: "test.ts",
        line: 1,
        description: "Test entity",
        tags: ["function"],
        discoveredAt: Date.now(),
        updatedAt: Date.now(),
        confidence: 0.8,
        ...overrides,
    }
}

// ── Wave 1: Project Scanner ────────────────────────────────────────────────

describe("scanProject", () => {
    it("discovers TypeScript files", () => {
        const result = scanProject(makeFileList(["src/index.ts", "src/utils.ts"]))
        expect(result.totalFiles).toBe(2)
        expect(result.files[0].language).toBe("typescript")
    })

    it("filters node_modules", () => {
        const result = scanProject(makeFileList([
            "src/index.ts",
            "node_modules/lodash/index.js",
        ]))
        expect(result.totalFiles).toBe(1)
        expect(result.filteredOut).toBe(1)
    })

    it("filters binary extensions", () => {
        const result = scanProject(makeFileList([
            "src/index.ts",
            "assets/logo.png",
            "assets/icon.svg",
        ]))
        expect(result.totalFiles).toBe(1)
        expect(result.filteredOut).toBe(2)
    })

    it("filters files exceeding size limit", () => {
        const files = [
            { path: "src/small.ts", sizeBytes: 1000, mtime: Date.now() },
            { path: "src/huge.ts", sizeBytes: 2_000_000, mtime: Date.now() },
        ]
        const result = scanProject(files)
        expect(result.totalFiles).toBe(1)
    })

    it("detects Rust language", () => {
        const result = scanProject(makeFileList(["src/main.rs"]))
        expect(result.files[0].language).toBe("rust")
    })

    it("detects Python language", () => {
        const result = scanProject(makeFileList(["app/main.py"]))
        expect(result.files[0].language).toBe("python")
    })

    it("handles empty input", () => {
        const result = scanProject([])
        expect(result.totalFiles).toBe(0)
        expect(result.filteredOut).toBe(0)
    })

    it("filters .git directory", () => {
        const result = scanProject(makeFileList([".git/config", "src/app.ts"]))
        expect(result.totalFiles).toBe(1)
    })
})

describe("isInIgnoredDir", () => {
    it("detects node_modules", () => {
        expect(isInIgnoredDir("node_modules/pkg/index.js")).toBe(true)
    })

    it("detects nested .git", () => {
        expect(isInIgnoredDir("sub/.git/config")).toBe(true)
    })

    it("allows src path", () => {
        expect(isInIgnoredDir("src/hooks/index.ts")).toBe(false)
    })
})

describe("getExtension", () => {
    it("extracts .ts", () => {
        expect(getExtension("src/index.ts")).toBe(".ts")
    })

    it("extracts .rs", () => {
        expect(getExtension("src/main.rs")).toBe(".rs")
    })

    it("returns empty for no extension", () => {
        expect(getExtension("Makefile")).toBe("")
    })

    it("handles multiple dots", () => {
        expect(getExtension("file.test.ts")).toBe(".ts")
    })
})

// ── Wave 2: File Analyzer ──────────────────────────────────────────────────

describe("analyzeFile", () => {
    it("extracts exported functions from TypeScript", () => {
        const content = `
export function createGuard() {
    return {}
}

export async function processInput(data: string) {
    return data
}
`
        const result = analyzeFile("src/guard.ts", content, "typescript")
        expect(result.entities.length).toBe(2)
        expect(result.entities[0].name).toBe("createGuard")
        expect(result.entities[1].name).toBe("processInput")
    })

    it("extracts classes and interfaces from TypeScript", () => {
        const content = `
export interface Config {
    name: string
}

export class GuardEngine {
    run() {}
}
`
        const result = analyzeFile("src/engine.ts", content, "typescript")
        expect(result.entities.length).toBe(2)
        const kinds = result.entities.map(e => e.kind)
        expect(kinds).toContain("interface")
        expect(kinds).toContain("class")
    })

    it("extracts type aliases and enums from TypeScript", () => {
        const content = `
export type Status = "active" | "inactive"
export enum Priority {
    High,
    Low,
}
`
        const result = analyzeFile("src/types.ts", content, "typescript")
        expect(result.entities.length).toBe(2)
    })

    it("extracts constants from TypeScript", () => {
        const content = `export const MAX_RETRIES = 3`
        const result = analyzeFile("src/config.ts", content, "typescript")
        expect(result.entities.length).toBe(1)
        expect(result.entities[0].kind).toBe("constant")
    })

    it("extracts import relations from TypeScript", () => {
        const content = `
import { log } from "../shared/logger"
import { Config } from "./types"
`
        const result = analyzeFile("src/hooks/guard/index.ts", content, "typescript")
        expect(result.relations.length).toBe(2)
        expect(result.relations[0].kind).toBe("imports")
    })

    it("extracts functions from Rust", () => {
        const content = `
pub fn create_engine() -> Engine {
    Engine::new()
}

pub async fn process(data: &str) -> Result<()> {
    Ok(())
}
`
        const result = analyzeFile("src/engine.rs", content, "rust")
        expect(result.entities.length).toBe(2)
        expect(result.entities[0].name).toBe("create_engine")
    })

    it("extracts structs and traits from Rust", () => {
        const content = `
pub struct Config {
    name: String,
}

pub trait Processor {
    fn process(&self);
}

pub enum Status {
    Active,
    Inactive,
}
`
        const result = analyzeFile("src/types.rs", content, "rust")
        expect(result.entities.length).toBe(3)
    })

    it("extracts functions and classes from Python", () => {
        const content = `
def process_data(input):
    return input

class DataEngine:
    def run(self):
        pass
`
        const result = analyzeFile("app/engine.py", content, "python")
        expect(result.entities.length).toBe(2)
    })

    it("marks entities in hooks directory as hook kind", () => {
        const content = `export function createGuard() {}`
        const result = analyzeFile("src/hooks/guard/index.ts", content, "typescript")
        expect(result.entities[0].kind).toBe("hook")
    })

    it("marks entities in test files as test kind", () => {
        const content = `export function testGuard() {}`
        const result = analyzeFile("src/guard.test.ts", content, "typescript")
        expect(result.entities[0].kind).toBe("test")
    })

    it("handles empty file", () => {
        const result = analyzeFile("src/empty.ts", "", "typescript")
        expect(result.entities).toHaveLength(0)
        expect(result.confidence).toBe(0.5)
    })

    it("extracts JSDoc descriptions", () => {
        const content = `
/**
 * Create a new input guard with the given patterns.
 */
export function createInputGuard() {}
`
        const result = analyzeFile("src/guard.ts", content, "typescript")
        expect(result.entities[0].description).toContain("input guard")
    })

    it("extracts Rust doc comments", () => {
        const content = `
/// Create a new engine instance.
pub fn create_engine() {}
`
        const result = analyzeFile("src/lib.rs", content, "rust")
        expect(result.entities[0].description).toContain("engine")
    })

    it("limits entities per file", () => {
        // Generate a file with 100 exports
        const lines = Array.from({ length: 100 }, (_, i) => `export function func${i}() {}`)
        const content = lines.join("\n")
        const result = analyzeFile("src/big.ts", content, "typescript")
        expect(result.entities.length).toBeLessThanOrEqual(50)
    })
})

// ── Wave 3: Architecture Analyzer ──────────────────────────────────────────

describe("analyzeArchitecture", () => {
    it("groups entities by directory", () => {
        const entities = [
            makeEntity({ qualifiedName: "src/hooks/a.ts::funcA", filePath: "src/hooks/a.ts" }),
            makeEntity({ qualifiedName: "src/hooks/b.ts::funcB", filePath: "src/hooks/b.ts" }),
            makeEntity({ qualifiedName: "src/tools/c.ts::funcC", filePath: "src/tools/c.ts" }),
            makeEntity({ qualifiedName: "src/tools/d.ts::funcD", filePath: "src/tools/d.ts" }),
        ]
        const graph = makeGraph(entities)
        const insights = analyzeArchitecture(graph)

        expect(insights.length).toBeGreaterThanOrEqual(2)
        const layers = insights.map(i => i.layer)
        expect(layers).toContain("hooks")
        expect(layers).toContain("tools")
    })

    it("skips single-entity groups", () => {
        const entities = [
            makeEntity({ qualifiedName: "lonely/single.ts::func", filePath: "lonely/single.ts" }),
        ]
        const graph = makeGraph(entities)
        const insights = analyzeArchitecture(graph)
        expect(insights.length).toBe(0)
    })

    it("identifies cross-layer relations", () => {
        const entities = [
            makeEntity({ qualifiedName: "src/hooks/a.ts::hookA", filePath: "src/hooks/a.ts" }),
            makeEntity({ qualifiedName: "src/hooks/b.ts::hookB", filePath: "src/hooks/b.ts" }),
            makeEntity({ qualifiedName: "src/shared/log.ts::logger", filePath: "src/shared/log.ts" }),
            makeEntity({ qualifiedName: "src/shared/utils.ts::utils", filePath: "src/shared/utils.ts" }),
        ]
        const relations: KGRelation[] = [{
            from: "src/hooks/a.ts::hookA",
            to: "src/shared/log.ts::logger",
            kind: "imports",
            weight: 0.8,
            discoveredAt: Date.now(),
            evidence: "import { log } from '../../shared/logger'",
        }]
        const graph = makeGraph(entities, relations)
        const insights = analyzeArchitecture(graph)
        expect(insights.some(i => i.layerRelations.length > 0)).toBe(true)
    })
})

// ── Wave 4: Graph Reviewer ─────────────────────────────────────────────────

describe("reviewGraph", () => {
    it("removes low-confidence orphan entities", () => {
        const entities = [
            makeEntity({ qualifiedName: "a.ts::valid", confidence: 0.8 }),
            makeEntity({ qualifiedName: "b.ts::orphan", confidence: 0.2 }),
        ]
        const graph = makeGraph(entities, [])
        const result = reviewGraph(graph)
        expect(result.orphansRemoved).toBeGreaterThan(0)
        // Valid orphans (high confidence) should stay
        expect(graph.entities.has("a.ts::valid")).toBe(true)
    })

    it("merges duplicate entities", () => {
        const entities = [
            makeEntity({ qualifiedName: "a.ts::Func_v1", name: "Func", filePath: "a.ts", confidence: 0.9 }),
            makeEntity({ qualifiedName: "a.ts::Func_v2", name: "Func", filePath: "a.ts", confidence: 0.5 }),
        ]
        const graph = makeGraph(entities)
        const result = reviewGraph(graph)
        expect(result.duplicatesMerged).toBe(1)
        expect(graph.entities.size).toBe(1)
    })

    it("keeps higher-confidence duplicate", () => {
        const entities = [
            makeEntity({ qualifiedName: "a.ts::High", name: "Thing", filePath: "a.ts", confidence: 0.9 }),
            makeEntity({ qualifiedName: "a.ts::Low", name: "Thing", filePath: "a.ts", confidence: 0.3 }),
        ]
        const graph = makeGraph(entities)
        reviewGraph(graph)
        const remaining = [...graph.entities.values()][0]
        expect(remaining.confidence).toBe(0.9)
    })

    it("removes broken relations", () => {
        const entities = [
            makeEntity({ qualifiedName: "a.ts::Func" }),
        ]
        const relations: KGRelation[] = [
            { from: "a.ts::Func", to: "b.ts::Missing", kind: "calls", weight: 0.8, discoveredAt: Date.now(), evidence: "" },
            { from: "nonexistent::thing", to: "a.ts::Func", kind: "imports", weight: 0.5, discoveredAt: Date.now(), evidence: "" },
        ]
        const graph = makeGraph(entities, relations)
        const result = reviewGraph(graph)
        // The first relation has valid 'from', so it stays
        // The second has invalid 'from'
        expect(result.relationsValidated).toBeGreaterThanOrEqual(1)
    })

    it("flags low-confidence entities in issues", () => {
        const entities = [
            makeEntity({ qualifiedName: "x.ts::Weak", confidence: 0.4 }),
        ]
        // Add a self-referencing relation so it's not an orphan
        const relations: KGRelation[] = [
            { from: "x.ts::Weak", to: "x.ts::Weak", kind: "calls", weight: 0.5, discoveredAt: Date.now(), evidence: "" },
        ]
        const graph = makeGraph(entities, relations)
        const result = reviewGraph(graph)
        expect(result.issues.some(i => i.includes("Low confidence"))).toBe(true)
    })
})

// ── Pipeline Manager ───────────────────────────────────────────────────────

describe("createKGPipeline", () => {
    let pipeline: ReturnType<typeof createKGPipeline>

    beforeEach(() => {
        pipeline = createKGPipeline("/test/project")
    })

    it("runs full pipeline with TypeScript files", async () => {
        const files = makeFileList(["src/index.ts", "src/utils.ts"])
        const getContent = async (path: string) => {
            if (path === "src/index.ts") {
                return `
import { helper } from "./utils"
export function main() { helper() }
`
            }
            return `export function helper() { return 42 }`
        }

        const result = await pipeline.runPipeline(files, getContent)
        expect(result.scanResult.totalFiles).toBe(2)
        expect(result.analysisResults.length).toBe(2)
        expect(pipeline.getMetrics().entityCount).toBeGreaterThan(0)
    })

    it("supports incremental analysis", async () => {
        const files = makeFileList(["src/a.ts"])
        const getContent = async () => `export function test() {}`

        // First run
        await pipeline.runPipeline(files, getContent, true)
        const firstCount = pipeline.getMetrics().entityCount

        // Second run with same mtime — should skip analysis
        await pipeline.runPipeline(files, getContent, true)
        expect(pipeline.getMetrics().entityCount).toBe(firstCount)
    })

    it("queries entities by kind", async () => {
        const files = makeFileList(["src/hooks/guard/index.ts"])
        const getContent = async () => `export function createGuard() {}`

        await pipeline.runPipeline(files, getContent, false)
        const hooks = pipeline.queryByKind("hook")
        expect(hooks.length).toBeGreaterThan(0)
    })

    it("searches entities by name", async () => {
        const files = makeFileList(["src/engine.ts"])
        const getContent = async () => `
export function createEngine() {}
export function destroyEngine() {}
`
        await pipeline.runPipeline(files, getContent, false)
        const results = pipeline.searchEntities("engine")
        expect(results.length).toBe(2)
    })

    it("exports for visualization", async () => {
        const files = makeFileList(["src/app.ts"])
        const getContent = async () => `export function main() {}`

        await pipeline.runPipeline(files, getContent, false)
        const viz = pipeline.exportForVisualization()
        expect(viz.nodes.length).toBeGreaterThan(0)
    })

    it("tracks pipeline metrics", async () => {
        const files = makeFileList(["src/app.ts"])
        const getContent = async () => `export function main() {}`

        await pipeline.runPipeline(files, getContent, false)
        const metrics = pipeline.getMetrics()
        expect(metrics.totalRuns).toBe(1)
        expect(metrics.filesAnalyzed).toBe(1)
        expect(metrics.lastRunDurationMs).toBeGreaterThanOrEqual(0)
    })

    it("handles file read errors gracefully", async () => {
        const files = makeFileList(["src/broken.ts"])
        const getContent = async () => { throw new Error("File not found") }

        const result = await pipeline.runPipeline(files, getContent, false)
        expect(result.analysisResults.length).toBe(1) // Still returns result
        expect(result.analysisResults[0].entities).toHaveLength(0)
    })

    it("resets state", async () => {
        const files = makeFileList(["src/app.ts"])
        const getContent = async () => `export function main() {}`

        await pipeline.runPipeline(files, getContent, false)
        pipeline.reset()
        expect(pipeline.getMetrics().entityCount).toBe(0)
        expect(pipeline.getMetrics().totalRuns).toBe(0)
    })
})
