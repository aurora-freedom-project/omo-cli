/**
 * 7-Dimension Skill Scoring — Quality assessment for SKILL.md files.
 *
 * Based on tinyfish-io's quality metrics, adapted for OMO skill structure.
 *
 * Dimensions:
 *   1. Frontmatter Quality (name + description completeness)
 *   2. Content Depth (line count, section count)
 *   3. Anti-Pattern Coverage (has ## Anti-Patterns section)
 *   4. Actionability (has numbered instructions, concrete examples)
 *   5. Structure (markdown hierarchy, heading organization)
 *   6. Specificity (avoids vague language, has concrete patterns)
 *   7. Contextual Relevance (matches OMO agent roles)
 */

export interface DimensionScore {
    dimension: string
    score: number     // 0.0 - 1.0
    maxScore: 1.0
    details: string
}

export interface SkillScore {
    name: string
    filePath: string
    dimensions: DimensionScore[]
    totalScore: number     // 0.0 - 7.0 (sum of 7 dimensions)
    grade: "A" | "B" | "C" | "D" | "F"
    issues: string[]
}

const VAGUE_WORDS = /\b(maybe|possibly|might|could|should perhaps|etc\.?|and so on|various|stuff|things)\b/gi

// ───── Individual Dimension Scorers ─────

function scoreFrontmatter(content: string): DimensionScore {
    const parts = content.split("---")
    let score = 0
    const details: string[] = []

    if (parts.length >= 3) {
        const fm = parts[1]
        if (fm.match(/^name:/m)) { score += 0.3; details.push("✓ name") }
        if (fm.match(/^description:/m)) {
            const desc = fm.match(/^description:\s*(.+)$/m)?.[1] ?? ""
            if (desc.length > 20) { score += 0.5; details.push("✓ description (detailed)") }
            else if (desc.length > 0) { score += 0.3; details.push("⚠ description (brief)") }
        }
        if (fm.match(/^(license|author|version):/m)) { score += 0.2; details.push("✓ metadata") }
        else { score += 0.1 } // base for having frontmatter at all
    } else {
        details.push("✗ missing frontmatter")
    }

    return { dimension: "Frontmatter", score: Math.min(score, 1.0), maxScore: 1.0, details: details.join(", ") }
}

