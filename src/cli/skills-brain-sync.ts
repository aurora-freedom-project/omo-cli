/**
 * Skills Brain Sync — Self-index skills to SurrealDB brain.skill.
 *
 * Mirrors Omni Rust's `sync_skills.rs` logic:
 *   1. Scan ~/.config/_skills_/ for SKILL.md files
 *   2. UPSERT to brain.skill with same schema
 *   3. Generate embeddings via Ollama (if available)
 *   4. Apply BM25 + HNSW indexes
 *
 * Used when omo-cli runs standalone (no omni installed).
 * If omni already indexed → omo-cli detects populated DB and skips.
 */

import { log } from "../shared/logger"
import {
    configureBrain,
    isBrainReachable,
    getSkillCount,
    applySkillSchema,
    applyEventSchema,
    brainRpc,
    type GlobalBrainConfig
} from "../shared/skills-brain-query"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNIFIED_SKILLS_DIR = path.join(
    process.env.HOME ?? "~",
    ".config",
    "_skills_"
)

const NATIVE_SKILLS_DIR = path.join(
    process.env.HOME ?? "~",
    ".config",
    "opencode",
    "skills"
)

/** Embedding model used by Omni — must match for compatible embeddings */
const EMBEDDING_MODEL = "mxbai-embed-large:latest"
const EMBEDDING_DIMENSION = 1024

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedSkill {
    name: string
    description: string
    content: string
    filePath: string
    contentHash: string
}

interface SyncResult {
    total: number
    upserted: number
    skipped: number
    failed: number
    source: "surreal" | "filesystem"
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve skills source: SurrealDB or filesystem fallback.
 * This is the main entry point for the resolution protocol.
 *
 * @returns "surreal" if brain.skill is populated, "filesystem" if fallback
 */
export async function resolveSkillSource(
    config?: Partial<GlobalBrainConfig>
): Promise<"surreal" | "filesystem"> {
    if (config) configureBrain(config)

    try {
        // 1. Check if SurrealDB brain is reachable
        const reachable = await isBrainReachable()
        if (!reachable) {
            log("[skills-brain-sync] SurrealDB not reachable, using filesystem")
            return "filesystem"
        }

        // 2. Check if brain.skill is already populated (by omni or omo-cli)
        const count = await getSkillCount()
        if (count > 0) {
            log("[skills-brain-sync] brain.skill has data", { count })
            return "surreal"
        }

        // 3. Empty → try to self-index
        log("[skills-brain-sync] brain.skill empty, attempting self-index...")
        const result = await syncSkillsToBrain()
        if (result.upserted > 0) {
            log("[skills-brain-sync] Self-indexed skills", { upserted: result.upserted })
            return "surreal"
        }

        // 4. Self-index failed or no skills → filesystem
        log("[skills-brain-sync] Self-index produced 0 skills, using filesystem")
        return "filesystem"
    } catch (e) {
        log("[skills-brain-sync] Resolution failed", { error: String(e) })
        return "filesystem"
    }
}

/**
 * Sync skills from filesystem to SurrealDB brain.skill.
 * Uses same schema as Omni Rust's sync_skills.rs.
 */
export async function syncSkillsToBrain(): Promise<SyncResult> {
    const result: SyncResult = { total: 0, upserted: 0, skipped: 0, failed: 0, source: "surreal" }

    // 1. Apply schemas (skill + execution event)
    await applySkillSchema()
    await applyEventSchema()

    // 2. Discover all SKILL.md files
    const skillFiles = discoverSkillFiles()
    result.total = skillFiles.length

    if (skillFiles.length === 0) {
        log("[skills-brain-sync] No skill files found")
        return result
    }

    // 3. Check Ollama availability for embeddings
    const ollamaUrl = process.env.OLLAMA_HOST ?? "http://localhost:11434"
    const ollamaAvailable = await checkOllama(ollamaUrl)

    // 4. Process each skill
    const concurrency = 5
    const chunks = chunkArray(skillFiles, concurrency)

    for (const chunk of chunks) {
        const promises = chunk.map(async (filePath) => {
            try {
                const skill = parseSkillFile(filePath)
                if (!skill) {
                    result.failed++
                    return
                }

                // Generate embedding if Ollama available
                let embedding: number[] | null = null
                if (ollamaAvailable) {
                    const embText = `${skill.name} ${skill.filePath} ${skill.description.slice(0, 200)}`
                    embedding = await generateEmbedding(ollamaUrl, embText)
                }

                // UPSERT to brain.skill — same format as Omni Rust
                await upsertSkill(skill, embedding)
                result.upserted++
            } catch (e) {
                log("[skills-brain-sync] Failed to sync skill", { filePath, error: String(e) })
                result.failed++
            }
        })
        await Promise.allSettled(promises)
    }

    log("[skills-brain-sync] Sync complete", result)
    return result
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Discover all SKILL.md files from unified + native directories. */
function discoverSkillFiles(): string[] {
    const files: string[] = []

    for (const dir of [UNIFIED_SKILLS_DIR, NATIVE_SKILLS_DIR]) {
        if (!fs.existsSync(dir)) continue

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
                if (!entry.isDirectory()) continue
                const skillMd = path.join(dir, entry.name, "SKILL.md")
                if (fs.existsSync(skillMd)) {
                    files.push(skillMd)
                }
            }
        } catch {
            // Skip unreadable directories
        }
    }

