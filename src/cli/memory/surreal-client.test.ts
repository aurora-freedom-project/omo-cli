import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test"

import * as surreal from "./surreal-client"

const mockLog = mock(() => { })
mock.module("../../shared/logger", () => ({ log: mockLog }))

describe("cli/memory/surreal-client", () => {
    let globalFetchSpy: any

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
            } as any)

            await expect(surreal.addConcept({ content: "1", tags: [], embedding: [], source: "" })).rejects.toThrow(/SurrealDB HTTP 500: Internal Server Error/)
        })

        test("throws if RPC response contains error block", async () => {
            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ error: { message: "query failed syntax" } })
            } as any)

            await expect(surreal.addConcept({ content: "1", tags: [], embedding: [], source: "" })).rejects.toThrow(/SurrealDB RPC error: query failed syntax/)
        })
    })

    describe("initSchema", () => {
        test("runs successfully parsing statements gracefully", async () => {
            globalFetchSpy.mockResolvedValue({
                ok: true,
                json: async () => ({ result: { ok: true } })
            } as any)

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
                    json: async () => ({ result: { ok: true } })
                } as any)

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
            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: [{ result: [{ id: "concept:xyz" }] }] })
            } as any)

            const id = await surreal.addConcept(mockConcept)
            expect(id).toBe("concept:xyz")

            const fetchArgs = globalFetchSpy.mock.calls[0]
            expect(fetchArgs[0]).toBe("http://localhost:18000/rpc")
            const body = JSON.parse(fetchArgs[1].body)
            expect(body.params[1].content).toBe("test")
        })

        test("throws if return map object misses structured ID maps", async () => {
            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: [{ result: [] }] })
            } as any)

            await expect(surreal.addConcept(mockConcept)).rejects.toThrow(/no ID returned/)
        })
    })

    describe("searchSimilar", () => {
        test("returns empty array if root result is empty bounds missing data", async () => {
            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: [] })
            } as any)

            const res = await surreal.searchSimilar([0.1])
            expect(res).toEqual([])
        })

        test("binds limit boundaries to project scoped filters properly mapped array", async () => {
            const similar = [{ id: "c1", score: 0.99 }]
            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: [{ result: similar }] })
            } as any)

            const res = await surreal.searchSimilar([0.1], 10, "proj1")
            expect(res).toEqual(similar)

            const body = JSON.parse(globalFetchSpy.mock.calls[0][1].body)
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
            } as any)

            const res = await surreal.graphTraverse("c1")
            expect(res).toEqual([])
        })

        test("queries using relationships out matching string bounds", async () => {
            const concepts = [{ id: "c2" }]
            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: [{ result: concepts }] })
            } as any)

            const res = await surreal.graphTraverse("c1", 3)
            expect(res).toEqual(concepts)

            const body = JSON.parse(globalFetchSpy.mock.calls[0][1].body)
            expect(body.params[1].depth).toBe(3)
        })
    })

    describe("addRelation", () => {
        test("mapped struct limits executes query properly", async () => {
            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: [] })
            } as any)

            await surreal.addRelation("f1", "t1", "rel")

            const body = JSON.parse(globalFetchSpy.mock.calls[0][1].body)
            expect(body.params[0]).toBe("RELATE $from->relates_to->$to SET relation = $relation;")
            expect(body.params[1].from).toBe("f1")
        })
    })

    describe("isConnected", () => {
        test("evaluates true natively passing query ping match loops", async () => {
            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ result: true })
            } as any)

            const res = await surreal.isConnected()
            expect(res).toBe(true)
        })

        test("fails gracefully logging native boolean return", async () => {
            globalFetchSpy.mockRejectedValueOnce(new Error("conn refused"))

            const res = await surreal.isConnected()
            expect(res).toBe(false)
        })
    })
})
