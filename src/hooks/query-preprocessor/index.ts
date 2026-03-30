/**
 * Query Preprocessor — Extracts structured task metadata from user prompts.
 *
 * Ported from Omni's query_preprocessor. Analyzes raw user prompts to extract:
 * - Task type classification (code, analysis, debug, test, deploy, etc.)
 * - Programming language detection
 * - File path references
 * - Urgency/complexity signals
 *
 * This metadata is used by the Context Planner to make intelligent routing
 * decisions (which hooks to run, what context to load).
 *
 * @see OmniUltraAgent_Kit/src/agents/query_preprocessor.rs
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export type TaskType =
    | "code"       // Write/modify code
    | "debug"      // Fix bugs, troubleshoot
    | "test"       // Write tests
    | "analysis"   // Analyze, explain, review
    | "refactor"   // Restructure existing code
    | "deploy"     // Build, deploy, CI/CD
    | "design"     // Architecture, planning
    | "research"   // Web research, exploration
    | "general"    // Everything else

export interface QueryMetadata {
    taskType: TaskType
    languages: string[]
    filePaths: string[]
    urgency: "low" | "medium" | "high"
    complexity: "trivial" | "simple" | "moderate" | "complex"
    keywords: string[]
}

// ── Detection Patterns ─────────────────────────────────────────────────────

const TASK_TYPE_PATTERNS: Array<{ type: TaskType; patterns: RegExp[] }> = [
    { type: "debug", patterns: [
        /\b(?:fix|bug|error|crash|broken|fail|issue|debug|stack\s*trace|exception)\b/i,
    ]},
    { type: "test", patterns: [
        /\b(?:test|spec|coverage|unit\s*test|e2e|integration\s*test|tdd|assertion)\b/i,
    ]},
    { type: "refactor", patterns: [
        /\b(?:refactor|restructure|reorganize|clean\s*up|simplify|extract|move|rename)\b/i,
    ]},
    { type: "deploy", patterns: [
        /\b(?:deploy|build|release|publish|docker|ci\/cd|pipeline|production|ship)\b/i,
    ]},
    { type: "design", patterns: [
        /\b(?:design|architect|plan|blueprint|diagram|spec|rfc|proposal|brainstorm)\b/i,
    ]},
    { type: "research", patterns: [
        /\b(?:research|explore|investigate|compare|benchmark|evaluate|survey)\b/i,
    ]},
    { type: "analysis", patterns: [
        /\b(?:analyz|explain|review|audit|inspect|check|understand|how\s+does|what\s+is)\b/i,
    ]},
    { type: "code", patterns: [
        /\b(?:implement|create|add|write|build|generate|develop|code|function|class|api|endpoint|component)\b/i,
    ]},
]

const LANGUAGE_PATTERNS: Array<{ lang: string; patterns: RegExp[] }> = [
    { lang: "typescript", patterns: [/\.tsx?$/i, /\btypescript\b/i, /\bts\b/i] },
    { lang: "javascript", patterns: [/\.jsx?$/i, /\bjavascript\b/i, /\bjs\b/i] },
    { lang: "python", patterns: [/\.py$/i, /\bpython\b/i, /\bpip\b/i] },
    { lang: "rust", patterns: [/\.rs$/i, /\brust\b/i, /\bcargo\b/i] },
    { lang: "go", patterns: [/\.go$/i, /\bgolang\b/i, /\bgo\b/i] },
    { lang: "java", patterns: [/\.java$/i, /\bjava\b/i, /\bgradle\b/i, /\bmaven\b/i] },
    { lang: "ruby", patterns: [/\.rb$/i, /\bruby\b/i, /\bgem\b/i] },
    { lang: "php", patterns: [/\.php$/i, /\bphp\b/i] },
    { lang: "swift", patterns: [/\.swift$/i, /\bswift\b/i] },
    { lang: "c", patterns: [/\.c$/i, /\bc\b(?!#|\\+)/i] },
    { lang: "cpp", patterns: [/\.cpp$/i, /\bc\+\+\b/i] },
    { lang: "csharp", patterns: [/\.cs$/i, /\bc#\b/i, /\bdotnet\b/i] },
]

const FILE_PATH_PATTERN = /(?:^|\s|["'`(])([.\w/-]+\.(?:ts|tsx|js|jsx|py|rs|go|rb|java|c|cpp|h|yaml|yml|json|toml|md|sh|sql|html|css|scss))\b/gi

const URGENCY_PATTERNS = {
    high: /\b(?:urgent|asap|critical|immediately|production\s+(?:down|issue|bug)|breaking|hotfix)\b/i,
    medium: /\b(?:soon|important|priority|before\s+(?:deploy|release|merge))\b/i,
}

// ── Preprocessor ───────────────────────────────────────────────────────────

/**
 * Preprocess a user query to extract structured metadata.
 */
export function preprocessQuery(text: string): QueryMetadata {
    // Task type detection
    let taskType: TaskType = "general"
    for (const { type, patterns } of TASK_TYPE_PATTERNS) {
        if (patterns.some(p => p.test(text))) {
            taskType = type
            break
        }
    }

    // Language detection
    const languages: string[] = []
    for (const { lang, patterns } of LANGUAGE_PATTERNS) {
        if (patterns.some(p => p.test(text))) {
            languages.push(lang)
        }
    }

    // File path extraction
    const filePaths: string[] = []
    let match: RegExpExecArray | null
    const fileRegex = new RegExp(FILE_PATH_PATTERN.source, FILE_PATH_PATTERN.flags)
    while ((match = fileRegex.exec(text)) !== null) {
        filePaths.push(match[1])
    }

    // Urgency detection
    const urgency = URGENCY_PATTERNS.high.test(text)
        ? "high" as const
        : URGENCY_PATTERNS.medium.test(text)
            ? "medium" as const
            : "low" as const

    // Complexity estimation
    const wordCount = text.split(/\s+/).length
    const fileCount = filePaths.length
    const complexity =
        wordCount < 10 && fileCount <= 1 ? "trivial" as const
        : wordCount < 30 && fileCount <= 2 ? "simple" as const
        : wordCount < 100 || fileCount <= 5 ? "moderate" as const
        : "complex" as const

    // Keyword extraction (top 10 meaningful words)
    const stopWords = new Set([
        "the", "a", "an", "is", "are", "to", "in", "for", "on", "with", "at", "by",
        "from", "of", "and", "or", "not", "this", "that", "it", "be", "do", "have",
        "will", "would", "can", "could", "should", "please", "need", "want", "like",
    ])
    const keywords = text.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w))
        .map(w => w.replace(/[^a-z0-9_-]/g, ""))
        .filter(w => w.length > 3)
        .slice(0, 10)

    const metadata: QueryMetadata = {
        taskType, languages, filePaths, urgency, complexity, keywords,
    }

    log("[query-preprocessor] Analyzed prompt", {
        taskType, languages, fileCount: filePaths.length, urgency, complexity,
    })

    return metadata
}
