import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { resumeBackgroundSession, resumeSyncSession, type ResumeContext } from "./session-resume"
import { __setTimingConfig, __resetTimingConfig } from "./timing"
import type { DelegateTaskArgs } from "./types"
import {
    createMockToolContext,
    createMockSessionClient,
    createMockBackgroundManager,
} from "../../test-helpers"

/** Creates a minimal ResumeContext for testing. */
function createTestContext(overrides?: Partial<ResumeContext>): ResumeContext {
    const args: DelegateTaskArgs = {
        description: "Test continuation",
        prompt: "Continue working on the task",
        run_in_background: false,
        load_skills: [],
        session_id: "ses_resume_test",
    }

    const ctx = createMockToolContext({
        sessionID: "parent-session",
        messageID: "parent-message",
        agent: "orchestrator",
    })

    const manager = createMockBackgroundManager()

    const client = createMockSessionClient({
        messages: async () => ({
            data: [
                {
                    info: {
                        role: "assistant",
                        agent: "explorer",
                        model: { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
                        time: { created: Date.now() },
                    },
                    parts: [{ type: "text", text: "Task resumed successfully" }],
                },
            ],
        }),
        prompt: async () => ({ data: {} }),
        status: async () => ({ data: {} }),
    })

    return {
        args,
        ctx,
        client,
        manager,
        ...overrides,
    }
}

describe("session-resume", () => {
    beforeEach(() => {
        __setTimingConfig({
            POLL_INTERVAL_MS: 10,
            MIN_STABILITY_TIME_MS: 20,
            STABILITY_POLLS_REQUIRED: 1,
            MAX_POLL_TIME_MS: 2000,
            SESSION_CONTINUATION_STABILITY_MS: 20,
            WAIT_FOR_SESSION_INTERVAL_MS: 10,
            WAIT_FOR_SESSION_TIMEOUT_MS: 500,
        })
    })

    afterEach(() => {
        __resetTimingConfig()
    })

    describe("resumeBackgroundSession", () => {
        test("returns success message with task details", async () => {
            // #given
            const context = createTestContext()

            // #when
            const result = await resumeBackgroundSession(context)

            // #then
            expect(result).toContain("Background task continued")
            expect(result).toContain("ses_resume_test")
            expect(result).toContain("task-bg-123")
            expect(result).toContain("explorer")
        })

        test("calls manager.resume with correct params", async () => {
            // #given
            let resumeInput: Record<string, unknown> | undefined
            const context = createTestContext({
                manager: createMockBackgroundManager({
                    resume: async (input: Record<string, unknown>) => {
                        resumeInput = input
                        return { id: "t1", sessionID: "s1", description: "d", agent: "a", status: "running" }
                    },
                }),
                parentModel: { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
                parentAgent: "orchestrator",
            })

            // #when
            await resumeBackgroundSession(context)

            // #then
            expect(resumeInput).toBeDefined()
            expect(resumeInput!.sessionId).toBe("ses_resume_test")
            expect(resumeInput!.prompt).toBe("Continue working on the task")
            expect(resumeInput!.parentModel).toEqual({ providerID: "anthropic", modelID: "claude-sonnet-4-5" })
            expect(resumeInput!.parentAgent).toBe("orchestrator")
        })

        test("returns error message when manager.resume fails", async () => {
            // #given
            const context = createTestContext({
                manager: createMockBackgroundManager({
                    resume: async () => { throw new Error("Session not found") },
                }),
            })

            // #when
            const result = await resumeBackgroundSession(context)

            // #then
            expect(result).toContain("Continue background task failed")
            expect(result).toContain("Session not found")
        })
    })

    describe("resumeSyncSession", () => {
        test("returns completed message with assistant response", async () => {
            // #given
            const context = createTestContext()

            // #when
            const result = await resumeSyncSession(context)

            // #then
            expect(result).toContain("Task continued and completed")
            expect(result).toContain("ses_resume_test")
            expect(result).toContain("Task resumed successfully")
        })

        test("sends prompt with resolved agent and model", async () => {
            // #given
            let promptBody: Record<string, unknown> | undefined
            const context = createTestContext({
                client: createMockSessionClient({
                    messages: async () => ({
                        data: [
                            {
                                info: {
                                    role: "assistant",
                                    agent: "researcher",
                                    model: { providerID: "openai", modelID: "gpt-5.2" },
                                    time: { created: Date.now() },
                                },
                                parts: [{ type: "text", text: "Response" }],
                            },
                        ],
                    }),
                    prompt: async (input: unknown) => {
                        promptBody = (input as Record<string, unknown>).body as Record<string, unknown>
                        return { data: {} }
                    },
                    status: async () => ({ data: {} }),
                }),
            })

            // #when
            await resumeSyncSession(context)

            // #then
            expect(promptBody).toBeDefined()
            expect(promptBody!.agent).toBe("researcher")
            expect(promptBody!.model).toEqual({ providerID: "openai", modelID: "gpt-5.2" })
        })

        test("returns error when prompt fails", async () => {
            // #given
            const context = createTestContext({
                client: createMockSessionClient({
                    messages: async () => ({ data: [] }),
                    prompt: async () => { throw new Error("Prompt rejected") },
                    status: async () => ({ data: {} }),
                }),
            })

            // #when
            const result = await resumeSyncSession(context)

            // #then
            expect(result).toContain("Failed to send continuation prompt")
            expect(result).toContain("Prompt rejected")
        })

        test("returns no-response message when no assistant messages found", async () => {
            // #given - messages only from user, no assistant reply
            const context = createTestContext({
                client: createMockSessionClient({
                    messages: async () => ({
                        data: [
                            { info: { role: "user" }, parts: [{ type: "text", text: "hello" }] },
                        ],
                    }),
                    prompt: async () => ({ data: {} }),
                    status: async () => ({ data: {} }),
                }),
            })

            // #when
            const result = await resumeSyncSession(context)

            // #then
            expect(result).toContain("No assistant response found")
        })

        test("includes session_id in output for continuation", async () => {
            // #given
            const context = createTestContext()

            // #when
            const result = await resumeSyncSession(context)

            // #then
            expect(result).toContain("session_id=\"ses_resume_test\"")
        })
    })
})
