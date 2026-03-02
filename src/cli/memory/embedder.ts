import { log } from "../../shared/logger"
import { Effect } from "effect"

const OLLAMA_MODEL = "all-minilm:l6-v2"
const EXPECTED_DIMS = 384
const DEFAULT_OLLAMA_URL = "http://localhost:11434"

interface OllamaEmbeddingResponse {
    embedding: number[]
}

/**
 * Generate a 384-dimensional embedding vector using Ollama API.
 * Model: all-minilm:l6-v2 (local CPU via Ollama, no API key needed).
 *
 * Requires: `ollama pull all-minilm:l6-v2`
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const ollamaUrl = process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL

    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: OLLAMA_MODEL, prompt: text }),
        signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(`Ollama embedding failed (HTTP ${res.status}): ${body}`)
    }

    const data = (await res.json()) as OllamaEmbeddingResponse

    if (!data.embedding || data.embedding.length === 0) {
        throw new Error(
            `Ollama returned empty embedding. Is model '${OLLAMA_MODEL}' pulled? Run: ollama pull ${OLLAMA_MODEL}`
        )
    }

    if (data.embedding.length !== EXPECTED_DIMS) {
        throw new Error(
            `Unexpected embedding dimensions: got ${data.embedding.length}, expected ${EXPECTED_DIMS}`
        )
    }

    return data.embedding
}

/**
 * Generate embeddings for multiple texts sequentially.
 * Ollama doesn't support batch embeddings, so we call one at a time.
 */
export async function generateEmbeddingBatch(
    texts: string[]
): Promise<number[][]> {
    if (texts.length === 0) return []

    const results: number[][] = []
    for (const text of texts) {
        results.push(await generateEmbedding(text))
    }
    return results
}

/**
 * Check if Ollama embedding model is available.
 */
export async function isEmbeddingModelReady(): Promise<boolean> {
    return await Effect.runPromise(
        Effect.tryPromise({
            try: async () => {
                const ollamaUrl = process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL
                const res = await fetch(`${ollamaUrl}/api/tags`, {
                    signal: AbortSignal.timeout(3000),
                })
                if (!res.ok) return false
                const data = (await res.json()) as { models?: Array<{ name: string }> }
                const models = data.models ?? []
                return models.some((m) => m.name.startsWith("all-minilm"))
            },
            catch: () => false as never
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
    )
}

/** The Ollama model ID used for embeddings */
export const EMBEDDING_MODEL = OLLAMA_MODEL
