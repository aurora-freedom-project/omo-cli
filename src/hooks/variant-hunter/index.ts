/**
 * Variant Hunting Engine — Find-one-catch-all (from RAPTOR)
 *
 * When a vulnerability is found in one location, automatically search
 * the codebase for structurally similar code that likely has the same flaw.
 *
 * Pattern: decompose finding → extract structural signature → search variants
 */

import { log } from "../../shared/logger"
import { createHash } from "node:crypto"

// ── Types ────────────────────────────────────────────────────────────────────

interface Finding {
    id: string
    category: string
    title: string
    filePath: string
    lineNumber: number
    codeSnippet: string      // The vulnerable code
    pattern?: string         // Optional AST pattern
}

interface VariantSignature {
    id: string
    findingId: string
    category: string
    keywords: string[]       // Extracted key tokens from the code
    pattern: string          // Structural pattern for searching
    complexity: number       // Signature complexity (higher = more specific)
}

interface VariantMatch {
    id: string
    signatureId: string
    filePath: string
    lineNumber: number
    matchedCode: string
    similarity: number       // 0-1
    isOriginal: boolean      // true if this is the original finding
    status: "new" | "confirmed" | "false_positive" | "fixed"
}

interface VariantHuntResult {
    signature: VariantSignature
    variants: VariantMatch[]
    totalMatches: number
    newVariants: number      // Excluding original
}

interface VariantConfig {
    enabled: boolean
    minSimilarity: number          // Minimum similarity to report (0-1)
    maxVariantsPerFinding: number
    autoHuntOnNewFinding: boolean
    categoryPatterns: CategoryPattern[]
}

interface CategoryPattern {
    category: string
    keywords: string[]       // Domain-specific keywords to look for
    astPattern?: string      // AST-grep pattern template
}

interface VariantStats {
    totalSignatures: number
    totalMatches: number
    newVariantsFound: number
    confirmedVariants: number
    falsePositives: number
    avgSimilarity: number
    variantsByCategory: Record<string, number>
}

// ── Category Patterns ────────────────────────────────────────────────────────

const DEFAULT_CATEGORY_PATTERNS: CategoryPattern[] = [
    {
        category: "sql_injection",
        keywords: ["query", "execute", "sql", "SELECT", "INSERT", "UPDATE", "DELETE", "WHERE"],
        astPattern: "$DB.query($SQL)",
    },
    {
        category: "xss",
        keywords: ["innerHTML", "document.write", "dangerouslySetInnerHTML", "v-html", "html("],
        astPattern: "$EL.innerHTML = $INPUT",
    },
    {
        category: "command_injection",
        keywords: ["exec", "spawn", "system", "popen", "subprocess", "child_process", "eval"],
        astPattern: "exec($CMD)",
    },
    {
        category: "path_traversal",
        keywords: ["readFile", "writeFile", "open", "path.join", "fs.", "readFileSync"],
        astPattern: "fs.readFileSync($PATH)",
    },
    {
        category: "ssrf",
        keywords: ["fetch", "axios", "http.get", "request", "urllib", "httpClient"],
        astPattern: "fetch($URL)",
    },
    {
        category: "insecure_deserialization",
        keywords: ["JSON.parse", "pickle.loads", "yaml.load", "deserialize", "unserialize"],
        astPattern: "JSON.parse($INPUT)",
    },
    {
        category: "hardcoded_secret",
        keywords: ["password", "secret", "api_key", "token", "apiKey", "AWS_SECRET"],
    },
    {
        category: "weak_crypto",
        keywords: ["md5", "sha1", "DES", "RC4", "Math.random", "createCipher"],
    },
]

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: VariantConfig = {
    enabled: true,
    minSimilarity: 0.4,
    maxVariantsPerFinding: 20,
    autoHuntOnNewFinding: true,
    categoryPatterns: DEFAULT_CATEGORY_PATTERNS,
}

// ── State ────────────────────────────────────────────────────────────────────

const signatures = new Map<string, VariantSignature>()
const matches = new Map<string, VariantMatch>()
let config: VariantConfig = { ...DEFAULT_CONFIG, categoryPatterns: [...DEFAULT_CATEGORY_PATTERNS] }

// ── Keyword Extraction ───────────────────────────────────────────────────────

/**
 * Extract meaningful keywords from a code snippet.
 */
function extractKeywords(code: string): string[] {
    // Tokenize: split on non-alphanumeric, filter short tokens
    const tokens = code
        .split(/[^a-zA-Z0-9_]+/)
        .filter(t => t.length >= 3)
        .map(t => t.toLowerCase())

    // Deduplicate and keep unique tokens
    return [...new Set(tokens)]
}

/**
 * Calculate Jaccard similarity between two keyword sets.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a)
    const setB = new Set(b)
    const intersection = new Set([...setA].filter(x => setB.has(x)))
    const union = new Set([...setA, ...setB])
    return union.size > 0 ? intersection.size / union.size : 0
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Create a variant signature from a finding.
 */
function createSignature(finding: Finding): VariantSignature {
    const codeKeywords = extractKeywords(finding.codeSnippet)

    // Enrich with category-specific keywords
    const catPattern = config.categoryPatterns.find(p => p.category === finding.category)
    const categoryKeywords = catPattern?.keywords ?? []

    // Combine: code keywords that overlap with category keywords get boosted
    const keywords = [...new Set([...codeKeywords, ...categoryKeywords.filter(k =>
        codeKeywords.some(ck => ck.includes(k.toLowerCase()))
    )])]

    const sig: VariantSignature = {
        id: createHash("sha256").update(`sig|${finding.id}`).digest("hex").slice(0, 12),
        findingId: finding.id,
        category: finding.category,
        keywords,
        pattern: catPattern?.astPattern ?? finding.pattern ?? codeKeywords.slice(0, 5).join(" "),
        complexity: keywords.length,
    }

    signatures.set(sig.id, sig)
    return sig
}

