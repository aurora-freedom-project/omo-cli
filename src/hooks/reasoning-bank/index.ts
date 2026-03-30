/**
 * ReasoningBank — Trajectory learning from past task executions.
 *
 * Ported from Omni's ReasoningBank. Persists task trajectories (steps,
 * outcome, model, confidence) to SurrealDB and recalls past successes
 * during memory phase to guide future executions.
 *
 * Features:
 * - Stores task trajectories with outcome labels (success/failure/partial)
 * - Boosts retrieval of successful trajectories (1.15× score)
 * - Penalizes failed trajectories (0.85× score)
 * - Used by preflight-skill-injector for outcome-aware memory recall
 *
 * @see OmniUltraAgent_Kit/src/agents/reasoning_bank.rs
 */

import { log } from "../../shared/logger"
import {
    addConcept,
    searchSimilar,
    isConnected,
    type Concept,
    type SimilarConcept,
} from "../../cli/memory/surreal-client"

// ── Types ──────────────────────────────────────────────────────────────────

export interface Trajectory {
    /** Unique ID for the task execution. */
    trajectoryId: string
    /** Project context. */
    project: string
    /** Original task/prompt. */
    task: string
    /** Steps taken (tool calls, decisions). */
    steps: string[]
    /** Final outcome. */
    outcome: "success" | "failure" | "partial" | "pending"
    /** Confidence score (0.0-1.0). */
    confidence: number
    /** Model used. */
    model?: string
    /** Duration in ms. */
    durationMs?: number
}

export interface TrajectoryRecall {
    /** Matching past trajectories. */
    trajectories: SimilarConcept[]
    /** Summary of successful patterns. */
    successPatterns: string | null
    /** Summary of failure patterns to avoid. */
    failurePatterns: string | null
}

// ── State ──────────────────────────────────────────────────────────────────

const activeSessions = new Map<string, {
    task: string
    steps: string[]
    startTime: number
    project: string
}>()

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Start tracking a new task trajectory.
 */
export function startTrajectory(
    sessionID: string,
    task: string,
    project: string,
): void {
    activeSessions.set(sessionID, {
        task,
        steps: [],
        startTime: Date.now(),
        project,
    })
    log("[reasoning-bank] Started trajectory", { sessionID, project })
}

/**
 * Record a step in the current trajectory.
 */
export function recordStep(sessionID: string, step: string): void {
    const session = activeSessions.get(sessionID)
    if (!session) return
    session.steps.push(step)
}

/**
 * Complete and persist a trajectory to SurrealDB.
 */
export async function completeTrajectory(
    sessionID: string,
    outcome: Trajectory["outcome"],
    confidence: number = 0.7,
): Promise<string | null> {
    const session = activeSessions.get(sessionID)
    if (!session) return null

    try {
        if (!(await isConnected())) {
            log("[reasoning-bank] SurrealDB not connected, skipping persist")
            return null
        }

        const durationMs = Date.now() - session.startTime
        const trajectoryId = `traj_${sessionID}_${Date.now()}`

        // Build trajectory summary for embedding
        const summary = [
            `Task: ${session.task}`,
            `Outcome: ${outcome}`,
            `Steps: ${session.steps.length}`,
            `Duration: ${Math.round(durationMs / 1000)}s`,
            `Confidence: ${confidence}`,
            `Steps taken:`,
            ...session.steps.slice(0, 10).map((s, i) => `  ${i + 1}. ${s}`),
        ].join("\n")

        // Persist as a concept with trajectory metadata
        // Note: We store with a dummy embedding since we don't have an embedding model.
        // The BM25 search on tags/content will still work for retrieval.
        const id = await addConcept({
            content: summary,
            tags: ["trajectory", outcome, session.project],
            embedding: [], // Empty — will use BM25 search for recall
            source: "reasoning-bank",
            project: session.project,
            trajectory_id: trajectoryId,
            outcome,
            confidence,
        })

        log("[reasoning-bank] Persisted trajectory", {
            sessionID,
            trajectoryId,
            outcome,
            steps: session.steps.length,
            durationMs,
            conceptId: id,
        })

        activeSessions.delete(sessionID)
        return trajectoryId
    } catch (err) {
        log("[reasoning-bank] Failed to persist trajectory", {
            error: String(err),
            sessionID,
        })
        activeSessions.delete(sessionID)
        return null
    }
}

