import { log } from "../../shared/logger"
import { Effect } from "effect"

const OLLAMA_MODEL = "snowflake-arctic-embed2:568m"
const EXPECTED_DIMS = 768
const DEFAULT_OLLAMA_URL = "http://localhost:11434"

interface OllamaEmbedResponse {
    model: string
    embeddings: number[][]
}

/**
 * Generate a 768-dimensional embedding vector using Ollama API.
 * Model: snowflake-arctic-embed2:568m
 *
 * Requires: `ollama pull snowflake-arctic-embed2:568m`
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const batch = await generateEmbeddingBatch([text])
    if (batch.length === 0) {
        throw new Error(`Ollama returned empty embedding array`)
    }
    return batch[0]
}

/**
 * Generate embeddings for multiple texts via Ollama's native /api/embed endpoint.
 * This performs parallel batching on the inference engine for speed.
 */
export async function generateEmbeddingBatch(
    texts: string[]
): Promise<number[][]> {
    if (texts.length === 0) return []

    const ollamaUrl = process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL

    const res = await fetch(`${ollamaUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: OLLAMA_MODEL, input: texts }),
        signal: AbortSignal.timeout(60000), // 60s for batch processing
    })

    if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(`Ollama embedding failed (HTTP ${res.status}): ${body}`)
    }

    const data = (await res.json()) as OllamaEmbedResponse

    if (!data.embeddings || data.embeddings.length === 0) {
        throw new Error(
            `Ollama returned empty embeddings array. Is model '${OLLAMA_MODEL}' pulled? Run: ollama pull ${OLLAMA_MODEL}`
        )
    }

    // Verify dimensions of the first item
    if (data.embeddings[0].length !== EXPECTED_DIMS) {
        throw new Error(
            `Unexpected embedding dimensions: got ${data.embeddings[0].length}, expected ${EXPECTED_DIMS}`
        )
    }

    return data.embeddings
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
                return models.some((m) => m.name.startsWith("snowflake-arctic-embed2"))
            },
            catch: () => false as never
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
    )
}

/** The Ollama model ID used for embeddings */
export const EMBEDDING_MODEL = OLLAMA_MODEL