/**
 * Search for variants of a signature in a set of code snippets.
 */
function huntVariants(
    signature: VariantSignature,
    codebase: { filePath: string; lineNumber: number; code: string }[],
    originalFindingPath?: string,
): VariantHuntResult {
    const foundVariants: VariantMatch[] = []

    for (const entry of codebase) {
        const entryKeywords = extractKeywords(entry.code)
        const similarity = jaccardSimilarity(signature.keywords, entryKeywords)

        if (similarity < config.minSimilarity) continue

        const isOriginal = entry.filePath === originalFindingPath

        const match: VariantMatch = {
            id: createHash("sha256")
                .update(`match|${signature.id}|${entry.filePath}|${entry.lineNumber}`)
                .digest("hex")
                .slice(0, 12),
            signatureId: signature.id,
            filePath: entry.filePath,
            lineNumber: entry.lineNumber,
            matchedCode: entry.code.slice(0, 200),
            similarity,
            isOriginal,
            status: isOriginal ? "confirmed" : "new",
        }

        matches.set(match.id, match)
        foundVariants.push(match)

        if (foundVariants.length >= config.maxVariantsPerFinding) break
    }

    // Sort by similarity descending
    foundVariants.sort((a, b) => b.similarity - a.similarity)

    const newVariants = foundVariants.filter(v => !v.isOriginal)
    log("[variant-hunter] Hunt complete", {
        signatureId: signature.id,
        total: foundVariants.length,
        new: newVariants.length,
    })

    return {
        signature,
        variants: foundVariants,
        totalMatches: foundVariants.length,
        newVariants: newVariants.length,
    }
}

/**
 * Full pipeline: finding → signature → hunt.
 */
function findVariants(
    finding: Finding,
    codebase: { filePath: string; lineNumber: number; code: string }[],
): VariantHuntResult {
    if (!config.enabled) {
        const sig = createSignature(finding)
        return { signature: sig, variants: [], totalMatches: 0, newVariants: 0 }
    }

    const signature = createSignature(finding)
    return huntVariants(signature, codebase, finding.filePath)
}

/**
 * Update variant status.
 */
function updateVariantStatus(matchId: string, status: VariantMatch["status"]): boolean {
    const match = matches.get(matchId)
    if (!match) return false
    match.status = status
    return true
}

/**
 * Get signature by ID.
 */
function getSignature(id: string): VariantSignature | undefined {
    return signatures.get(id)
}

/**
 * Get match by ID.
 */
function getMatch(id: string): VariantMatch | undefined {
    return matches.get(id)
}

/**
 * Get all matches for a signature.
 */
function getMatchesForSignature(signatureId: string): VariantMatch[] {
    return Array.from(matches.values()).filter(m => m.signatureId === signatureId)
}

/**
 * Get stats.
 */
function getStats(): VariantStats {
    const allMatches = Array.from(matches.values())
    const newVariants = allMatches.filter(m => m.status === "new")
    const confirmed = allMatches.filter(m => m.status === "confirmed")
    const falsePositives = allMatches.filter(m => m.status === "false_positive")

    const variantsByCategory: Record<string, number> = {}
    for (const sig of signatures.values()) {
        const sigMatches = allMatches.filter(m => m.signatureId === sig.id && !m.isOriginal)
        if (sigMatches.length > 0) {
            variantsByCategory[sig.category] = (variantsByCategory[sig.category] ?? 0) + sigMatches.length
        }
    }

    return {
        totalSignatures: signatures.size,
        totalMatches: allMatches.length,
        newVariantsFound: newVariants.length,
        confirmedVariants: confirmed.length,
        falsePositives: falsePositives.length,
        avgSimilarity: allMatches.length > 0
            ? allMatches.reduce((sum, m) => sum + m.similarity, 0) / allMatches.length
            : 0,
        variantsByCategory,
    }
}

function resetAll(): void {
    signatures.clear()
    matches.clear()
    config = { ...DEFAULT_CONFIG, categoryPatterns: [...DEFAULT_CATEGORY_PATTERNS] }
}

function configure(overrides: Partial<VariantConfig>): void {
    config = { ...config, ...overrides }
}

// ── Hook Factory ─────────────────────────────────────────────────────────────

function createVariantHunterHook(overrides?: Partial<VariantConfig>): Record<string, Function> | null {
    if (overrides) configure(overrides)
    if (!config.enabled) return null

    return {
        "finding.new": async (ctx: Record<string, unknown>) => {
            const finding = ctx.finding as Finding | undefined
            if (!finding || !config.autoHuntOnNewFinding) return

            createSignature(finding)
        },

        "session.end": async () => {
            const stats = getStats()
            log("[variant-hunter] Session summary", stats)
        },
    }
}

// ── Exports ──────────────────────────────────────────────────────────────────

export {
    extractKeywords,
    jaccardSimilarity,
    createSignature,
    huntVariants,
    findVariants,
    updateVariantStatus,
    getSignature,
    getMatch,
    getMatchesForSignature,
    getStats,
    resetAll,
    configure,
    createVariantHunterHook,
    DEFAULT_CONFIG,
    DEFAULT_CATEGORY_PATTERNS,
    type Finding,
    type VariantSignature,
    type VariantMatch,
    type VariantHuntResult,
    type VariantConfig,
    type VariantStats,
}
