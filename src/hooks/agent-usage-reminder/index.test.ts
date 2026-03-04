import {  describe, expect, test, mock, afterAll } from "bun:test"

afterAll(() => { mock.restore() })

mock.module("./storage", () => ({
    loadAgentUsageState: mock(() => null),
    saveAgentUsageState: mock(() => { }),
    clearAgentUsageState: mock(() => { }),
}))

mock.module("./constants", () => ({
    TARGET_TOOLS: new Set(["write", "edit"]),
    AGENT_TOOLS: new Set(["delegate_task", "call_omo_agent"]),
    REMINDER_MESSAGE: "\n[Reminder: Consider using delegate_task for complex work]",
}))

import { createAgentUsageReminderHook } from "./index"

describe("agent-usage-reminder", () => {
    const mockCtx = {} as never

    describe("createAgentUsageReminderHook", () => {
        test("returns hook with expected handlers", () => {
            const hook = createAgentUsageReminderHook(mockCtx)

            expect(hook["tool.execute.after"]).toBeFunction()
            expect(hook.event).toBeFunction()
        })

        test("tool.execute.after ignores non-target tools", async () => {
            const hook = createAgentUsageReminderHook(mockCtx)
            const output = { title: "", output: "original", metadata: null }

            await hook["tool.execute.after"](
                { tool: "read", sessionID: "s1", callID: "c1" },
                output,
            )

            expect(output.output).toBe("original")
        })

        test("tool.execute.after marks agent used for agent tools", async () => {
            const hook = createAgentUsageReminderHook(mockCtx)
            const output = { title: "", output: "original", metadata: null }

            await hook["tool.execute.after"](
                { tool: "delegate_task", sessionID: "s1", callID: "c1" },
                output,
            )

            // Output should not have reminder appended (agent was "used")
            expect(output.output).toBe("original")
        })

        test("tool.execute.after appends reminder for target tools when no agent used", async () => {
            const hook = createAgentUsageReminderHook(mockCtx)
            const output = { title: "", output: "original", metadata: null }

            await hook["tool.execute.after"](
                { tool: "write", sessionID: "s1", callID: "c1" },
                output,
            )

            expect(output.output).toContain("Reminder")
        })

        test("event handler processes session.deleted", async () => {
            const hook = createAgentUsageReminderHook(mockCtx)

            await hook.event({
                event: {
                    type: "session.deleted",
                    properties: { info: { id: "s1" } },
                },
            })
        })

        test("event handler processes session.compacted", async () => {
            const hook = createAgentUsageReminderHook(mockCtx)

            await hook.event({
                event: {
                    type: "session.compacted",
                    properties: { sessionID: "s1" },
                },
            })
        })
    })
})
