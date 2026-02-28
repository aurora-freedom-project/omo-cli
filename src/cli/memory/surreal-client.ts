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
    url: "http://127.0.0.1:18000/rpc",
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

-- Code Intelligence: code elements (functions, classes, methods, etc.)
DEFINE TABLE IF NOT EXISTS code_element SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name        ON code_element TYPE string;
DEFINE FIELD IF NOT EXISTS kind        ON code_element TYPE string;
DEFINE FIELD IF NOT EXISTS file        ON code_element TYPE string;
DEFINE FIELD IF NOT EXISTS line_start  ON code_element TYPE int;
DEFINE FIELD IF NOT EXISTS line_end    ON code_element TYPE int;
DEFINE FIELD IF NOT EXISTS signature   ON code_element TYPE string;
DEFINE FIELD IF NOT EXISTS docstring   ON code_element TYPE option<string>;
DEFINE FIELD IF NOT EXISTS exported    ON code_element TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS params      ON code_element TYPE option<array<string>>;
DEFINE FIELD IF NOT EXISTS return_type ON code_element TYPE option<string>;
DEFINE FIELD IF NOT EXISTS parent      ON code_element TYPE option<string>;
DEFINE FIELD IF NOT EXISTS content     ON code_element TYPE option<string>;
DEFINE FIELD IF NOT EXISTS embedding   ON code_element TYPE option<array<float>>;
DEFINE FIELD IF NOT EXISTS project     ON code_element TYPE string;
DEFINE FIELD IF NOT EXISTS file_hash   ON code_element TYPE option<string>;
DEFINE FIELD IF NOT EXISTS indexed_at  ON code_element TYPE datetime DEFAULT time::now();

-- BM25 full-text search (SurrealDB v3 syntax)
DEFINE ANALYZER IF NOT EXISTS code_analyzer TOKENIZERS blank, class FILTERS lowercase;
DEFINE INDEX IF NOT EXISTS idx_code_search ON code_element
  FIELDS name, signature, docstring FULLTEXT ANALYZER code_analyzer BM25;

-- Vector index (populated by omo-cli index --vector)
DEFINE INDEX IF NOT EXISTS idx_code_embedding ON code_element
  FIELDS embedding HNSW DIMENSION 384 DIST COSINE;

-- Lookup indexes
DEFINE INDEX IF NOT EXISTS idx_code_file ON code_element FIELDS file;
DEFINE INDEX IF NOT EXISTS idx_code_kind ON code_element FIELDS kind;
DEFINE INDEX IF NOT EXISTS idx_code_project ON code_element FIELDS project;

