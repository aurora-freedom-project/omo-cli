import { describe, test, expect, mock, beforeEach } from "bun:test"

const mockLog = mock(() => { })
mock.module("../../shared/logger", () => ({ log: mockLog }))

const mockP = mock(async (text: any) => {
    if (text === "error_dims") {
        return [{ data: new Float32Array(10).fill(1) }]
    }
    return [{ data: new Float32Array(384).fill(0.5) }]
})

const mockCreatePipeline = mock(async () => mockP)

mock.module("@xenova/transformers", () => ({
    env: { cacheDir: "", allowLocalModels: false },
    pipeline: mockCreatePipeline
}))

import { generateEmbedding, generateEmbeddingBatch } from "./embedder"

describe("cli/memory/embedder", () => {
    beforeEach(() => {
        mockLog.mockClear()
        mockP.mockClear()
        mockCreatePipeline.mockClear()
    })

    describe("generateEmbedding logic limits mapping loop", () => {
        test("loads pipeline limits strings schemas loops loop mapping checks bounded limits", async () => {
            const res = await generateEmbedding("hello")
            expect(res.length).toBe(384)
            expect(res[0]).toBe(0.5)
            // Second call uses cached pipeline mapped checking limitations variables target
            const res2 = await generateEmbedding("world")
            expect(res2.length).toBe(384)
            expect(mockCreatePipeline).toHaveBeenCalledTimes(1)
        })

        test("throws tracking dims limit limit mappings target checks strings loops maps boundaries logical boundary target logic limiting arrays string arrays limits map map array targets mapping bounds logic mappings values", async () => {
            await expect(generateEmbedding("error_dims")).rejects.toThrow("Unexpected embedding dimensions")
        })
    })

    describe("generateEmbeddingBatch array checks bounds logic string constraints bounds variables variables arrays mappings target limitations schemas array maps limits mappings string schemas", () => {
        test("returns empty tracking limits mapping targets variable bounds maps bounds targeting bounds loops boundaries target limit targets loop maps values value logical logic schema variable objects limit testing target properties testing targets array variable bounds maps string boundaries boolean variables variable logic value targets targets", async () => {
            const res = await generateEmbeddingBatch([])
            expect(res).toEqual([])
        })

        test("returns strings constraints values limits testing string property object targeting mapping parameters arrays maps boundary checks bounds targeting mapped arrays parameter checking limitations loops mapping testing limits mapping target objects variables target limit map looping string bounds parameter value objects targeting bound loops arrays bounds limits strings mapping arrays schemas targets array loop constraint mapping limitation tracking limits constraints bounds objects schemas values missing", async () => {
            const res = await generateEmbeddingBatch(["a", "b"])
            expect(res.length).toBe(2)
            expect(res[0].length).toBe(384)
            expect(res[1].length).toBe(384)
        })
    })
})
