/**
 * Auto-Generated Skills — GitNexus-inspired repo-specific skill generation.
 *
 * Learned from GitNexus: repos are deeply different. Generic skills miss project-specific
 * patterns, conventions, and gotchas. This module analyzes a project's code graph
 * (from SurrealDB code_element table) and generates project-specific skill files
 * that capture the codebase's unique architecture.
 *
 * Generated skills include:
 * - Architecture summaries (component layout, dependency flow)
 * - Naming convention guides
 * - Common code patterns (frequently used together)
 * - Anti-patterns (common bugs found in the project's history)
 *
 * These skills are generated as standard SKILL.md files and stored in the
 * project's `.agent/skills/` directory for auto-discovery by the skill search system.
 *
 * @see Phase 6.3 of omo-cli v4.0+ upgrade blueprint
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export interface CodeElement {
    name: string
    kind: string  // function, class, method, struct, enum, etc.
    file: string
    signature?: string
    docstring?: string
}

export interface DependencyInfo {
    source: string  // file that imports
    target: string  // file being imported
}

export interface ProjectProfile {
    /** Project name. */
    name: string
    /** Primary programming language(s). */
    languages: string[]
    /** Total files analyzed. */
    fileCount: number
    /** Total code elements indexed. */
    elementCount: number
    /** Top-level directories (components). */
    components: string[]
    /** File extension distribution. */
    extensionDistribution: Record<string, number>
    /** Most common element kinds. */
    kindDistribution: Record<string, number>
    /** Naming patterns detected. */
    namingPatterns: NamingPattern[]
    /** Frequently co-occurring elements (clusters). */
    coClusters: CoCluster[]
}

export interface NamingPattern {
    /** Pattern type: prefix, suffix, case_style. */
    type: "prefix" | "suffix" | "case_style"
    /** The detected pattern. */
    pattern: string
    /** How many elements match this pattern. */
    count: number
    /** Example element names. */
    examples: string[]
}

export interface CoCluster {
    /** Elements that frequently appear in the same file. */
    elements: string[]
    /** Files where this cluster appears. */
    files: string[]
    /** Description of the pattern. */
    description: string
}

export interface GeneratedSkill {
    /** Skill file name (e.g., "architecture-overview.md"). */
    filename: string
    /** SKILL.md content. */
    content: string
    /** Skill category. */
    category: "architecture" | "conventions" | "patterns" | "anti-patterns"
}

// ── Analysis (pure functions) ──────────────────────────────────────────────

/**
 * Detect top-level components from file paths.
 */
export function detectComponents(files: string[]): string[] {
    const topDirs = new Map<string, number>()

    for (const file of files) {
        // Get first path segment after root
        const parts = file.replace(/^\.?\//, "").split("/")
        if (parts.length >= 2) {
            const dir = parts[0]
            topDirs.set(dir, (topDirs.get(dir) ?? 0) + 1)
        }
    }

    return [...topDirs.entries()]
        .filter(([_, count]) => count >= 2) // at least 2 files
        .sort((a, b) => b[1] - a[1])
        .map(([dir]) => dir)
        .slice(0, 15)
}

/**
 * Detect naming patterns from code elements.
 */
export function detectNamingPatterns(elements: CodeElement[]): NamingPattern[] {
    const patterns: NamingPattern[] = []
    const prefixes = new Map<string, string[]>()
    const suffixes = new Map<string, string[]>()

    for (const el of elements) {
        const name = el.name

        // Detect prefixes (first meaningful word)
        const camelParts = name.split(/(?=[A-Z])|[-_]/).filter(Boolean)
        if (camelParts.length >= 2) {
            const prefix = camelParts[0].toLowerCase()
            if (prefix.length >= 2) {
                if (!prefixes.has(prefix)) prefixes.set(prefix, [])
                prefixes.get(prefix)!.push(name)
            }

            // Detect suffixes
            const suffix = camelParts[camelParts.length - 1].toLowerCase()
            if (suffix.length >= 2) {
                if (!suffixes.has(suffix)) suffixes.set(suffix, [])
                suffixes.get(suffix)!.push(name)
            }
        }
    }

    // Only keep patterns with 3+ occurrences
    for (const [prefix, names] of prefixes) {
        if (names.length >= 3) {
            patterns.push({
                type: "prefix",
                pattern: prefix,
                count: names.length,
                examples: names.slice(0, 3),
            })
        }
    }

    for (const [suffix, names] of suffixes) {
        if (names.length >= 3) {
            patterns.push({
                type: "suffix",
                pattern: suffix,
                count: names.length,
                examples: names.slice(0, 3),
            })
        }
    }

    return patterns.sort((a, b) => b.count - a.count).slice(0, 10)
}

/**
 * Detect elements that co-occur in the same file (clusters).
 */
export function detectCoClusters(elements: CodeElement[]): CoCluster[] {
    // Group elements by file
    const fileElements = new Map<string, string[]>()
    for (const el of elements) {
        if (!fileElements.has(el.file)) fileElements.set(el.file, [])
        fileElements.get(el.file)!.push(el.name)
    }

    // Find pairs of element kinds that co-occur frequently
    const kindPairs = new Map<string, { count: number; files: string[] }>()
    for (const [file, names] of fileElements) {
        if (names.length >= 2 && names.length <= 10) {
            // Use sorted pair key for dedup
            const sortedNames = [...names].sort()
            const key = sortedNames.join("+")
            if (!kindPairs.has(key)) kindPairs.set(key, { count: 0, files: [] })
            kindPairs.get(key)!.count++
            kindPairs.get(key)!.files.push(file)
        }
    }

    return [...kindPairs.entries()]
        .filter(([_, v]) => v.count >= 2)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([key, value]) => ({
            elements: key.split("+"),
            files: value.files.slice(0, 3),
            description: `Co-occurring pattern in ${value.count} files`,
        }))
}

