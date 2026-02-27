import { describe, test, expect, mock, beforeEach } from "bun:test"

// Mock logger
const mockLog = mock(() => { })
mock.module("../../shared/logger", () => ({ log: mockLog }))

// Mock surreal-client
const mockIsConnected = mock(async () => true)
const mockInitSchema = mock(async () => { })
const mockClearCodeIndex = mock(async () => { })
const mockGetIndexedFiles = mock(async () => [])
const mockAddCodeElement = mock(async () => "code_element:test123")
const mockAddCodeRelation = mock(async () => { })

mock.module("../../cli/memory/surreal-client", () => ({
    isConnected: mockIsConnected,
    initSchema: mockInitSchema,
    clearCodeIndex: mockClearCodeIndex,
    getIndexedFiles: mockGetIndexedFiles,
    addCodeElement: mockAddCodeElement,
    addCodeRelation: mockAddCodeRelation,
}))

// Mock embedder
const mockGenerateEmbedding = mock(async () => new Array(384).fill(0.1))
mock.module("../../cli/memory/embedder", () => ({
    generateEmbedding: mockGenerateEmbedding,
}))

// Mock child_process
const mockSpawnSync = mock(() => ({
    stdout: "",
    stderr: "",
    status: 0,
}))
mock.module("child_process", () => ({ spawnSync: mockSpawnSync }))

// Mock fs
mock.module("fs", () => ({
    readFileSync: () => "const x = 1",
    existsSync: () => true,
}))

// Mock code-parser
const mockParseFile = mock(() => ({
    elements: [
        {
            id: "test-id-1",
            name: "testFunction",
            kind: "function",
            file: "src/test.ts",
            lineStart: 1,
            lineEnd: 3,
            signature: "function testFunction(): void",
            exported: true,
            project: "test-project",
            fileHash: "abc123",
        },
    ],
    relations: [],
}))
const mockComputeFileHash = mock(() => "new-hash-123")
mock.module("./code-parser", () => ({
    parseFile: mockParseFile,
    computeFileHash: mockComputeFileHash,
    getLanguage: (f: string) => {
        const ext = "." + f.split(".").pop()?.toLowerCase()
        const extMap: Record<string, string> = {
            ".ts": "typescript", ".cts": "typescript", ".mts": "typescript",
            ".tsx": "tsx",
            ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
            ".go": "go", ".py": "python", ".rs": "rust", ".java": "java",
        }
        return extMap[ext] ?? null
    },
}))

// Mock ast-grep constants
mock.module("../../tools/ast-grep/constants", () => ({
    getSgCliPath: () => "/usr/local/bin/sg",
    LANG_EXTENSIONS: {
        typescript: [".ts", ".cts", ".mts"],
        javascript: [".js", ".jsx", ".mjs", ".cjs"],
        tsx: [".tsx"],
        go: [".go"],
        python: [".py", ".pyi"],
        rust: [".rs"],
        java: [".java"],
    },
}))

import { indexProject } from "./indexer"

describe("code-intel/indexer", () => {
    beforeEach(() => {
        mockLog.mockClear()
        mockIsConnected.mockClear()
        mockInitSchema.mockClear()
        mockClearCodeIndex.mockClear()
        mockGetIndexedFiles.mockClear()
        mockAddCodeElement.mockClear()
        mockAddCodeRelation.mockClear()
        mockSpawnSync.mockClear()
        mockParseFile.mockClear()
        mockGenerateEmbedding.mockClear()
    })

    test("returns error when SurrealDB not connected", async () => {
        mockIsConnected.mockResolvedValueOnce(false)

        const result = await indexProject({
            projectDir: "/test/project",
            project: "test-project",
        })

        expect(result.errors).toContain("SurrealDB not connected. Run 'omo-cli memory start' first.")
        expect(result.elementsIndexed).toBe(0)
    })

    test("clears index when rebuild=true", async () => {
        // git ls-files returns a .ts file
        mockSpawnSync.mockReturnValue({
            stdout: "src/test.ts\n",
            stderr: "",
            status: 0,
        })

        await indexProject({
            projectDir: "/test/project",
            project: "test-project",
            rebuild: true,
        })

        expect(mockClearCodeIndex).toHaveBeenCalledWith("test-project")
    })

    test("skips unchanged files in incremental mode", async () => {
        mockGetIndexedFiles.mockResolvedValueOnce([
            { file: "src/test.ts", fileHash: "new-hash-123" },
        ])

        mockSpawnSync.mockReturnValue({
            stdout: "src/test.ts\n",
            stderr: "",
            status: 0,
        })

        const result = await indexProject({
            projectDir: "/test/project",
            project: "test-project",
        })

        expect(result.filesSkipped).toBe(1)
        expect(result.filesScanned).toBe(0)
    })

    test("indexes new files", async () => {
        mockGetIndexedFiles.mockResolvedValueOnce([])

        mockSpawnSync.mockReturnValue({
            stdout: "src/test.ts\n",
            stderr: "",
            status: 0,
        })

        const result = await indexProject({
            projectDir: "/test/project",
            project: "test-project",
        })

        expect(result.filesScanned).toBe(1)
        expect(result.elementsIndexed).toBe(1)
        expect(mockAddCodeElement).toHaveBeenCalledTimes(1)
    })

    test("returns correct timing", async () => {
        mockSpawnSync.mockReturnValue({
            stdout: "",
            stderr: "",
            status: 0,
        })

        const result = await indexProject({
            projectDir: "/test/project",
            project: "test-project",
        })

        expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })
})
