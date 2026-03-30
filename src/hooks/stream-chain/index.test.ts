import { describe, it, expect } from "bun:test"
import {
    getUpstreamContext,
    getChainLength,
    createStreamChainHook,
} from "./index"

describe("Stream-Chain", () => {
    describe("createStreamChainHook", () => {
        it("captures delegate_task outputs", async () => {
            const hook = createStreamChainHook()
            const sessionID = "test-stream-1"

            await hook["tool.execute.after"](
                { sessionID, tool: "delegate_task", args: { task_id: "1" } },
                { result: "Task completed successfully. Created auth module with JWT support." }
            )

            expect(getChainLength(sessionID)).toBe(1)
        })

        it("ignores non-delegation tools", async () => {
            const hook = createStreamChainHook()
            const sessionID = "test-stream-2"

            await hook["tool.execute.after"](
                { sessionID, tool: "read_file", args: { path: "/test" } },
                { result: "File contents here" }
            )

            expect(getChainLength(sessionID)).toBe(0)
        })

        it("ignores trivial outputs", async () => {
            const hook = createStreamChainHook()
            const sessionID = "test-stream-3"

            await hook["tool.execute.after"](
                { sessionID, tool: "delegate_task", args: {} },
                { result: "ok" } // Too short
            )

            expect(getChainLength(sessionID)).toBe(0)
        })
    })

    describe("getUpstreamContext", () => {
        it("returns null for empty chain", () => {
            expect(getUpstreamContext("nonexistent")).toBeNull()
        })

        it("returns formatted upstream context", async () => {
            const hook = createStreamChainHook()
            const sessionID = "test-stream-context"

            await hook["tool.execute.after"](
                { sessionID, tool: "delegate_task", args: { task_id: "1" } },
                { result: "Created the authentication module with JWT token generation." }
            )

            const context = getUpstreamContext(sessionID)
            expect(context).not.toBeNull()
            expect(context).toContain("Upstream Task 1")
            expect(context).toContain("delegate_task")
            expect(context).toContain("authentication module")
        })

        it("chains multiple delegate outputs", async () => {
            const hook = createStreamChainHook()
            const sessionID = "test-stream-chain"

            await hook["tool.execute.after"](
                { sessionID, tool: "delegate_task", args: { task_id: "1" } },
                { result: "First task completed: analyzed requirements." }
            )
            await hook["tool.execute.after"](
                { sessionID, tool: "call_omo_agent", args: { task_id: "2" } },
                { result: "Second task completed: implemented the module." }
            )

            const context = getUpstreamContext(sessionID)
            expect(context).toContain("Upstream Task 1")
            expect(context).toContain("Upstream Task 2")
            expect(getChainLength(sessionID)).toBe(2)
        })
    })

    describe("event handler", () => {
        it("cleans up session on delete", async () => {
            const hook = createStreamChainHook()
            const sessionID = "test-stream-cleanup"

            await hook["tool.execute.after"](
                { sessionID, tool: "delegate_task", args: {} },
                { result: "Some task result that is long enough to be captured." }
            )
            expect(getChainLength(sessionID)).toBe(1)

            await hook.event({
                event: {
                    type: "session.deleted",
                    properties: { info: { id: sessionID } },
                },
            })

            expect(getChainLength(sessionID)).toBe(0)
        })
    })
})