    return files
}

/** Parse a SKILL.md file into a structured skill object. */
function parseSkillFile(filePath: string): ParsedSkill | null {
    try {
        const raw = fs.readFileSync(filePath, "utf8")
        const contentHash = crypto.createHash("md5").update(raw).digest("hex")

        // Extract YAML frontmatter
        let name = path.basename(path.dirname(filePath))
        let description = ""

        const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/)
        if (fmMatch) {
            const fm = fmMatch[1]
            const nameMatch = fm.match(/name:\s*["']?(.+?)["']?\s*$/m)
            if (nameMatch) name = nameMatch[1].trim()
            const descMatch = fm.match(/description:\s*["']?(.+?)["']?\s*$/m)
            if (descMatch) description = descMatch[1].trim()
        }

        return {
            name,
            description: description || `Skill: ${name}`,
            content: raw,
            filePath,
            contentHash,
        }
    } catch {
        return null
    }
}

/** UPSERT a skill into brain.skill — same record ID format as Omni Rust. */
async function upsertSkill(skill: ParsedSkill, embedding: number[] | null): Promise<void> {
    // Same ID sanitization as Omni Rust
    const safeName = skill.name
        .replace(/\s+/g, "_")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "")
    const id = `skill:⟨${safeName}⟩`

    const nameEsc = JSON.stringify(skill.name)
    const descEsc = JSON.stringify(skill.description)
    const contentEsc = JSON.stringify(skill.content)
    const pathEsc = JSON.stringify(skill.filePath)
    const hashEsc = JSON.stringify(skill.contentHash)
    const embStr = embedding ? JSON.stringify(embedding) : "[]"

    const sql = `UPSERT ${id} SET name = ${nameEsc}, description = ${descEsc}, content = ${contentEsc}, file_path = ${pathEsc}, content_hash = ${hashEsc}, embedding = ${embStr}, synced_at = time::now(), indexed_by = 'omo-cli';`

    await brainRpc(sql)
}

/** Check if Ollama is available. */
async function checkOllama(url: string): Promise<boolean> {
    try {
        const res = await fetch(`${url}/api/tags`, {
            signal: AbortSignal.timeout(3000),
        })
        return res.ok
    } catch {
        return false
    }
}

/** Generate embedding via Ollama API. */
async function generateEmbedding(ollamaUrl: string, text: string): Promise<number[] | null> {
    try {
        const res = await fetch(`${ollamaUrl}/api/embeddings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
            signal: AbortSignal.timeout(30000),
        })

        if (!res.ok) return null

        const data = (await res.json()) as { embedding?: number[] }
        if (data.embedding && data.embedding.length === EMBEDDING_DIMENSION) {
            return data.embedding
        }
        return null
    } catch {
        return null
    }
}

/** Split array into chunks of given size. */
function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size))
    }
    return chunks
}
