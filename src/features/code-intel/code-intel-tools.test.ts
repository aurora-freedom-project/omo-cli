import { describe, expect, test, mock, beforeEach, spyOn } from "bun:test"
import { createCodeIntelTools } from "./code-intel-tools"
import * as surrealClient from "../../cli/memory/surreal-client"
import type { PluginInput } from "@opencode-ai/plugin"
import type { MemoryConfig } from "../../config/schema"

describe("code-intel-tools", () => {
    let mockCtx: PluginInput
    let mockConfig: MemoryConfig

    beforeEach(() => {
        mockCtx = { directory: "/test/project/path/my-project" } as PluginInput
        mockConfig = {
            enabled: true,
            mode: "managed",
            port: 18000,
            auto_capture: true,
            user: "root",
            namespace: "omo",
            database: "memory"
        }

        // Mock surreal-client functions
        spyOn(surrealClient, "configureSurreal").mockImplementation(() => { })
        spyOn(surrealClient, "isConnected").mockResolvedValue(true)
        spyOn(surrealClient, "initSchema").mockResolvedValue()
    })

    test("createCodeIntelTools returns all four tools", () => {
        const tools = createCodeIntelTools(mockCtx, mockConfig)
        expect(tools).toHaveProperty("code_search")
        expect(tools).toHaveProperty("code_callers")
        expect(tools).toHaveProperty("code_deps")
        expect(tools).toHaveProperty("code_overview")
    })

    describe("code_search tool", () => {
        test("handles successful search", async () => {
            const searchSpy = spyOn(surrealClient, "searchCode").mockResolvedValue([
                { kind: "function", name: "testFn", file: "src/test.ts", line_start: 10, signature: "testFn()", docstring: "A test function" }
            ])

            const tools = createCodeIntelTools(mockCtx, mockConfig)
            const result = await tools.code_search.execute({ query: "testFn" })

            expect(searchSpy).toHaveBeenCalledWith("testFn", { kind: undefined, limit: 10, project: "my-project" })
            expect(result).toContain("function testFn (src/test.ts:10)")
            expect(result).toContain("testFn()")
            expect(result).toContain("A test function")
        })

        test("handles empty search results", async () => {
            spyOn(surrealClient, "searchCode").mockResolvedValue([])

            const tools = createCodeIntelTools(mockCtx, mockConfig)
            const result = await tools.code_search.execute({ query: "missingFn" })

            expect(result).toContain("No results found for \"missingFn\"")
        })

        test("handles not connected state", async () => {
            spyOn(surrealClient, "isConnected").mockResolvedValue(false)

            const tools = createCodeIntelTools(mockCtx, mockConfig)
            const result = await tools.code_search.execute({ query: "testFn" })

            expect(result).toContain("Code intelligence unavailable. SurrealDB not connected")
        })

        test("handles connection error", async () => {
            spyOn(surrealClient, "isConnected").mockRejectedValue(new Error("Connection failed"))

            const tools = createCodeIntelTools(mockCtx, mockConfig)
            const result = await tools.code_search.execute({ query: "testFn" })

            expect(result).toContain("Code intelligence unavailable. SurrealDB not connected")
        })

        test("handles configureSurreal external mode", async () => {
            const configSpy = spyOn(surrealClient, "configureSurreal")
            const externalConfig: MemoryConfig = { ...mockConfig, mode: "external", url: "http://external:8000/rpc" }

            const tools = createCodeIntelTools(mockCtx, externalConfig)
            await tools.code_search.execute({ query: "testFn" })

            expect(configSpy).toHaveBeenCalledWith(expect.objectContaining({
                url: "http://external:8000/rpc"
            }))
        })
    })

    describe("code_callers tool", () => {
        test("handles successful callers search", async () => {
            const callersSpy = spyOn(surrealClient, "findCallers").mockResolvedValue([
                { caller_kind: "function", caller_name: "wrapperFn", caller_file: "src/wrapper.ts", caller_line: 20 }
            ])

            const tools = createCodeIntelTools(mockCtx, mockConfig)
            const result = await tools.code_callers.execute({ name: "testFn" })

            expect(callersSpy).toHaveBeenCalledWith("testFn", "my-project")
            expect(result).toContain("1 callers of \"testFn\":")
            expect(result).toContain("function wrapperFn (src/wrapper.ts:20)")
        })

        test("handles no callers found", async () => {
            spyOn(surrealClient, "findCallers").mockResolvedValue([])

            const tools = createCodeIntelTools(mockCtx, mockConfig)
            const result = await tools.code_callers.execute({ name: "orphanFn" })

            expect(result).toContain("No callers found")
        })
    })

    describe("code_deps tool", () => {
        test("handles successful deps search", async () => {
            const depsSpy = spyOn(surrealClient, "findDependencies").mockResolvedValue({
                imports: ["lodash", "./utils"],
                importedBy: ["src/main.ts"]
            })

            const tools = createCodeIntelTools(mockCtx, mockConfig)
            const result = await tools.code_deps.execute({ file: "src/target.ts" })

            expect(depsSpy).toHaveBeenCalledWith("src/target.ts", "my-project")
            expect(result).toContain("Imports (2):")
            expect(result).toContain("→ lodash")
            expect(result).toContain("Imported by (1):")
            expect(result).toContain("← src/main.ts")
        })
    })

    describe("code_overview tool", () => {
        test("handles successful overview", async () => {
            const overviewSpy = spyOn(surrealClient, "getCodeOverview").mockResolvedValue({
                fileCount: 42,
                exportCount: 15,
                elementCounts: [
                    { kind: "function", count: 10 },
                    { kind: "class", count: 5 }
                ]
            })

            const tools = createCodeIntelTools(mockCtx, mockConfig)
            const result = await tools.code_overview.execute({})

            expect(overviewSpy).toHaveBeenCalledWith("my-project")
            expect(result).toContain("Files: 42")
            expect(result).toContain("Exported symbols: 15")
            expect(result).toContain("function: 10")
            expect(result).toContain("class: 5")
        })

        test("handles empty project", async () => {
            spyOn(surrealClient, "getCodeOverview").mockResolvedValue({
                fileCount: 0,
                exportCount: 0,
                elementCounts: []
            })

            const tools = createCodeIntelTools(mockCtx, mockConfig)
            const result = await tools.code_overview.execute({})

            expect(result).toContain("No files indexed yet")
        })
    })
})
