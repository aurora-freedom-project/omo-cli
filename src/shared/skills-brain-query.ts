/**
 * Skills Brain Query — Hybrid search against SurrealDB brain.skill.
 *
 * Uses the SAME SurrealQL query as Omni Rust's `hybrid_search()`:
 *   BM25 FULLTEXT + HNSW vector + Reciprocal Rank Fusion (RRF k=60)
 *
 * Falls back to BM25-only if no embedding is provided.
 */

import { log } from "../shared/logger"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillSearchResult {
    name: string
    description: string
    file_path: string
    content?: string
    rrf_score?: number
}

interface RpcResponse<T = unknown> {
    id?: string
    result?: T
    error?: { code: number; message: string }
}

// ---------------------------------------------------------------------------
// Global DB connection (skills always use global_ns/global_db)
// ---------------------------------------------------------------------------

export interface GlobalBrainConfig {
    url: string        // e.g. "http://127.0.0.1:18000/rpc"
    user: string
    pass: string
    global_ns: string  // e.g. "omni"
    global_db: string  // e.g. "brain"
}

const DEFAULT_CONFIG: GlobalBrainConfig = {
    url: "http://127.0.0.1:18000/rpc",
    user: "root",
    pass: "omo-secret",
    global_ns: "omni",
    global_db: "brain",
}

let brainConfig: GlobalBrainConfig = { ...DEFAULT_CONFIG }

/** Configure the brain connection (call during plugin init). */
export function configureBrain(config: Partial<GlobalBrainConfig>): void {
    brainConfig = { ...brainConfig, ...config }
}

/** Get current brain config. */
export function getBrainConfig(): Readonly<GlobalBrainConfig> {
    return { ...brainConfig }
}

// ---------------------------------------------------------------------------
// RPC to brain DB
// ---------------------------------------------------------------------------

export async function brainRpc<T = unknown>(sql: string): Promise<T> {
    const { url, user, pass, global_ns, global_db } = brainConfig

    // Same pattern as Omni Rust: prepend USE NS/DB for global skill queries
    const fullSql = `USE NS ${global_ns} DB ${global_db}; ${sql}`

    const payload = { id: "1", method: "query", params: [fullSql] }
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Basic ${btoa(`${user}:${pass}`)}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
        throw new Error(`Brain RPC HTTP ${res.status}: ${await res.text()}`)
    }

    const data = (await res.json()) as RpcResponse<T>
    if (data.error) {
        throw new Error(`Brain RPC error: ${data.error.message}`)
    }

    // Strip leading USE result
    if (Array.isArray(data.result) && data.result.length > 1) {
        return data.result.slice(1) as T
    }

    return data.result as T
}

// ---------------------------------------------------------------------------
// Health & skill count
// ---------------------------------------------------------------------------

/** Check if brain DB is reachable. */
export async function isBrainReachable(): Promise<boolean> {
    try {
        await brainRpc("RETURN true;")
        return true
    } catch {
        return false
    }
}

/** Count skills in brain.skill table. Returns 0 if table doesn't exist. */
export async function getSkillCount(): Promise<number> {
    try {
        const result = await brainRpc<Array<{ result: Array<{ count: number }> }>>(
            "SELECT count() AS count FROM skill GROUP ALL;"
        )
        return result?.[0]?.result?.[0]?.count ?? 0
    } catch {
        return 0
    }
}

// ---------------------------------------------------------------------------
// Hybrid Search (BM25 + HNSW + RRF) — same SQL as Omni Rust
// ---------------------------------------------------------------------------

/**
 * Hybrid skill search using BM25 full-text + HNSW vector + RRF fusion.
 * Matches Omni Rust's `surreal.rs:hybrid_search()` exactly.
 *
 * @param query - Text query for BM25 search
 * @param embedding - Optional 1024-dim embedding for vector search
 * @param limit - Max results (default: 5)
 */
