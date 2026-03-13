/**
 * Pipeline Task — Multi-stage DAG execution tool.
 *
 * Feature #17 from the 27-feature integration plan.
 * Inspired by ruflo's Stream-Chain pipelines.
 *
 * Enables declarative multi-stage agent pipelines:
 *   analyst → architect → coder → tester → reviewer
 *
 * Each stage runs sequentially. Output of stage N is injected as context for stage N+1.
 * Uses the existing delegate_task infrastructure for each individual stage.
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../../features/background-agent"
import type { OpencodeClient } from "../delegate-task/helpers"
import { log } from "../../shared"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PipelineStage {
    /** Agent category to use (e.g., "consultant", "architect", "worker", "reviewer") */
    agent: string
    /** Task description for this stage */
    task: string
    /** Optional: key to store output as (default: stage index) */
    outputKey?: string
}

export interface PipelineConfig {
    /** Pipeline name for logging/tracking */
    name: string
    /** Ordered list of stages */
    stages: PipelineStage[]
}

export interface PipelineStageResult {
    stage: number
    agent: string
    status: "completed" | "failed" | "skipped"
    output: string
    durationMs: number
}

export interface PipelineResult {
    name: string
    totalStages: number
    completedStages: number
    results: PipelineStageResult[]
    totalDurationMs: number
}

// ─── Executor ───────────────────────────────────────────────────────────────

/** Format previous stage outputs as context for the next stage. */
function formatPreviousContext(results: PipelineStageResult[]): string {
    if (results.length === 0) return ""

    const ctx = results
        .filter(r => r.status === "completed")
        .map(r => `## Stage ${r.stage} (${r.agent}) Output:\n${r.output}`)
        .join("\n\n---\n\n")

    return `\n\n<previous-stages>\n${ctx}\n</previous-stages>`
}

/** Execute a pipeline by running stages sequentially via session.create. */
export async function executePipeline(
    config: PipelineConfig,
    client: OpencodeClient,
    directory: string,
    manager: BackgroundManager,
): Promise<PipelineResult> {
    const startTime = Date.now()
    const results: PipelineStageResult[] = []

    log(`[pipeline] Starting pipeline: ${config.name} with ${config.stages.length} stages`)

    for (let i = 0; i < config.stages.length; i++) {
        const stage = config.stages[i]
        const stageStart = Date.now()

        log(`[pipeline] Stage ${i + 1}/${config.stages.length}: ${stage.agent} — ${stage.task.slice(0, 80)}`)

        try {
            // Build task with previous context
            const previousContext = formatPreviousContext(results)
            const fullTask = `${stage.task}${previousContext}`

            // Create session for this stage
            const sessionResp = await client.session.create({
                path: directory,
                prompt: fullTask,
            } as Record<string, unknown>)
            const sessionId = ((sessionResp as unknown as { data?: { id?: string } })?.data?.id)
                ?? ((sessionResp as unknown as { id?: string })?.id)
                ?? ""

            if (!sessionId) {
                throw new Error("Failed to create session — no ID returned")
            }

            // Wait for completion (simplified — uses the session.messages API)
            let output = ""
            const maxWaitMs = 300_000 // 5 min per stage max
            const pollInterval = 3_000

            let elapsed = 0
            while (elapsed < maxWaitMs) {
                await new Promise(r => setTimeout(r, pollInterval))
                elapsed += pollInterval

                try {
                    const messagesResp = await client.session.messages({ path: { id: sessionId } })
                    const messagesData = ((messagesResp as unknown as { data?: unknown[] })?.data) as
                        Array<{ info?: { role?: string }; parts?: Array<{ content?: string }> }> | undefined

                    if (messagesData) {
                        const lastAssistant = messagesData
                            .filter(m => m.info?.role === "assistant")
                            .pop()
                        if (lastAssistant?.parts?.[0]?.content) {
                            output = lastAssistant.parts[0].content
                        }
                    }

                    // Check if session is done
                    const infoResp = await client.session.get({ path: { id: sessionId } })
                    const status = ((infoResp as unknown as { data?: { status?: string } })?.data?.status)
                        ?? ((infoResp as unknown as { status?: string })?.status)
                    if (status === "completed" || status === "idle") {
                        break
                    }
                } catch {
                    // Session might not be ready yet
                }
            }

            results.push({
                stage: i + 1,
                agent: stage.agent,
                status: output ? "completed" : "failed",
                output: output || "(no output)",
                durationMs: Date.now() - stageStart,
            })
        } catch (err) {
            log(`[pipeline] Stage ${i + 1} failed: ${err}`)
            results.push({
                stage: i + 1,
                agent: stage.agent,
                status: "failed",
                output: `Error: ${err instanceof Error ? err.message : String(err)}`,
                durationMs: Date.now() - stageStart,
            })
            // Don't continue pipeline on failure
            break
        }
    }

    return {
        name: config.name,
        totalStages: config.stages.length,
        completedStages: results.filter(r => r.status === "completed").length,
        results,
        totalDurationMs: Date.now() - startTime,
    }
}

// ─── Tool Definition ────────────────────────────────────────────────────────

export function createPipelineTask(options: {
    client: OpencodeClient
    directory: string
    manager: BackgroundManager
}): ToolDefinition {
    return tool({
        description: `Execute a multi-stage agent pipeline. Each stage runs sequentially, with output from stage N passed as context to stage N+1.

Example: { "name": "feature-implementation", "stages": [
  { "agent": "consultant", "task": "Analyze requirements" },
  { "agent": "architect", "task": "Design the architecture" },
  { "agent": "worker", "task": "Implement the code" },
  { "agent": "reviewer", "task": "Review the implementation" }
]}

Use this when a task requires multiple specialist agents in sequence.
For single-agent tasks, use delegate_task instead.`,
        args: {
            name: tool.schema.string().describe("Pipeline name for tracking"),
            stages: tool.schema.array(
                tool.schema.object({
                    agent: tool.schema.string().describe("Agent category (consultant, architect, worker, reviewer, etc.)"),
                    task: tool.schema.string().describe("Task description for this stage"),
                })
            ).describe("Ordered list of pipeline stages"),
        },
        async execute(args: { name: string; stages: Array<{ agent: string; task: string }> }) {
            const config: PipelineConfig = { name: args.name, stages: args.stages }
            const result = await executePipeline(config, options.client, options.directory, options.manager)

            const summary = result.results
                .map(r => `Stage ${r.stage} (${r.agent}): ${r.status} [${(r.durationMs / 1000).toFixed(1)}s]`)
                .join("\n")

            const lastOutput = result.results
                .filter(r => r.status === "completed")
                .pop()?.output ?? "(no completed stages)"

            return `Pipeline "${result.name}" — ${result.completedStages}/${result.totalStages} stages completed in ${(result.totalDurationMs / 1000).toFixed(1)}s

${summary}

--- Final Output ---
${lastOutput}`
        },
    })
}