function scoreContentDepth(content: string): DimensionScore {
    const lines = content.split("\n").filter(l => l.trim().length > 0)
    const sections = (content.match(/^## (?!#)/gm) ?? []).length
    let score = 0
    const details: string[] = []

    // Line count scoring
    if (lines.length >= 100) { score += 0.4; details.push(`✓ ${lines.length} lines`) }
    else if (lines.length >= 50) { score += 0.3; details.push(`⚠ ${lines.length} lines (thin)`) }
    else if (lines.length >= 20) { score += 0.2; details.push(`⚠ ${lines.length} lines (minimal)`) }
    else { details.push(`✗ ${lines.length} lines (too short)`) }

    // Section count scoring
    if (sections >= 5) { score += 0.4; details.push(`✓ ${sections} sections`) }
    else if (sections >= 3) { score += 0.3; details.push(`⚠ ${sections} sections`) }
    else if (sections >= 1) { score += 0.1; details.push(`✗ ${sections} section(s)`) }

    // Word count
    const words = content.split(/\s+/).length
    if (words >= 500) score += 0.2
    else if (words >= 200) score += 0.1

    return { dimension: "Content Depth", score: Math.min(score, 1.0), maxScore: 1.0, details: details.join(", ") }
}

function scoreAntiPatterns(content: string): DimensionScore {
    const hasSection = /##\s+Anti-?Patterns?\s*\(?NEVER\)?/mi.test(content)
    const dontCount = (content.match(/\*\*(?:Don'?t|DON'?T|NEVER)\*\*/g) ?? []).length

    let score = 0
    const details: string[] = []

    if (hasSection) { score += 0.5; details.push("✓ Anti-Patterns section") }
    else { details.push("✗ missing Anti-Patterns section") }

    if (dontCount >= 5) { score += 0.5; details.push(`✓ ${dontCount} anti-patterns`) }
    else if (dontCount >= 3) { score += 0.3; details.push(`⚠ ${dontCount} anti-patterns (need more)`) }
    else if (dontCount >= 1) { score += 0.1; details.push(`⚠ ${dontCount} anti-pattern(s)`) }
    else { details.push("✗ no anti-patterns found") }

    return { dimension: "Anti-Patterns", score: Math.min(score, 1.0), maxScore: 1.0, details: details.join(", ") }
}

function scoreActionability(content: string): DimensionScore {
    const numberedSteps = (content.match(/^\d+\.\s+/gm) ?? []).length
    const hasExamples = content.includes("```") || content.includes("## Example")
    const hasCommands = (content.match(/\\`[a-z][\w-]+/g) ?? []).length > 0 || content.includes("$ ")

    let score = 0
    const details: string[] = []

    if (numberedSteps >= 5) { score += 0.4; details.push(`✓ ${numberedSteps} steps`) }
    else if (numberedSteps >= 3) { score += 0.3; details.push(`⚠ ${numberedSteps} steps`) }
    else if (numberedSteps >= 1) { score += 0.1; details.push(`⚠ ${numberedSteps} step(s)`) }
    else { details.push("✗ no numbered steps") }

    if (hasExamples) { score += 0.35; details.push("✓ examples") }
    else { details.push("✗ no examples") }

    if (hasCommands) { score += 0.25; details.push("✓ commands") }

    return { dimension: "Actionability", score: Math.min(score, 1.0), maxScore: 1.0, details: details.join(", ") }
}

function scoreStructure(content: string): DimensionScore {
    const h1Count = (content.match(/^# (?!#)/gm) ?? []).length
    const h2Count = (content.match(/^## (?!#)/gm) ?? []).length
    const h3Count = (content.match(/^### (?!#)/gm) ?? []).length
    const hasTables = content.includes("| ")
    const bulletCount = (content.match(/^[-*]\s+/gm) ?? []).length

    let score = 0
    const details: string[] = []

    // Single H1
    if (h1Count === 1) { score += 0.3; details.push("✓ single H1") }
    else if (h1Count === 0) { details.push("✗ missing H1") }
    else { score += 0.1; details.push("⚠ multiple H1s") }

    // H2 sections
    if (h2Count >= 3) { score += 0.3; details.push(`✓ ${h2Count} H2 sections`) }
    else if (h2Count >= 1) { score += 0.15; details.push(`⚠ ${h2Count} H2`) }

    // Depth
    if (h3Count >= 2) { score += 0.2; details.push("✓ H3 depth") }

    // Variety
    if (hasTables) { score += 0.1; details.push("✓ tables") }
    if (bulletCount >= 3) { score += 0.1; details.push("✓ bullets") }

    return { dimension: "Structure", score: Math.min(score, 1.0), maxScore: 1.0, details: details.join(", ") }
}

function scoreSpecificity(content: string): DimensionScore {
    const vagueMatches = content.match(VAGUE_WORDS) ?? []
    const boldCount = (content.match(/\*\*[^*]+\*\*/g) ?? []).length
    const doRules = (content.match(/\*\*DO\*\*:/gi) ?? []).length
    const dontRules = (content.match(/\*\*DON'T\*\*:/gi) ?? []).length

    let score = 0
    const details: string[] = []

    // Penalize vague language
    if (vagueMatches.length === 0) { score += 0.4; details.push("✓ no vague language") }
    else if (vagueMatches.length <= 3) { score += 0.2; details.push(`⚠ ${vagueMatches.length} vague terms`) }
    else { details.push(`✗ ${vagueMatches.length} vague terms`) }

    // Bold emphasis (concrete rules)
    if (boldCount >= 10) { score += 0.3; details.push("✓ well-emphasized") }
    else if (boldCount >= 5) { score += 0.2; details.push("⚠ some emphasis") }

    // DO/DON'T rules (high specificity indicator)
    if (doRules + dontRules >= 5) { score += 0.3; details.push(`✓ ${doRules + dontRules} DO/DON'T rules`) }
    else if (doRules + dontRules >= 2) { score += 0.15 }

    return { dimension: "Specificity", score: Math.min(score, 1.0), maxScore: 1.0, details: details.join(", ") }
}

function scoreContextRelevance(content: string): DimensionScore {
    const omoTerms = ["delegate_task", "omo-cli", "opencode", "agent", "orchestrator", "memory", "skill"]
    const matchCount = omoTerms.filter(term => content.toLowerCase().includes(term)).length

    let score = 0
    const details: string[] = []

    if (matchCount >= 4) { score += 0.6; details.push(`✓ ${matchCount} OMO terms`) }
    else if (matchCount >= 2) { score += 0.4; details.push(`⚠ ${matchCount} OMO terms`) }
    else if (matchCount >= 1) { score += 0.2; details.push(`⚠ ${matchCount} OMO term`) }
    else { score += 0.1; details.push("! generic (no OMO terms)") }

    // Bonus for agent role mentions
    const roles = ["coder", "analyzer", "reviewer", "tester", "architect", "consultant"]
    const roleCount = roles.filter(r => content.toLowerCase().includes(r)).length
    if (roleCount >= 2) { score += 0.4; details.push(`✓ ${roleCount} agent roles`) }
    else if (roleCount >= 1) { score += 0.2; details.push(`⚠ ${roleCount} role`) }

    return { dimension: "Context Relevance", score: Math.min(score, 1.0), maxScore: 1.0, details: details.join(", ") }
}

// ───── Main Scoring ─────

function gradeFromScore(total: number): SkillScore["grade"] {
    if (total >= 5.5) return "A"
    if (total >= 4.5) return "B"
    if (total >= 3.5) return "C"
    if (total >= 2.5) return "D"
    return "F"
}

/**
 * Score a skill's SKILL.md content across 7 dimensions.
 * @param name - Skill name
 * @param content - Full SKILL.md content
 * @param filePath - Path to the SKILL.md file
 * @returns SkillScore with 7 dimensions, total score (0-7), and grade (A-F)
 */
export function scoreSkill(name: string, content: string, filePath: string): SkillScore {
    const dimensions = [
        scoreFrontmatter(content),
        scoreContentDepth(content),
        scoreAntiPatterns(content),
        scoreActionability(content),
        scoreStructure(content),
        scoreSpecificity(content),
        scoreContextRelevance(content),
    ]

    const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0)
    const grade = gradeFromScore(totalScore)

    const issues: string[] = []
    for (const d of dimensions) {
        if (d.score < 0.3) issues.push(`${d.dimension}: ${d.details}`)
    }

    return { name, filePath, dimensions, totalScore, grade, issues }
}

/** Format a skill score into a human-readable summary. */
export function formatScore(score: SkillScore): string {
    const bar = (s: number) => "█".repeat(Math.round(s * 10)).padEnd(10, "░")
    const lines = [
        `📊 ${score.name} — Grade: ${score.grade} (${score.totalScore.toFixed(1)}/7.0)`,
        "",
        ...score.dimensions.map(d =>
            `  ${d.dimension.padEnd(20)} ${bar(d.score)} ${(d.score * 100).toFixed(0)}%  ${d.details}`
        ),
    ]

    if (score.issues.length > 0) {
        lines.push("", "⚠️ Issues:")
        for (const issue of score.issues) {
            lines.push(`  - ${issue}`)
        }
    }

    return lines.join("\n")
}
