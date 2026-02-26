/// <reference types="bun-types" />
import { describe, test, expect } from "bun:test"

describe("memory-tools", () => {
    test("exports createMemoryTools function", async () => {
        const mt = await import("./memory-tools")
        expect(typeof mt.createMemoryTools).toBe("function")
    })

    test("createMemoryTools returns 3 tools", async () => {
        const { createMemoryTools } = await import("./memory-tools")

        // Minimal mock context
        const ctx = { directory: "/tmp/test-project" } as any
        const config = { enabled: false, port: 18000, auto_capture: false }

        const tools = createMemoryTools(ctx, config)

        expect(Object.keys(tools).sort()).toEqual(["memory_add", "memory_graph", "memory_link", "memory_search"])
    })

    test("each tool has description, parameters, and execute", async () => {
        const { createMemoryTools } = await import("./memory-tools")

        const ctx = { directory: "/tmp/test-project" } as any
        const config = { enabled: false, port: 18000, auto_capture: false }

        const tools = createMemoryTools(ctx, config)

        for (const [name, tool] of Object.entries(tools)) {
            expect(tool.description).toBeTruthy()
            expect(tool.parameters).toBeDefined()
            expect(tool.parameters.type).toBe("object")
            expect(tool.parameters.properties).toBeDefined()
            expect(tool.parameters.required).toBeDefined()
            expect(typeof tool.execute).toBe("function")
        }
    })

    test("tools return disabled message when config.enabled is false", async () => {
        const { createMemoryTools } = await import("./memory-tools")

        const ctx = { directory: "/tmp/test-project" } as any
        const config = { enabled: false, port: 18000, auto_capture: false }

        const tools = createMemoryTools(ctx, config)

        const addResult = await tools.memory_add.execute({
            content: "test",
            tags: ["test"],
        })
        expect(addResult).toContain("disabled")

        const searchResult = await tools.memory_search.execute({
            query: "test",
        })
        expect(searchResult).toContain("disabled")

        const graphResult = await tools.memory_graph.execute({
            concept_id: "concept:test",
        })
        expect(graphResult).toContain("disabled")
    })

    test("memory_add requires content and tags parameters", async () => {
        const { createMemoryTools } = await import("./memory-tools")

        const ctx = { directory: "/tmp/test-project" } as any
        const config = { enabled: false, port: 18000, auto_capture: false }

        const tools = createMemoryTools(ctx, config)
        const { required } = tools.memory_add.parameters

        expect(required).toContain("content")
        expect(required).toContain("tags")
    })

    test("memory_search requires query parameter", async () => {
        const { createMemoryTools } = await import("./memory-tools")

        const ctx = { directory: "/tmp/test-project" } as any
        const config = { enabled: false, port: 18000, auto_capture: false }

        const tools = createMemoryTools(ctx, config)
        const { required } = tools.memory_search.parameters

        expect(required).toContain("query")
    })

    test("memory_graph requires concept_id parameter", async () => {
        const { createMemoryTools } = await import("./memory-tools")

        const ctx = { directory: "/tmp/test-project" } as any
        const config = { enabled: false, port: 18000, auto_capture: false }

        const tools = createMemoryTools(ctx, config)
        const { required } = tools.memory_graph.parameters

        expect(required).toContain("concept_id")
    })
})
