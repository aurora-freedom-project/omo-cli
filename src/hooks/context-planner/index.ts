/**
 * Context Planner — Orchestrates context injection based on task analysis.
 *
 * The Context Planner is the central intelligence coordinator that:
 * 1. Uses QueryPreprocessor to analyze the user's prompt
 * 2. Decides which context sources to activate (skills, RAG, trajectories)
 * 3. Manages the context budget across all injection hooks
 * 4. Provides routing hints to other hooks (skip RAG for trivial tasks, etc.)
 *
 * This is the "brain" of the intelligence pipeline, ensuring hooks work
 * together efficiently without overwhelming the context window.
 *
 * @see OmniUltraAgent_Kit/src/agents/budget_gate.rs
 */

import { log } from "../../shared/logger"
import {
    preprocessQuery,
    type QueryMetadata,
    type TaskType,
} from "../query-preprocessor/index"

// ── Types ──────────────────────────────────────────────────────────────────

export type ContextPressure = "low" | "medium" | "high" | "critical"

export interface ContextPlan {
    /** Analyzed query metadata. */
    query: QueryMetadata
    /** Overall context pressure level. */
    pressure: ContextPressure
    /** Whether to activate skill injection. */
    injectSkills: boolean
    /** Whether to activate RAG enrichment. */
    injectRag: boolean
    /** Whether to recall past trajectories. */
    recallTrajectories: boolean
    /** Whether to activate anti-pattern extraction. */
    extractAntiPatterns: boolean
    /** Whether to activate stream-chain capture. */
    enableStreamChain: boolean
    /** Maximum tokens allocated for context injection. */
    maxContextTokens: number
    /** Routing hints for the agent. */
    hints: string[]
}

// ── Budget Configuration ───────────────────────────────────────────────────

/** Default context window size (tokens) for budget calculation. */
const DEFAULT_CONTEXT_WINDOW = 128_000

/** Maximum percentage of context window to use for injections. */
const MAX_INJECTION_RATIO = 0.25

/** Token budgets per pressure level (as ratio of context window). */
const PRESSURE_BUDGETS: Record<ContextPressure, number> = {
    low: 0.25,       // 25% — inject everything
    medium: 0.15,    // 15% — skills + RAG only
    high: 0.08,      // 8% — skills only, minimal
    critical: 0.03,  // 3% — emergency, skip most injections
}

// ── Intelligence Routing ───────────────────────────────────────────────────

/** Maps task types to which intelligence features to activate. */
const TASK_ROUTING: Record<TaskType, Partial<Pick<ContextPlan,
    "injectSkills" | "injectRag" | "recallTrajectories" | "extractAntiPatterns" | "enableStreamChain"
>>> = {
    code:     { injectSkills: true, injectRag: true, recallTrajectories: true, extractAntiPatterns: true, enableStreamChain: true },
    debug:    { injectSkills: true, injectRag: true, recallTrajectories: true, extractAntiPatterns: true, enableStreamChain: false },
    test:     { injectSkills: true, injectRag: true, recallTrajectories: false, extractAntiPatterns: true, enableStreamChain: false },
    refactor: { injectSkills: true, injectRag: true, recallTrajectories: true, extractAntiPatterns: true, enableStreamChain: false },
    analysis: { injectSkills: true, injectRag: true, recallTrajectories: false, extractAntiPatterns: false, enableStreamChain: false },
    design:   { injectSkills: true, injectRag: false, recallTrajectories: true, extractAntiPatterns: false, enableStreamChain: true },
    deploy:   { injectSkills: true, injectRag: false, recallTrajectories: true, extractAntiPatterns: false, enableStreamChain: true },
    research: { injectSkills: false, injectRag: false, recallTrajectories: false, extractAntiPatterns: false, enableStreamChain: false },
    general:  { injectSkills: true, injectRag: false, recallTrajectories: false, extractAntiPatterns: false, enableStreamChain: false },
}

// ── Planner ────────────────────────────────────────────────────────────────

/**
 * Create a context plan based on the user's prompt.
 *
 * Analyzes the prompt via QueryPreprocessor, determines context pressure,
 * and decides which intelligence features to activate.
 */
export function createContextPlan(
    promptText: string,
    options?: {
        contextWindow?: number
        currentUsageTokens?: number
        sessionToolCalls?: number
    },
): ContextPlan {
    const query = preprocessQuery(promptText)

    // Calculate context pressure
    const contextWindow = options?.contextWindow ?? DEFAULT_CONTEXT_WINDOW
    const currentUsage = options?.currentUsageTokens ?? 0
    const usageRatio = currentUsage / contextWindow

    const pressure: ContextPressure =
        usageRatio > 0.75 ? "critical"
        : usageRatio > 0.50 ? "high"
        : usageRatio > 0.30 ? "medium"
        : "low"

    // Get routing for this task type
    const routing = TASK_ROUTING[query.taskType] ?? TASK_ROUTING.general

    // Apply pressure-based gating
    const maxContextTokens = Math.floor(contextWindow * PRESSURE_BUDGETS[pressure])

    // At high+ pressure, aggressively cut features
    const injectSkills = routing.injectSkills !== false && pressure !== "critical"
    const injectRag = routing.injectRag !== false && pressure !== "critical" && pressure !== "high"
    const recallTrajectories = routing.recallTrajectories !== false && pressure !== "critical" && pressure !== "high"
    const extractAntiPatterns = routing.extractAntiPatterns !== false && pressure !== "critical"
    const enableStreamChain = routing.enableStreamChain !== false

    // Build routing hints
    const hints: string[] = []
    if (query.complexity === "trivial") hints.push("Trivial task — quick response preferred")
    if (query.urgency === "high") hints.push("High urgency — prioritize speed over completeness")
    if (query.languages.length > 0) hints.push(`Languages: ${query.languages.join(", ")}`)
    if (query.filePaths.length > 0) hints.push(`Referenced files: ${query.filePaths.join(", ")}`)
    if (pressure === "high" || pressure === "critical") {
        hints.push(`Context pressure: ${pressure} — reducing injections`)
    }

    const plan: ContextPlan = {
        query,
        pressure,
        injectSkills,
        injectRag,
        recallTrajectories,
        extractAntiPatterns,
        enableStreamChain,
        maxContextTokens,
        hints,
    }

    log("[context-planner] Created plan", {
        taskType: query.taskType,
        pressure,
        injectSkills,
        injectRag,
        recallTrajectories,
        maxContextTokens,
    })

    return plan
}

/**
 * Format routing hints as a system context block for the agent.
 */
export function formatPlanHints(plan: ContextPlan): string | null {
    if (plan.hints.length === 0) return null

    return `<context_plan>
Task type: ${plan.query.taskType}
Complexity: ${plan.query.complexity}
Context pressure: ${plan.pressure}
${plan.hints.map(h => `• ${h}`).join("\n")}
</context_plan>`
}