export async function hybridSkillSearch(
    query: string,
    embedding?: number[],
    limit = 5,
): Promise<SkillSearchResult[]> {
    // Escape for SurrealQL string literal: backslash first, then single quotes, then null bytes
    const queryEscaped = query
        .replace(/\\/g, "\\\\")     // backslash → double backslash (MUST be first)
        .replace(/'/g, "\\'")       // single quote → escaped
        .replace(/\0/g, "")         // strip null bytes

    let sql: string

    if (embedding && embedding.length > 0) {
        // Full hybrid: BM25 + vector + RRF
        const embJson = JSON.stringify(embedding)
        sql = `
            LET $vs = SELECT id, name, description, file_path, content
                FROM skill WHERE embedding <|${limit},100|> ${embJson};
            LET $ft = SELECT id, name, description, file_path, content, search::score(1) AS score
                FROM skill WHERE content @1@ '${queryEscaped}'
                ORDER BY score DESC LIMIT ${limit};
            RETURN search::rrf([$vs, $ft], ${limit}, 60);
        `
    } else {
        // BM25-only fallback (no embeddings available)
        sql = `
            SELECT name, description, file_path, content, search::score(1) AS rrf_score
            FROM skill WHERE content @1@ '${queryEscaped}'
            ORDER BY rrf_score DESC LIMIT ${limit};
        `
    }

    try {
        const result = await brainRpc<Array<{ result: unknown[] }>>(sql)
        const rows = result?.[0]?.result ?? []
        return rows.map((row: unknown) => {
            const r = row as Record<string, unknown>
            return {
                name: (r.name as string) ?? "",
                description: (r.description as string) ?? "",
                file_path: (r.file_path as string) ?? "",
                content: r.content as string | undefined,
                rrf_score: (r.rrf_score as number) ?? 0,
            }
        })
    } catch (e) {
        log("[skills-brain-query] Hybrid search failed", { error: String(e) })
        return []
    }
}

// ---------------------------------------------------------------------------
// Schema application (must match Omni's migrations.rs)
// ---------------------------------------------------------------------------

const SKILL_SCHEMA_SQL = `
DEFINE TABLE IF NOT EXISTS skill SCHEMALESS PERMISSIONS FULL;
DEFINE ANALYZER IF NOT EXISTS skill_analyzer TOKENIZERS class, punct FILTERS lowercase, ascii;
DEFINE INDEX IF NOT EXISTS skill_ft ON skill FIELDS content FULLTEXT ANALYZER skill_analyzer BM25;
DEFINE INDEX IF NOT EXISTS skill_vec ON skill FIELDS embedding HNSW DIMENSION 1024 DIST COSINE;
`

/** Apply skill search schema (same as Omni's apply_skill_search_schema). */
export async function applySkillSchema(): Promise<void> {
    const statements = SKILL_SCHEMA_SQL
        .trim()
        .split(";")
        .map(s => s.trim())
        .filter(s => s && !s.startsWith("--"))

    for (const stmt of statements) {
        try {
            await brainRpc(`${stmt};`)
        } catch (e) {
            log("[skills-brain-query] Schema statement warning", { stmt, error: String(e) })
        }
    }

    log("[skills-brain-query] Skill schema applied")
}

// ---------------------------------------------------------------------------
// Execution Event schema (from Omni commit e34c6d58 — Ouroboros integration)
// ---------------------------------------------------------------------------

const EVENT_SCHEMA_SQL = `
DEFINE TABLE IF NOT EXISTS execution_event SCHEMALESS PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS session_id ON execution_event TYPE string;
DEFINE FIELD IF NOT EXISTS event_type ON execution_event TYPE string;
DEFINE FIELD IF NOT EXISTS payload ON execution_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS project ON execution_event TYPE string;
DEFINE FIELD IF NOT EXISTS created_at ON execution_event TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS event_session ON execution_event FIELDS session_id;
DEFINE INDEX IF NOT EXISTS event_type_idx ON execution_event FIELDS event_type;
`

/** Apply execution event schema (same as Omni's apply_event_schema). */
export async function applyEventSchema(): Promise<void> {
    const statements = EVENT_SCHEMA_SQL
        .trim()
        .split(";")
        .map(s => s.trim())
        .filter(s => s && !s.startsWith("--"))

    for (const stmt of statements) {
        try {
            await brainRpc(`${stmt};`)
        } catch (e) {
            log("[skills-brain-query] Event schema warning", { stmt, error: String(e) })
        }
    }

    log("[skills-brain-query] Execution event schema applied")
}
