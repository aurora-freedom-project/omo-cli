import {  describe, expect, test, mock, beforeEach, afterAll } from "bun:test"

afterAll(() => { mock.restore() })

// Since the utility functions are not exported, we need to mock.module and test the hook factory
// For now, test the exported factory and its return shape

mock.module("./storage", () => ({
    loadInteractiveBashSessionState: mock(() => null),
    saveInteractiveBashSessionState: mock(() => { }),
    clearInteractiveBashSessionState: mock(() => { }),
}))

mock.module("../../features/claude-code-session-state", () => ({
    subagentSessions: new Set(),
}))

import { createInteractiveBashSessionHook } from "./index"

describe("interactive-bash-session", () => {
    const mockCtx = {
        directory: "/test/project",
        client: {
            session: {
                abort: mock(() => Promise.resolve()),
            },
        },
    } as never

    describe("createInteractiveBashSessionHook", () => {
        test("returns hook with expected handlers", () => {
            const hook = createInteractiveBashSessionHook(mockCtx)

            expect(hook["tool.execute.after"]).toBeFunction()
            expect(hook.event).toBeFunction()
        })

        test("tool.execute.after ignores non-interactive_bash tools", async () => {
            const hook = createInteractiveBashSessionHook(mockCtx)
            const output = { title: "", output: "original", metadata: null }

            await hook["tool.execute.after"](
                { tool: "read", sessionID: "s1", callID: "c1" },
                output,
            )

            expect(output.output).toBe("original")
        })

        test("tool.execute.after ignores commands without tmux_command arg", async () => {
            const hook = createInteractiveBashSessionHook(mockCtx)
            const output = { title: "", output: "original", metadata: null }

            await hook["tool.execute.after"](
                { tool: "interactive_bash", sessionID: "s1", callID: "c1", args: {} },
                output,
            )

            expect(output.output).toBe("original")
        })

        test("tool.execute.after ignores error output", async () => {
            const hook = createInteractiveBashSessionHook(mockCtx)
            const output = { title: "", output: "Error: command failed", metadata: null }

            await hook["tool.execute.after"](
                {
                    tool: "interactive_bash",
                    sessionID: "s1",
                    callID: "c1",
                    args: { tmux_command: "tmux new-session -s omo-test" },
                },
                output,
            )

            // Output should not be modified for error responses
            expect(output.output).toBe("Error: command failed")
        })

        test("event handler processes session.deleted event", async () => {
            const hook = createInteractiveBashSessionHook(mockCtx)

            // Should not throw
            await hook.event({
                event: {
                    type: "session.deleted",
                    properties: { info: { id: "s1" } },
                },
            })
        })
    })
})