/**
 * Build a project profile from code elements.
 */
export function buildProjectProfile(
    projectName: string,
    elements: CodeElement[],
    dependencies?: DependencyInfo[],
): ProjectProfile {
    const files = [...new Set(elements.map(e => e.file))]
    const components = detectComponents(files)
    const namingPatterns = detectNamingPatterns(elements)
    const coClusters = detectCoClusters(elements)

    // Extension distribution
    const extDist: Record<string, number> = {}
    for (const file of files) {
        const ext = file.split(".").pop() || "unknown"
        extDist[ext] = (extDist[ext] ?? 0) + 1
    }

    // Kind distribution
    const kindDist: Record<string, number> = {}
    for (const el of elements) {
        kindDist[el.kind] = (kindDist[el.kind] ?? 0) + 1
    }

    // Detect primary languages from extensions
    const langMap: Record<string, string> = {
        ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
        py: "Python", rs: "Rust", go: "Go", java: "Java", rb: "Ruby",
        c: "C", cpp: "C++", cs: "C#", swift: "Swift", kt: "Kotlin",
    }
    const languages = [...new Set(
        Object.entries(extDist)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([ext]) => langMap[ext])
            .filter(Boolean)
    )]

    return {
        name: projectName,
        languages,
        fileCount: files.length,
        elementCount: elements.length,
        components,
        extensionDistribution: extDist,
        kindDistribution: kindDist,
        namingPatterns,
        coClusters,
    }
}

// ── Skill Generation (pure functions) ──────────────────────────────────────

/**
 * Generate a SKILL.md architecture overview from a project profile.
 */
export function generateArchitectureSkill(profile: ProjectProfile): GeneratedSkill {
    const componentList = profile.components.length > 0
        ? profile.components.map(c => `- \`${c}/\``).join("\n")
        : "- *(no clear component structure detected)*"

    const content = `---
name: ${profile.name}-architecture
description: Auto-generated architecture overview for ${profile.name}
---

# ${profile.name} Architecture Overview

> ⚡ Auto-generated by omo-cli's skill generator from code analysis.

## Project Summary

- **Primary Language(s)**: ${profile.languages.join(", ") || "Unknown"}
- **Files**: ${profile.fileCount}
- **Code Elements**: ${profile.elementCount}

## Component Layout

${componentList}

## Element Distribution

| Kind | Count |
|------|-------|
${Object.entries(profile.kindDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([kind, count]) => `| ${kind} | ${count} |`)
    .join("\n")}

## File Types

${Object.entries(profile.extensionDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([ext, count]) => `- \`.${ext}\`: ${count} files`)
    .join("\n")}
`

    return {
        filename: `${profile.name}-architecture.md`,
        content,
        category: "architecture",
    }
}

/**
 * Generate a SKILL.md naming conventions guide.
 */
export function generateConventionsSkill(profile: ProjectProfile): GeneratedSkill | null {
    if (profile.namingPatterns.length === 0) return null

    const patternSections = profile.namingPatterns
        .slice(0, 8)
        .map(p => {
            const examples = p.examples.map(e => `\`${e}\``).join(", ")
            return `### ${p.type === "prefix" ? "Prefix" : "Suffix"}: \`${p.pattern}\` (${p.count} uses)\nExamples: ${examples}`
        })
        .join("\n\n")

    const content = `---
name: ${profile.name}-conventions
description: Auto-generated naming conventions for ${profile.name}
---

# ${profile.name} Naming Conventions

> ⚡ Auto-generated from code analysis. Follow these patterns when adding new code.

## Detected Patterns

${patternSections}

## Anti-Patterns

- Do NOT introduce new naming patterns that conflict with the detected ones above.
- If creating a new function with the same role, follow the existing prefix/suffix convention.
`

    return {
        filename: `${profile.name}-conventions.md`,
        content,
        category: "conventions",
    }
}

/**
 * Generate all skills for a project profile.
 */
export function generateSkills(profile: ProjectProfile): GeneratedSkill[] {
    const skills: GeneratedSkill[] = []

    skills.push(generateArchitectureSkill(profile))

    const conventions = generateConventionsSkill(profile)
    if (conventions) skills.push(conventions)

    log("[auto-skill-gen] Generated skills", {
        project: profile.name,
        skillCount: skills.length,
        categories: skills.map(s => s.category),
    })

    return skills
}
