/// <reference types="bun-types" />
import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test"

import * as surreal from "./surreal-client"

const mockLog = mock(() => { })
mock.module("../../shared/logger", () => ({ log: mockLog }))

/**
 * Helper: wraps a query result so the mock response accounts for the
 * leading USE NS result that rpc() strips via `data.result.slice(1)`.
 *
 * rpc() prepends `USE NS omo DB memory;` to every query call.
 * SurrealDB returns one result entry per statement, so the actual
 * result we care about is at index 1. rpc() does
 * `data.result.slice(1)` internally, so the mock must include a
 * dummy element at index 0.
 */
function queryResponse(results: unknown[]) {
    return {
        ok: true,
        json: async () => ({
            result: [
                { result: null }, // ← USE NS statement result (stripped by rpc)
                ...results,
            ]
        })
    } as never
}

/** Simple ok response without query-level result array */
function simpleResponse(data: unknown) {
    return {
        ok: true,
        json: async () => data,
    } as never
}

describe("cli/memory/surreal-client", () => {
    let globalFetchSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
        mockLog.mockClear()
        globalFetchSpy = spyOn(globalThis, "fetch")
    })

    afterEach(() => {
        globalFetchSpy.mockRestore()
    })

    describe("rpc base wrapper", () => {
        test("throws if HTTP response not ok", async () => {
            globalFetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => "Internal Server Error"
            } as never)

            await expect(surreal.addConcept({ content: "1", tags: [], embedding: [], source: "" })).rejects.toThrow(/SurrealDB HTTP 500: Internal Server Error/)
        })

        test("throws if RPC response contains error block", async () => {
            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ error: { message: "query failed syntax" } })
            } as never)

            await expect(surreal.addConcept({ content: "1", tags: [], embedding: [], source: "" })).rejects.toThrow(/SurrealDB RPC error: query failed syntax/)
        })
    })

    describe("initSchema", () => {
        test("runs successfully parsing statements gracefully", async () => {
            globalFetchSpy.mockResolvedValue({
                ok: true,
                json: async () => ({ result: [{ result: null }, { result: { ok: true } }] })
            } as never)

            await surreal.initSchema()

            // Multiple query statements means fetch called multiple times
            expect(globalFetchSpy).toHaveBeenCalled()
            expect(mockLog).toHaveBeenCalled()
        })

        test("logs failure on specific statement but continues to next limits", async () => {
            // First fetch fails, second succeeds
            globalFetchSpy.mockRejectedValueOnce(new Error("network error"))
                .mockResolvedValue({
                    ok: true,
                    json: async () => ({ result: [{ result: null }, { result: { ok: true } }] })
                } as never)

            await surreal.initSchema()

            expect(mockLog).toHaveBeenCalledWith("[surreal-client] Schema statement skipped", expect.anything())
        })
    })

    describe("addConcept", () => {
        const mockConcept = {
            content: "test",
            tags: ["t"],
            embedding: [0.1, 0.2],
            source: "src"
        }

        test("successfully parses mapped limits returning generic ID object", async () => {
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([{ result: [{ id: "concept:xyz" }] }])
            )

            const id = await surreal.addConcept(mockConcept)
            expect(id).toBe("concept:xyz")

            const fetchArgs = globalFetchSpy.mock.calls[0]
            expect(fetchArgs[0]).toBe("http://127.0.0.1:18000/rpc")
            const body = JSON.parse(fetchArgs[1].body)
            expect(body.params[1].content).toBe("test")
        })

        test("throws if return map object misses structured ID maps", async () => {
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([{ result: [] }])
            )

            await expect(surreal.addConcept(mockConcept)).rejects.toThrow(/no ID returned/)
        })
    })

    describe("searchSimilar", () => {
        test("returns empty array if root result is empty bounds missing data", async () => {
            // rpc returns empty after slice(1)
            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: [{ result: null }] })  // only USE result, slice(1) = []
            } as never)

            const res = await surreal.searchSimilar([0.1])
            expect(res).toEqual([])
        })

        test("binds limit boundaries to project scoped filters properly mapped array", async () => {
            const similar = [{ id: "c1", score: 0.99, content: "test", tags: ["t"], embedding: [0.1], source: "auto" }]
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([{ result: similar }])
            )

            const res = await surreal.searchSimilar([0.1], 10, "proj1")
            expect(res).toEqual(similar)

            const body = JSON.parse(globalFetchSpy.mock.calls[0][1].body)
            // Query is at params[0], but now includes "USE NS omo DB memory; " prefix
            expect(body.params[0]).toContain("WHERE project = $project")
            expect(body.params[1].project).toBe("proj1")
            expect(body.params[1].limit).toBe(10)
        })
    })

    describe("graphTraverse", () => {
        test("returns empty if mapping fails", async () => {
            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({})
            } as never)

            const res = await surreal.graphTraverse("c1")
            expect(res).toEqual([])
        })

        test("queries using relationships out matching string bounds", async () => {
            const concepts = [{ id: "c2", content: "test", tags: ["t"], embedding: [0.1], source: "auto" }]
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([{ result: concepts }])
            )

            const res = await surreal.graphTraverse("c1", 3)
            expect(res).toEqual(concepts)

            const body = JSON.parse(globalFetchSpy.mock.calls[0][1].body)
            expect(body.params[1].depth).toBe(3)
        })
    })

    describe("addRelation", () => {
        test("mapped struct limits executes query properly", async () => {
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([])
            )

            await surreal.addRelation("f1", "t1", "rel")

            const body = JSON.parse(globalFetchSpy.mock.calls[0][1].body)
            // rpc prepends USE NS prefix, so the query in params[0] includes it
            expect(body.params[0]).toContain("RELATE $from->relates_to->$to SET relation = $relation;")
            expect(body.params[1].from).toBe("f1")
        })
    })

    describe("isConnected", () => {
        test("evaluates true natively passing query ping match loops", async () => {
            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: true })
            } as never)

            const res = await surreal.isConnected()
            expect(res).toBe(true)
        })

        test("fails gracefully logging native boolean return", async () => {
            globalFetchSpy.mockRejectedValueOnce(new Error("conn refused"))

            const res = await surreal.isConnected()
            expect(res).toBe(false)
        })
    })
    describe("code intelligence - addCodeElement", () => {
        test("successfully creates element and returns ID", async () => {
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([{ result: [{ id: "code_element:123" }] }])
            )

            const id = await surreal.addCodeElement({
                name: "testFn",
                kind: "function",
                file: "test.ts",
                lineStart: 1,
                lineEnd: 5,
                signature: "testFn()",
                exported: true,
                project: "proj1"
            })
            expect(id).toBe("code_element:123")

            const body = JSON.parse(globalFetchSpy.mock.calls[0][1].body)
            expect(body.params[0]).toContain("CREATE code_element SET")
            expect(body.params[1].name).toBe("testFn")
        })

        test("throws if no ID returned", async () => {
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([{ result: [] }])
            )

            await expect(surreal.addCodeElement({
                name: "test", kind: "test", file: "test", lineStart: 1, lineEnd: 1, signature: "test", exported: false, project: "test"
            })).rejects.toThrow(/Failed to create code_element/)
        })
    })

    describe("code intelligence - addCodeRelation", () => {
        test("properly formats IDs and executes relation query", async () => {
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([])
            )

            await surreal.addCodeRelation("123", "code_element:456", "calls")

            const body = JSON.parse(globalFetchSpy.mock.calls[0][1].body)
            expect(body.params[0]).toContain("RELATE $src->code_relation->$tgt SET kind = $kind;")
            expect(body.params[1].src).toBe("code_element:123")
            expect(body.params[1].tgt).toBe("code_element:456")
        })
    })

    describe("code intelligence - searchCode", () => {
        test("builds correct query with project and kind filters", async () => {
            const mockResult = [{ name: "testFn", kind: "function" }]
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([{ result: mockResult }])
            )

            const res = await surreal.searchCode("test", { kind: "function", project: "proj1" })
            expect(res).toEqual(mockResult)

            const body = JSON.parse(globalFetchSpy.mock.calls[0][1].body)
            expect(body.params[0]).toContain("kind = $kind")
            expect(body.params[0]).toContain("project = $project")
            expect(body.params[1].q).toBe("test")
        })
    })

    describe("code intelligence - findCallers", () => {
        test("returns callers from relation query", async () => {
            const mockCallers = [{ caller_name: "wrapper" }]
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([{ result: mockCallers }])
            )

            const res = await surreal.findCallers("targetFn", "proj1")
            expect(res).toEqual(mockCallers)
        })

        test("falls back to subquery if relation query returns empty", async () => {
            // First call returns empty, second returns fallback
            const fallbackResults = [{ name: "fallback" }]
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([{ result: [] }])  // empty relations
            ).mockResolvedValueOnce(
                queryResponse([{ result: fallbackResults }])  // fallback query
            )

            const res = await surreal.findCallers("targetFn")
            expect(res).toEqual(fallbackResults)
        })
    })

    describe("code intelligence - findDependencies", () => {
        test("queries both imports and importedBy", async () => {
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([{ result: [{ file: "a.ts" }] }])
            ).mockResolvedValueOnce(
                queryResponse([{ result: [{ file: "b.ts" }] }])
            )

            const res = await surreal.findDependencies("target.ts")
            expect(res).toEqual({ imports: ["a.ts"], importedBy: ["b.ts"] })
        })
    })

    describe("code intelligence - getCodeOverview", () => {
        test("aggregates stats from multiple queries", async () => {
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([{ result: [{ kind: "func", count: 5 }] }])
            ).mockResolvedValueOnce(
                queryResponse([{ result: [{ count: 10 }] }])  // files
            ).mockResolvedValueOnce(
                queryResponse([{ result: [{ count: 3 }] }])  // exports
            )

            const res = await surreal.getCodeOverview("proj1")
            expect(res.fileCount).toBe(10)
            expect(res.exportCount).toBe(3)
            expect(res.elementCounts).toEqual([{ kind: "func", count: 5 }])
        })
    })

    describe("code intelligence - clearCodeIndex", () => {
        test("deletes relations then elements", async () => {
            globalFetchSpy.mockResolvedValue(
                queryResponse([])
            )

            await surreal.clearCodeIndex("proj1")
            expect(globalFetchSpy).toHaveBeenCalledTimes(2)
        })
    })

    describe("code intelligence - getIndexedFiles", () => {
        test("returns mapped files and hashes", async () => {
            globalFetchSpy.mockResolvedValueOnce(
                queryResponse([{ result: [{ file: "test.ts", file_hash: "123" }] }])
            )

            const res = await surreal.getIndexedFiles("proj1")
            expect(res).toEqual([{ file: "test.ts", fileHash: "123" }])
        })
    })
})
