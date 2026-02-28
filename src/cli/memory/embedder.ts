import { log } from "../../shared/logger"
import { homedir } from "os"
import { join } from "path"

const MODEL_ID = "Xenova/all-MiniLM-L6-v2"
const EXPECTED_DIMS = 384
const CACHE_DIR = join(homedir(), ".cache", "omo-cli", "models")

/** Shape of transformer pipeline output tensor */
interface EmbeddingOutput {
    data: Float32Array | number[]
}

// Lazy-loaded — import only on first use to avoid 50MB startup cost
let pipeline: ((text: string | string[]) => Promise<EmbeddingOutput[]>) | null = null

async function getPipeline() {
    if (pipeline) return pipeline

    log("[embedder] Loading transformer model (first-time, may take a moment)...")

    // MUST be dynamic import — never top-level (50MB penalty)
    const transformers = await import("@xenova/transformers") as Record<string, unknown>
    const createPipeline = transformers.pipeline as (
        task: string,
        model: string,
        options: Record<string, unknown>
    ) => Promise<(text: string | string[], options?: Record<string, unknown>) => Promise<EmbeddingOutput[]>>
    const env = transformers.env as { cacheDir: string; allowLocalModels: boolean }

    // Set cache dir to omo-cli models path
    env.cacheDir = CACHE_DIR
    env.allowLocalModels = false

    const p = await createPipeline("feature-extraction", MODEL_ID, {
        quantized: true, // Use quantized for smaller model size
    })

    pipeline = async (text: string | string[]) => {
        const output = await p(text, { pooling: "mean", normalize: true })
        return output
    }

    log("[embedder] Model loaded successfully", { cacheDir: CACHE_DIR })
    return pipeline
}

/**
 * Generate a 384-dimensional embedding vector for the given text.
 * Model: Xenova/all-MiniLM-L6-v2 (local CPU, no API key needed).
 *
 * WARNING: First call takes ~3s to load model into memory.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const p = await getPipeline()
    const output = await p!(text)

    const vector = Array.from(output[0].data) as number[]

    if (vector.length !== EXPECTED_DIMS) {
        throw new Error(
            `Unexpected embedding dimensions: got ${vector.length}, expected ${EXPECTED_DIMS}`
        )
    }

    return vector
}

/**
 * Generate embeddings for multiple texts in a single batch.
 * More efficient than calling generateEmbedding() in a loop.
 */
export async function generateEmbeddingBatch(
    texts: string[]
): Promise<number[][]> {
    if (texts.length === 0) return []

    const p = await getPipeline()
    const outputs = await Promise.all(texts.map((t) => p!(t)))

    return outputs.map((o) => Array.from(o[0].data) as number[])
}
