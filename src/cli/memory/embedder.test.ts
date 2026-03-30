import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test"

const mockLog = mock(() => { })
mock.module("../../shared/logger", () => ({ log: mockLog }))

import { generateEmbedding, generateEmbeddingBatch } from "./embedder"

/**
 * Mock helper: create a successful Ollama embedding response
 */
function ollamaResponse(embeddings: number[][]): Response {
    return new Response(JSON.stringify({ embeddings }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    })
}

/**
 * Mock helper: create a 404 error response (model not found)
 */
function ollamaError(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json" },
    })
}

describe("cli/memory/embedder", () => {
    let fetchSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
        mockLog.mockClear()
        // Mock global fetch to intercept Ollama API calls
        fetchSpy = spyOn(globalThis, "fetch")
    })

    afterEach(() => {
        fetchSpy?.mockRestore()
    })

    describe("generateEmbedding", () => {
        test("returns 768-dimensional embedding from Ollama", async () => {
            const embedding = new Array(768).fill(0.5)
            fetchSpy.mockResolvedValueOnce(ollamaResponse([embedding]))

            const res = await generateEmbedding("hello")
            expect(res.length).toBe(768)
            expect(res[0]).toBe(0.5)
        })

        test("throws on unexpected dimensions", async () => {
            const shortEmbedding = new Array(10).fill(1.0)
            fetchSpy.mockResolvedValueOnce(ollamaResponse([shortEmbedding]))

            await expect(generateEmbedding("wrong_dims")).rejects.toThrow("Unexpected embedding dimensions")
        })

        test("throws on HTTP error (model not found)", async () => {
            fetchSpy.mockResolvedValueOnce(
                ollamaError(404, 'model "snowflake-arctic-embed2:568m" not found')
            )

            await expect(generateEmbedding("hello")).rejects.toThrow("Ollama embedding failed")
        })
    })

    describe("generateEmbeddingBatch", () => {
        test("returns empty array for empty input", async () => {
            const res = await generateEmbeddingBatch([])
            expect(res).toEqual([])
        })

        test("returns embeddings for multiple texts from single batch call", async () => {
            const embedding1 = new Array(768).fill(0.5)
            const embedding2 = new Array(768).fill(0.8)
            // One call to /api/embed returning an array of embeddings
            fetchSpy.mockResolvedValueOnce(ollamaResponse([embedding1, embedding2]))

            const res = await generateEmbeddingBatch(["a", "b"])
            expect(res.length).toBe(2)
            expect(res[0].length).toBe(768)
            expect(res[1].length).toBe(768)
            expect(fetchSpy).toHaveBeenCalledTimes(1) // Parallel batching
        })
    })
})
