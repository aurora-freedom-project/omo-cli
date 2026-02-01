/**
 * Coding Level Utilities
 * Inspired by ClaudeKit's coding level system.
 * 
 * Provides verbosity guidelines based on coding level (1-10).
 */

import type { CodingLevel } from "../config"

export type CodingLevelStyle = "terse" | "standard" | "educational"

export interface CodingLevelGuidelines {
    style: CodingLevelStyle
    description: string
    promptSection: string
}

/**
 * Get the coding level style based on the numeric level.
 */
export function getCodingLevelStyle(level: CodingLevel): CodingLevelStyle {
    if (level <= 3) return "terse"
    if (level <= 6) return "standard"
    return "educational"
}

/**
 * Get the coding level guidelines based on the numeric level.
 */
export function getCodingLevelGuidelines(level: CodingLevel): CodingLevelGuidelines {
    const style = getCodingLevelStyle(level)

    switch (style) {
        case "terse":
            return {
                style,
                description: "Minimal explanation, code-only responses",
                promptSection: `<Verbosity level="${level}" style="terse">
You are in TERSE mode. Be extremely concise:
- Provide code-only responses when possible
- Skip explanations unless explicitly asked
- Use one-word answers when appropriate
- No educational context
</Verbosity>`,
            }
        case "standard":
            return {
                style,
                description: "Balanced explanation with essential context",
                promptSection: `<Verbosity level="${level}" style="standard">
You are in STANDARD mode. Balance brevity with clarity:
- Include essential explanations
- Explain non-obvious decisions briefly
- Skip exhaustive details
- Focus on actionable information
</Verbosity>`,
            }
        case "educational":
            return {
                style,
                description: "Detailed rationale with teaching context",
                promptSection: `<Verbosity level="${level}" style="educational">
You are in EDUCATIONAL mode. Provide rich context:
- Explain reasoning and trade-offs
- Include alternatives considered
- Teach best practices and patterns
- Provide background context when relevant
- Help the user learn, not just execute
</Verbosity>`,
            }
    }
}

/**
 * Build the coding level section for agent prompts.
 * Returns empty string if no coding level is configured.
 */
export function buildCodingLevelSection(level: CodingLevel | undefined): string {
    if (level === undefined) return ""

    const guidelines = getCodingLevelGuidelines(level)
    return `
${guidelines.promptSection}
`
}