-- Code relations (graph edges between elements)
DEFINE TABLE IF NOT EXISTS code_relation SCHEMAFULL TYPE RELATION;
DEFINE FIELD IF NOT EXISTS kind ON code_relation TYPE string;
`
}

// Keep legacy export for backward compatibility with tests
export const SURREALQL_SCHEMA = buildSchemaSQL()

// ---------------------------------------------------------------------------
// Code Intelligence types
// ---------------------------------------------------------------------------

export interface CodeElement {
    id?: string
    name: string
    kind: string       // "function" | "class" | "method" | "interface" | "type"
    file: string       // relative path
    lineStart: number
    lineEnd: number
    signature: string
    docstring?: string
    exported: boolean
    params?: string[]
    returnType?: string
    parent?: string    // parent class (for methods)
    content?: string
    embedding?: number[]
    project: string
    fileHash?: string
}

export interface CodeRelation {
    sourceId: string
    targetId: string
    kind: "calls" | "imports" | "extends" | "implements"
}

export interface CodeOverview {
    fileCount: number
    elementCounts: Array<{ kind: string; count: number }>
    exportCount: number
}

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Memory (concept) operations — existing
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Code Intelligence operations — NEW
// ---------------------------------------------------------------------------

export async function addCodeElement(element: CodeElement): Promise<string> {
    const result = await rpc<Array<{ result: Array<{ id: string }> }>>(
        "query",
        [
            `CREATE code_element SET
                name = $name, kind = $kind, file = $file,
                line_start = $line_start, line_end = $line_end,
                signature = $signature, docstring = $docstring,
                exported = $exported, params = $params,
                return_type = $return_type, parent = $parent,
                content = $content, embedding = $embedding,
                project = $project, file_hash = $file_hash;`,
            {
                name: element.name,
                kind: element.kind,
                file: element.file,
                line_start: element.lineStart,
                line_end: element.lineEnd,
                signature: element.signature,
                docstring: element.docstring ?? null,
                exported: element.exported,
                params: element.params ?? null,
                return_type: element.returnType ?? null,
                parent: element.parent ?? null,
                content: element.content ?? null,
                embedding: element.embedding ?? null,
                project: element.project,
                file_hash: element.fileHash ?? null,
            },
        ]
    )

    const id = result?.[0]?.result?.[0]?.id
    if (!id) throw new Error("Failed to create code_element — no ID returned")
    return id
}

export async function addCodeRelation(
    sourceId: string,
    targetId: string,
    kind: string
): Promise<void> {
    const src = sourceId.startsWith("code_element:") ? sourceId : `code_element:${sourceId}`
    const tgt = targetId.startsWith("code_element:") ? targetId : `code_element:${targetId}`

    await rpc("query", [
        `RELATE $src->code_relation->$tgt SET kind = $kind;`,
        { src, tgt, kind },
    ])
}

export async function searchCode(
    query: string,
    opts?: { kind?: string; limit?: number; project?: string }
): Promise<Array<Record<string, unknown>>> {
    const limit = opts?.limit ?? 10
    const conditions: string[] = [
        `(name @@ $q OR signature @@ $q OR docstring @@ $q)`
    ]
    if (opts?.kind) conditions.push(`kind = $kind`)
    if (opts?.project) conditions.push(`project = $project`)

    const result = await rpc<Array<{ result: Array<Record<string, unknown>> }>>("query", [
        `SELECT name, kind, file, line_start, line_end, signature, docstring, exported
         FROM code_element
         WHERE ${conditions.join(" AND ")}
         LIMIT $limit;`,
        { q: query, kind: opts?.kind, project: opts?.project, limit },
    ])

    return result?.[0]?.result ?? []
}

export async function findCallers(
    name: string,
    project?: string
): Promise<Array<Record<string, unknown>>> {
    const projectFilter = project ? `AND source.project = $project` : ""

    const result = await rpc<Array<{ result: Array<Record<string, unknown>> }>>("query", [
        `SELECT source.name AS caller_name, source.kind AS caller_kind,
                source.file AS caller_file, source.line_start AS caller_line,
                source.signature AS caller_signature
         FROM code_relation
         WHERE kind = 'calls'
           AND <-code_element[WHERE name = $name] IS NOT NONE
           ${projectFilter}
         FETCH source;`,
        { name, project },
    ])

    // Fallback: simpler query via subquery
    if (!result?.[0]?.result?.length) {
        const fallback = await rpc<Array<{ result: Array<Record<string, unknown>> }>>("query", [
            `SELECT name, kind, file, line_start, signature
             FROM code_element
             WHERE id IN (
                 SELECT in FROM code_relation
                 WHERE kind = 'calls'
                   AND out IN (SELECT id FROM code_element WHERE name = $name)
             )${project ? " AND project = $project" : ""};`,
            { name, project },
        ])
        return fallback?.[0]?.result ?? []
    }

    return result?.[0]?.result ?? []
}

export async function findDependencies(
    file: string,
    project?: string
): Promise<{ imports: string[]; importedBy: string[] }> {
    const projectFilter = project ? ` AND project = $project` : ""

    // Files this file imports
    const importsResult = await rpc<Array<{ result: Array<{ file: string }> }>>("query", [
        `SELECT DISTINCT out.file AS file FROM code_relation
         WHERE kind = 'imports'
           AND in IN (SELECT id FROM code_element WHERE file = $file${projectFilter});`,
        { file, project },
    ])

    // Files that import this file
    const importedByResult = await rpc<Array<{ result: Array<{ file: string }> }>>("query", [
        `SELECT DISTINCT in.file AS file FROM code_relation
         WHERE kind = 'imports'
           AND out IN (SELECT id FROM code_element WHERE file = $file${projectFilter});`,
        { file, project },
    ])

    return {
        imports: (importsResult?.[0]?.result ?? []).map(r => r.file).filter(Boolean),
        importedBy: (importedByResult?.[0]?.result ?? []).map(r => r.file).filter(Boolean),
    }
}

export async function getCodeOverview(
    project: string
): Promise<CodeOverview> {
    const statsResult = await rpc<Array<{ result: Array<{ kind: string; count: number }> }>>("query", [
        `SELECT kind, count() AS count FROM code_element WHERE project = $project GROUP BY kind;`,
        { project },
    ])
    const fileResult = await rpc<Array<{ result: Array<{ count: number }> }>>("query", [
        `SELECT count(DISTINCT file) AS count FROM code_element WHERE project = $project;`,
        { project },
    ])
    const exportResult = await rpc<Array<{ result: Array<{ count: number }> }>>("query", [
        `SELECT count() AS count FROM code_element WHERE project = $project AND exported = true;`,
        { project },
    ])

    return {
        fileCount: fileResult?.[0]?.result?.[0]?.count ?? 0,
        elementCounts: statsResult?.[0]?.result ?? [],
        exportCount: exportResult?.[0]?.result?.[0]?.count ?? 0,
    }
}

export async function clearCodeIndex(project: string): Promise<void> {
    // Delete relations first, then elements
    await rpc("query", [
        `DELETE code_relation WHERE in.project = $project OR out.project = $project;`,
        { project },
    ])
    await rpc("query", [
        `DELETE code_element WHERE project = $project;`,
        { project },
    ])
    log("[surreal-client] Code index cleared", { project })
}

export async function getIndexedFiles(
    project: string
): Promise<Array<{ file: string; fileHash: string }>> {
    const result = await rpc<Array<{ result: Array<{ file: string; file_hash: string }> }>>("query", [
        `SELECT DISTINCT file, file_hash FROM code_element WHERE project = $project;`,
        { project },
    ])

    return (result?.[0]?.result ?? []).map(r => ({
        file: r.file,
        fileHash: r.file_hash,
    }))
}