/**
 * Recall past trajectories relevant to a task.
 * Returns successful and failed patterns for guidance.
 *
 * Note: Uses the outcome-boosted searchSimilar from surreal-client
 * which automatically boosts success (1.15×) and penalizes failure (0.85×).
 */
export async function recallTrajectories(
    _taskEmbedding: number[],
    project: string,
    limit: number = 5,
): Promise<TrajectoryRecall> {
    try {
        if (!(await isConnected())) {
            return { trajectories: [], successPatterns: null, failurePatterns: null }
        }

        // Search for similar past trajectories
        // Note: searchSimilar already applies outcome-based boosting
        const results = await searchSimilar(_taskEmbedding, limit, project)

        // Filter to only trajectory entries
        const trajectories = results.filter(r =>
            r.tags?.includes("trajectory") && r.trajectory_id
        )

        if (trajectories.length === 0) {
            return { trajectories: [], successPatterns: null, failurePatterns: null }
        }

        // Extract patterns
        const successes = trajectories.filter(t => t.outcome === "success")
        const failures = trajectories.filter(t => t.outcome === "failure")

        const successPatterns = successes.length > 0
            ? `Past successful approaches:\n${successes.map(s => `- ${s.content.split("\n")[0]}`).join("\n")}`
            : null

        const failurePatterns = failures.length > 0
            ? `Past failed approaches (avoid these):\n${failures.map(f => `- ${f.content.split("\n")[0]}`).join("\n")}`
            : null

        log("[reasoning-bank] Recalled trajectories", {
            project,
            total: trajectories.length,
            successes: successes.length,
            failures: failures.length,
        })

        return { trajectories, successPatterns, failurePatterns }
    } catch (err) {
        log("[reasoning-bank] Recall failed", { error: String(err) })
        return { trajectories: [], successPatterns: null, failurePatterns: null }
    }
}

/**
 * Create the ReasoningBank hook.
 *
 * Monitors tool calls to build step-by-step trajectories,
 * and persists them on session completion.
 */
export function createReasoningBankHook(project: string) {
    return {
        "chat.message": async (
            input: { sessionID: string },
            output: { message: Record<string, unknown>; parts: Array<{ type: string; text?: string }> }
        ): Promise<void> => {
            // Start trajectory on first user message
            if (output.message.role === "user" && !activeSessions.has(input.sessionID)) {
                const text = output.parts
                    .filter(p => p.type === "text" && p.text)
                    .map(p => p.text!)
                    .join(" ")
                    .slice(0, 500)

                if (text.length > 20) {
                    startTrajectory(input.sessionID, text, project)
                }
            }
        },

        "tool.execute.after": async (
            input: { sessionID: string; tool: string; args: Record<string, unknown> },
            _output: { result?: string; output?: string }
        ): Promise<void> => {
            // Record each tool call as a step
            const argsPreview = JSON.stringify(input.args).slice(0, 100)
            recordStep(input.sessionID, `${input.tool}(${argsPreview})`)
        },

        "event": async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
            const props = event.properties as Record<string, unknown> | undefined

            if (event.type === "session.deleted") {
                const sessionInfo = props?.info as { id?: string } | undefined
                if (sessionInfo?.id && activeSessions.has(sessionInfo.id)) {
                    // Auto-complete with "partial" outcome on session end
                    await completeTrajectory(sessionInfo.id, "partial", 0.5)
                }
            }
        },
    }
}
