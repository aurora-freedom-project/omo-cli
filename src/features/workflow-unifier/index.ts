/**
 * WORKFLOW.md Unification — Discover and merge workflow definitions.
 *
 * Feature #21 from the 27-feature integration plan.
 * Inspired by Symphony's unified workflow management.
 *
 * Provides:
 *  - Discovery of WORKFLOW.md files from .agent/workflows/, project root, etc.
 *  - Parsing workflow steps with phase tags
 *  - Unified registry for all project workflows
 *
 * Integrates with the existing /bmad workflow as the primary workflow entry point.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import { log } from "../../shared"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorkflowStep {
    readonly index: number
    readonly description: string
    readonly phase?: string      // e.g., "planning", "execution", "verification"
    readonly turbo?: boolean     // auto-run without user approval
}

export interface Workflow {
    readonly name: string
    readonly description: string
    readonly source: string      // file path
    readonly steps: WorkflowStep[]
}

// ─── Discovery ──────────────────────────────────────────────────────────────

const WORKFLOW_DIRS = [
    ".agent/workflows",
    ".agents/workflows",
    "_agent/workflows",
    "_agents/workflows",
]

/** Discover all workflow files in a project directory. */
export function discoverWorkflows(projectDir: string): Workflow[] {
    const workflows: Workflow[] = []

    for (const relDir of WORKFLOW_DIRS) {
        const dir = path.join(projectDir, relDir)
        if (!fs.existsSync(dir)) continue

        try {
            const files = fs.readdirSync(dir)
                .filter(f => f.endsWith(".md"))
                .map(f => path.join(dir, f))

            for (const file of files) {
                try {
                    const content = fs.readFileSync(file, "utf-8")
                    const wf = parseWorkflow(file, content)
                    if (wf) workflows.push(wf)
                } catch {
                    log(`[workflow] Failed to parse ${file}`)
                }
            }
        } catch {
            // Directory read error — skip
        }
    }

    // Also check for WORKFLOW.md in project root
    const rootWorkflow = path.join(projectDir, "WORKFLOW.md")
    if (fs.existsSync(rootWorkflow)) {
        try {
            const content = fs.readFileSync(rootWorkflow, "utf-8")
            const wf = parseWorkflow(rootWorkflow, content)
            if (wf) workflows.push(wf)
        } catch {
            // Ignore parse errors
        }
    }

    log(`[workflow] Discovered ${workflows.length} workflows`)
    return workflows
}

/** Parse a workflow file into a structured Workflow. */
export function parseWorkflow(filePath: string, content: string): Workflow | undefined {
    // Extract YAML frontmatter
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
    const frontmatter = fmMatch ? fmMatch[1] : ""

    const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
    const description = descMatch?.[1]?.trim() ?? ""

    const name = path.basename(filePath, ".md")

    // Parse numbered steps
    const stepRegex = /^(\d+)\.\s+(.+)$/gm
    const turboRegex = /\/\/\s*turbo\b/
    const phaseRegex = /\[(\w+)\]/

    const lines = content.split("\n")
    const steps: WorkflowStep[] = []

    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^(\d+)\.\s+(.+)$/)
        if (match) {
            const index = parseInt(match[1], 10)
            const desc = match[2].trim()

            // Check for // turbo annotation on previous line
            const turbo = i > 0 && turboRegex.test(lines[i - 1])

            // Check for [phase] tag in description
            const phaseMatch = desc.match(phaseRegex)
            const phase = phaseMatch?.[1]

            steps.push({ index, description: desc, phase, turbo })
        }
    }

    if (steps.length === 0 && !description) return undefined

    return { name, description, source: filePath, steps }
}

/** Format discovered workflows as a summary string. */
export function formatWorkflowSummary(workflows: Workflow[]): string {
    if (workflows.length === 0) return "(no workflows discovered)"

    return workflows.map(wf =>
        `📋 ${wf.name}: ${wf.description || "(no description)"} — ${wf.steps.length} steps [${wf.source}]`
    ).join("\n")
}
