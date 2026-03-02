/**
 * @module delegate-task/session-resume
 *
 * Session resumption logic for continuing existing delegate task sessions.
 * Handles both background and synchronous resume flows.
 */

import type { BackgroundManager } from "../../features/background-agent"
import type { DelegateTaskArgs } from "./types"
import { Effect } from "effect"
import {
    type OpencodeClient,
    type ToolContextWithMetadata,
    formatDetailedError,
    formatDuration,
} from "./helpers"
import { pollForSessionCompletion, fetchLastAssistantMessage } from "./session-poller"
import { getTimingConfig } from "./timing"
import { getTaskToastManager } from "../../features/task-toast-manager"
import { findNearestMessageWithFields } from "../../features/hook-message-injector"
import { getAgentToolRestrictions } from "../../shared"
import { getMessageDir } from "../../shared/session-utils"

/** Context needed for resuming a session. */
export interface ResumeContext {
    args: DelegateTaskArgs
    ctx: ToolContextWithMetadata
    client: OpencodeClient
    manager: BackgroundManager
    parentModel?: { providerID: string; modelID: string; variant?: string }
    parentAgent?: string
}

/**
 * Resume a session in background mode.
 *
 * Calls manager.resume() and returns immediately with task tracking info.
 */
export async function resumeBackgroundSession(context: ResumeContext): Promise<string> {
    const { args, ctx, manager, parentModel, parentAgent } = context

    try {
        const task = await manager.resume({
            sessionId: args.session_id!,
            prompt: args.prompt,
            parentSessionID: ctx.sessionID,
            parentMessageID: ctx.messageID,
            parentModel,
            parentAgent,
        })

        ctx.metadata?.({
            title: `Continue: ${task.description}`,
            metadata: {
                prompt: args.prompt,
                agent: task.agent,
                load_skills: args.load_skills,
                description: args.description,
                run_in_background: args.run_in_background,
                sessionId: task.sessionID,
                command: args.command,
            },
        })

        return `Background task continued.

Task ID: ${task.id}
Session ID: ${task.sessionID}
Description: ${task.description}
Agent: ${task.agent}
Status: ${task.status}

Agent continues with full previous context preserved.
Use \`background_output\` with task_id="${task.id}" to check progress.`
    } catch (error) {
        return formatDetailedError(error, {
            operation: "Continue background task",
            args,
            sessionID: args.session_id,
        })
    }
}

/**
 * Resume a session in synchronous mode.
 *
 * Sends a continuation prompt, polls for completion, and returns the result.
 */
export async function resumeSyncSession(context: ResumeContext): Promise<string> {
    const { args, ctx, client } = context

    const toastManager = getTaskToastManager()
    const taskId = `resume_sync_${args.session_id!.slice(0, 8)}`
    const startTime = new Date()

    if (toastManager) {
        toastManager.addTask({
            id: taskId,
            description: args.description,
            agent: "continue",
            isBackground: false,
        })
    }

    ctx.metadata?.({
        title: `Continue: ${args.description}`,
        metadata: {
            prompt: args.prompt,
            load_skills: args.load_skills,
            description: args.description,
            run_in_background: args.run_in_background,
            sessionId: args.session_id,
            sync: true,
            command: args.command,
        },
    })

    try {
        // Resolve the agent and model from the existing session
        let resumeAgent: string | undefined
        let resumeModel: { providerID: string; modelID: string } | undefined

        const resolved = await Effect.runPromise(
            Effect.tryPromise({
                try: async () => {
                    const messagesResp = await client.session.messages({ path: { id: args.session_id! } })
                    const messages = (messagesResp.data ?? []) as Array<{
                        info?: { agent?: string; model?: { providerID: string; modelID: string }; modelID?: string; providerID?: string }
                    }>
                    for (let i = messages.length - 1; i >= 0; i--) {
                        const info = messages[i].info
                        if (info?.agent || info?.model || (info?.modelID && info?.providerID)) {
                            return {
                                agent: info.agent,
                                model: info.model ?? (info.providerID && info.modelID ? { providerID: info.providerID, modelID: info.modelID } : undefined)
                            }
                        }
                    }
                    return null
                },
                catch: () => null as never
            }).pipe(Effect.catchAll(() => Effect.succeed(null)))
        )

        if (resolved) {
            resumeAgent = resolved.agent
            resumeModel = resolved.model
        } else {
            const resumeMessageDir = getMessageDir(args.session_id!)
            const resumeMessage = resumeMessageDir ? findNearestMessageWithFields(resumeMessageDir) : null
            resumeAgent = resumeMessage?.agent
            resumeModel = resumeMessage?.model?.providerID && resumeMessage?.model?.modelID
                ? { providerID: resumeMessage.model.providerID, modelID: resumeMessage.model.modelID }
                : undefined
        }

        await client.session.prompt({
            path: { id: args.session_id! },
            body: {
                ...(resumeAgent !== undefined ? { agent: resumeAgent } : {}),
                ...(resumeModel !== undefined ? { model: resumeModel } : {}),
                tools: {
                    ...(resumeAgent ? getAgentToolRestrictions(resumeAgent) : {}),
                    task: false,
                    delegate_task: false,
                    call_omo_agent: true,
                    question: false,
                },
                parts: [{ type: "text", text: args.prompt }],
            },
        })
    } catch (promptError) {
        if (toastManager) {
            toastManager.removeTask(taskId)
        }
        const errorMessage = promptError instanceof Error ? promptError.message : String(promptError)
        return `Failed to send continuation prompt: ${errorMessage}\n\nSession ID: ${args.session_id}`
    }

    // Poll for stability using session continuation timing
    const timing = getTimingConfig()
    const pollResult = await pollForSessionCompletion({
        client,
        sessionID: args.session_id!,
        maxTimeMs: 60000,
        minStabilityTimeMs: timing.SESSION_CONTINUATION_STABILITY_MS,
    })

    if (pollResult.aborted) {
        if (toastManager) toastManager.removeTask(taskId)
        return `Task aborted.\n\nSession ID: ${args.session_id}`
    }

    const { text, found } = await fetchLastAssistantMessage(client, args.session_id!)

    if (toastManager) {
        toastManager.removeTask(taskId)
    }

    if (!found && !text.startsWith("Error")) {
        return `No assistant response found.\n\nSession ID: ${args.session_id}`
    }
    if (!found) {
        return text // Error message from fetchLastAssistantMessage
    }

    const duration = formatDuration(startTime)

    return `Task continued and completed in ${duration}.

Session ID: ${args.session_id}

---

${text || "(No text output)"}

---
To continue this session: session_id="${args.session_id}"`
}
