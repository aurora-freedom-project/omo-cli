/**
 * Anti-Pattern Extractor — Extracts ## Anti-Patterns from skills and injects
 * as negative guidance alongside the skill content.
 *
 * Ported from Omni's anti_pattern module. When a skill is loaded, if it has
 * an `## Anti-Patterns` section, that section is extracted and prepended as
 * a strong negative constraint: "Do NOT do the following: ..."
 *
 * Also handles Reference Skills: if a skill directory has a `reference/`
 * subdirectory, auto-loads the best-matching file by keyword overlap.
 *
 * @see OmniUltraAgent_Kit/src/agents/anti_pattern.rs
 * @see OmniUltraAgent_Kit/src/agents/reference_skill.rs
 */

import { log } from "../../shared/logger"

const ANTI_PATTERN_HEADER = /^##\s+Anti[- ]?Patterns?\b/im
const REFERENCE_DIR_PATTERN = /^##\s+References?\b/im

/**
 * Extract the Anti-Patterns section from a skill's SKILL.md content.
 *
 * Returns the content between `## Anti-Patterns` and the next `##` heading
 * (or end of file). Returns null if no anti-patterns section found.
 */
export function extractAntiPatterns(skillContent: string): string | null {
    const match = skillContent.match(ANTI_PATTERN_HEADER)
    if (!match || match.index === undefined) return null

    const startIdx = match.index + match[0].length
    const rest = skillContent.slice(startIdx)

    // Find next ## heading or end of content
    const nextHeading = rest.search(/^##\s+/m)
    const section = nextHeading >= 0 ? rest.slice(0, nextHeading) : rest

    const trimmed = section.trim()
    if (trimmed.length < 10) return null // too short to be useful

    return trimmed
}

/**
 * Format extracted anti-patterns as a negative guidance block.
 * This is injected BEFORE the skill content so the LLM sees constraints first.
 */
export function formatAntiPatternGuidance(antiPatterns: string, skillName: string): string {
    return `<anti_patterns skill="${skillName}">
⚠️ IMPORTANT: The following patterns have been identified as ANTI-PATTERNS for this task.
Do NOT follow these approaches:

${antiPatterns}
</anti_patterns>`
}

/**
 * Process skill content to extract and prepend anti-pattern guidance.
 * Returns the skill content with anti-pattern guidance prepended, or
 * the original content if no anti-patterns section found.
 */
export function processSkillWithAntiPatterns(
    skillContent: string,
    skillName: string,
): { content: string; hasAntiPatterns: boolean } {
    const antiPatterns = extractAntiPatterns(skillContent)

    if (!antiPatterns) {
        return { content: skillContent, hasAntiPatterns: false }
    }

    const guidance = formatAntiPatternGuidance(antiPatterns, skillName)

    log("[anti-pattern] Extracted anti-patterns", {
        skill: skillName,
        antiPatternLength: antiPatterns.length,
    })

    return {
        content: `${guidance}\n\n${skillContent}`,
        hasAntiPatterns: true,
    }
}

/**
 * Extract the References section from a skill content.
 * Returns file paths or content references mentioned in the section.
 */
export function extractReferenceHints(skillContent: string): string[] {
    const match = skillContent.match(REFERENCE_DIR_PATTERN)
    if (!match || match.index === undefined) return []

    const startIdx = match.index + match[0].length
    const rest = skillContent.slice(startIdx)
    const nextHeading = rest.search(/^##\s+/m)
    const section = nextHeading >= 0 ? rest.slice(0, nextHeading) : rest

    // Extract file references (markdown links or backtick-enclosed paths)
    const fileRefs: string[] = []
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g
    let linkMatch: RegExpExecArray | null
    while ((linkMatch = linkPattern.exec(section)) !== null) {
        fileRefs.push(linkMatch[2])
    }

    const codePattern = /`([^`]+\.(?:md|ts|rs|py|go|yaml|json))`/g
    let codeMatch: RegExpExecArray | null
    while ((codeMatch = codePattern.exec(section)) !== null) {
        fileRefs.push(codeMatch[1])
    }

    return fileRefs
}

/**
 * Find the best matching reference file from a list of candidates
 * based on keyword overlap with the user's task.
 */
export function findBestReference(
    taskKeywords: string[],
    candidateFiles: string[],
): string | null {
    if (candidateFiles.length === 0 || taskKeywords.length === 0) return null

    let bestFile: string | null = null
    let bestScore = 0

    for (const file of candidateFiles) {
        const fileName = file.toLowerCase().replace(/[^a-z0-9]/g, " ")
        let score = 0
        for (const kw of taskKeywords) {
            if (fileName.includes(kw.toLowerCase())) score++
        }
        if (score > bestScore) {
            bestScore = score
            bestFile = file
        }
    }

    return bestScore > 0 ? bestFile : null
}
