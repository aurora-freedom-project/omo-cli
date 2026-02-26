import { log } from "../../shared/logger"

export interface SurrealConnectionConfig {
    url: string        // e.g. "http://localhost:18000/rpc"
    user: string       // e.g. "root"
    pass: string       // e.g. "omo-secret"
    namespace: string  // e.g. "omo"
    database: string   // e.g. "memory"
}

// Default connection config (managed mode defaults)
let connectionConfig: SurrealConnectionConfig = {
    url: "http://localhost:18000/rpc",
    user: "root",
    pass: "omo-secret",
    namespace: "omo",
    database: "memory",
}

/**
 * Configure the SurrealDB connection.
 * Call before any RPC operations to set custom connection parameters.
 */
export function configureSurreal(config: Partial<SurrealConnectionConfig>): void {
    connectionConfig = { ...connectionConfig, ...config }
    log("[surreal-client] Connection configured", {
        url: connectionConfig.url,
        namespace: connectionConfig.namespace,
        database: connectionConfig.database,
    })
}

/**
 * Get the current connection config (for testing/logging).
 */
export function getConnectionConfig(): Readonly<SurrealConnectionConfig> {
    return { ...connectionConfig }
}

export interface Concept {
    id?: string
    content: string
    tags: string[]
    embedding: number[]
    source: string
    project?: string
    created?: string
}

export interface SimilarConcept extends Concept {
    score: number
}

/**
 * Build the schema SQL using the current connection config.
 */
export function buildSchemaSQL(): string {
    const { namespace, database } = connectionConfig
    return `
DEFINE NAMESPACE IF NOT EXISTS ${namespace};
USE NS ${namespace} DB ${database};

DEFINE TABLE IF NOT EXISTS concept SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS content   ON concept TYPE string;
DEFINE FIELD IF NOT EXISTS tags      ON concept TYPE array<string>;
DEFINE FIELD IF NOT EXISTS embedding ON concept TYPE array<float>;
DEFINE FIELD IF NOT EXISTS source    ON concept TYPE string;
DEFINE FIELD IF NOT EXISTS project   ON concept TYPE option<string>;
DEFINE FIELD IF NOT EXISTS created   ON concept TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_concept_embedding ON concept
  FIELDS embedding HNSW DIMENSION 384 DIST COSINE;

DEFINE TABLE IF NOT EXISTS file SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS path    ON file TYPE string;
DEFINE FIELD IF NOT EXISTS project ON file TYPE string;

DEFINE TABLE IF NOT EXISTS relates_to SCHEMAFULL TYPE RELATION;
DEFINE FIELD IF NOT EXISTS relation ON relates_to TYPE string;

DEFINE TABLE IF NOT EXISTS discovered_in SCHEMAFULL TYPE RELATION;
DEFINE FIELD IF NOT EXISTS session ON discovered_in TYPE string;
`
}

// Keep legacy export for backward compatibility with tests
export const SURREALQL_SCHEMA = buildSchemaSQL()

interface RpcResponse<T = unknown> {
    id?: string
    result?: T
    error?: { code: number; message: string }
}

async function rpc<T = unknown>(
    method: string,
    params: unknown[]
): Promise<T> {
    const { url, user, pass, namespace, database } = connectionConfig
    const payload = { id: "1", method, params }
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            NS: namespace,
            DB: database,
            Authorization: `Basic ${btoa(`${user}:${pass}`)}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
        throw new Error(`SurrealDB HTTP ${res.status}: ${await res.text()}`)
    }

    const data = (await res.json()) as RpcResponse<T>

    if (data.error) {
        throw new Error(`SurrealDB RPC error: ${data.error.message}`)
    }

    return data.result as T
}

export async function initSchema(): Promise<void> {
    log("[surreal-client] Initializing schema...", {
        namespace: connectionConfig.namespace,
        database: connectionConfig.database,
    })
    const schema = buildSchemaSQL()
    const statements = schema.trim()
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)

    for (const stmt of statements) {
        try {
            await rpc("query", [stmt + ";"])
        } catch (err) {
            // Log but don't throw — some statements may already exist
            log("[surreal-client] Schema statement skipped", { stmt, err })
        }
    }

    log("[surreal-client] Schema initialized")
}

export async function addConcept(concept: Omit<Concept, "id">): Promise<string> {
    const result = await rpc<Array<{ result: Array<{ id: string }> }>>(
        "query",
        [
            `CREATE concept SET content = $content, tags = $tags, embedding = $embedding, source = $source, project = $project;`,
            {
                content: concept.content,
                tags: concept.tags,
                embedding: concept.embedding,
                source: concept.source,
                project: concept.project,
            },
        ]
    )

    const id = result?.[0]?.result?.[0]?.id
    if (!id) throw new Error("Failed to create concept — no ID returned")

    log("[surreal-client] Concept added", { id, source: concept.source })
    return id
}

export async function linkConcepts(
    sourceId: string,
    targetId: string,
    relationType: string
): Promise<void> {
    // Basic prefix checking
    const src = sourceId.startsWith("concept:") ? sourceId : `concept:${sourceId}`
    const tgt = targetId.startsWith("concept:") ? targetId : `concept:${targetId}`

    await rpc("query", [
        `RELATE $src->relates_to->$tgt SET relation = $type;`,
        { src, tgt, type: relationType },
    ])

    log("[surreal-client] Concepts linked", { src, tgt, type: relationType })
}

export async function searchSimilar(
    embedding: number[],
    limit = 5,
    project?: string
): Promise<SimilarConcept[]> {
    const whereClause = project
        ? "WHERE project = $project"
        : ""

    const result = await rpc<Array<{ result: SimilarConcept[] }>>("query", [
        `SELECT *, vector::similarity::cosine(embedding, $embedding) AS score
     FROM concept
     ${whereClause}
     ORDER BY score DESC
     LIMIT $limit;`,
        { embedding, project, limit },
    ])

    return result?.[0]?.result ?? []
}

export async function graphTraverse(
    conceptId: string,
    depth = 2
): Promise<Concept[]> {
    const result = await rpc<Array<{ result: Concept[] }>>("query", [
        `SELECT * FROM concept WHERE id = $id
     FETCH ->relates_to->concept, ->discovered_in->file;`,
        { id: conceptId, depth },
    ])

    return result?.[0]?.result ?? []
}

export async function addRelation(
    fromId: string,
    toId: string,
    relation: string
): Promise<void> {
    await rpc("query", [
        `RELATE $from->relates_to->$to SET relation = $relation;`,
        { from: fromId, to: toId, relation },
    ])

    log("[surreal-client] Relation added", { fromId, toId, relation })
}

export async function isConnected(): Promise<boolean> {
    try {
        await rpc("ping", [])
        return true
    } catch {
        return false
    }
}
