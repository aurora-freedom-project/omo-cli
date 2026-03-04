import {  describe, expect, test, mock, beforeEach, afterAll } from "bun:test"

afterAll(() => { mock.restore() })

mock.module("./storage", () => ({
    loadInjectedPaths: mock(() => new Set<string>()),
    saveInjectedPaths: mock(() => { }),
    clearInjectedPaths: mock(() => { }),
}))

mock.module("../../shared/dynamic-truncator", () => ({
    createDynamicTruncator: () => ({
        truncate: mock((_sid: string, content: string) =>
            Promise.resolve({ result: content, truncated: false }),
        ),
    }),
}))

import { createDirectoryAgentsInjectorHook } from "./index"

describe("directory-agents-injector", () => {
    const mockCtx = {
        directory: "/test/project",
    } as never

    describe("createDirectoryAgentsInjectorHook", () => {
        test("returns hook with expected handlers", () => {
            const hook = createDirectoryAgentsInjectorHook(mockCtx)

            expect(hook["tool.execute.before"]).toBeFunction()
            expect(hook["tool.execute.after"]).toBeFunction()
            expect(hook.event).toBeFunction()
        })

        test("tool.execute.after ignores non-read/batch tools", async () => {
            const hook = createDirectoryAgentsInjectorHook(mockCtx)
            const output = { title: "", output: "original", metadata: null }

            await hook["tool.execute.after"](
                { tool: "write", sessionID: "s1", callID: "c1" },
                output,
            )

            expect(output.output).toBe("original")
        })

        test("tool.execute.before ignores non-batch tools", async () => {
            const hook = createDirectoryAgentsInjectorHook(mockCtx)
            const output = { args: {} }

            await hook["tool.execute.before"](
                { tool: "read", sessionID: "s1", callID: "c1" },
                output,
            )

            // No error should occur
        })

        test("event handler processes session.deleted", async () => {
            const hook = createDirectoryAgentsInjectorHook(mockCtx)

            await hook.event({
                event: {
                    type: "session.deleted",
                    properties: { info: { id: "s1" } },
                },
            })
        })

        test("event handler processes session.compacted", async () => {
            const hook = createDirectoryAgentsInjectorHook(mockCtx)

            await hook.event({
                event: {
                    type: "session.compacted",
                    properties: { sessionID: "s1" },
                },
            })
        })
    })
})
