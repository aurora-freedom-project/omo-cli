import { describe, test, expect } from "bun:test"
import type { ActionResult, ExecuteActionsResult, ExecuteContext } from "./action-executor"
import type { PaneAction, WindowState } from "./types"
import { createMockTmuxConfig } from "../../test-helpers"

/**
 * Tests for action-executor types and type contracts.
 *
 * Note: executeAction/executeActions call tmux shell commands (spawnTmuxPane,
 * closeTmuxPane, etc.) so full integration tests require a tmux environment.
 * The decision-engine.test.ts already tests the pure decision logic extensively.
 * These tests verify the type contracts and structure.
 */
describe("action-executor", () => {
    describe("ActionResult type contract", () => {
        test("success-only result is valid", () => {
            // #given / #when
            const result: ActionResult = { success: true }

            // #then
            expect(result.success).toBe(true)
            expect(result.paneId).toBeUndefined()
            expect(result.error).toBeUndefined()
        })

        test("success result with paneId is valid", () => {
            // #given / #when
            const result: ActionResult = { success: true, paneId: "%5" }

            // #then
            expect(result.success).toBe(true)
            expect(result.paneId).toBe("%5")
        })

        test("failure result with error is valid", () => {
            // #given / #when
            const result: ActionResult = { success: false, error: "tmux not found" }

            // #then
            expect(result.success).toBe(false)
            expect(result.error).toBe("tmux not found")
        })
    })

    describe("ExecuteActionsResult type contract", () => {
        test("empty actions result is valid", () => {
            // #given / #when
            const result: ExecuteActionsResult = {
                success: true,
                results: [],
            }

            // #then
            expect(result.success).toBe(true)
            expect(result.results).toHaveLength(0)
            expect(result.spawnedPaneId).toBeUndefined()
        })

        test("result with spawn captures paneId", () => {
            // #given
            const spawnAction: PaneAction = {
                type: "spawn",
                sessionId: "ses1",
                description: "Test agent",
                targetPaneId: "%0",
                splitDirection: "-h",
            }

            // #when
            const result: ExecuteActionsResult = {
                success: true,
                spawnedPaneId: "%3",
                results: [
                    { action: spawnAction, result: { success: true, paneId: "%3" } },
                ],
            }

            // #then
            expect(result.spawnedPaneId).toBe("%3")
            expect(result.results[0].action.type).toBe("spawn")
        })

        test("failure stops at first failed action", () => {
            // #given
            const closeAction: PaneAction = {
                type: "close",
                paneId: "%1",
                sessionId: "old-ses",
            }

            // #when
            const result: ExecuteActionsResult = {
                success: false,
                results: [
                    { action: closeAction, result: { success: false, error: "pane not found" } },
                ],
            }

            // #then
            expect(result.success).toBe(false)
            expect(result.results).toHaveLength(1)
        })
    })

    describe("PaneAction discriminated union", () => {
        test("close action has paneId", () => {
            // #given / #when
            const action: PaneAction = { type: "close", paneId: "%1", sessionId: "ses1" }

            // #then
            expect(action.type).toBe("close")
            expect(action.paneId).toBe("%1")
        })

        test("spawn action has splitDirection", () => {
            // #given / #when
            const action: PaneAction = {
                type: "spawn",
                sessionId: "ses1",
                description: "test",
                targetPaneId: "%0",
                splitDirection: "-v",
            }

            // #then
            expect(action.type).toBe("spawn")
            expect(action.splitDirection).toBe("-v")
        })

        test("replace action has old and new sessionId", () => {
            // #given / #when
            const action: PaneAction = {
                type: "replace",
                paneId: "%1",
                oldSessionId: "old-ses",
                newSessionId: "new-ses",
                description: "Replacing agent",
            }

            // #then
            expect(action.type).toBe("replace")
            expect(action.oldSessionId).toBe("old-ses")
            expect(action.newSessionId).toBe("new-ses")
        })
    })

    describe("ExecuteContext type contract", () => {
        test("context has required fields", () => {
            // #given / #when
            const windowState: WindowState = {
                windowWidth: 200,
                windowHeight: 50,
                mainPane: { paneId: "%0", width: 100, height: 50, left: 0, top: 0, title: "main", isActive: true },
                agentPanes: [],
            }

            const ctx: ExecuteContext = {
                config: createMockTmuxConfig(),
                serverUrl: "http://localhost:3000",
                windowState,
            }

            // #then
            expect(ctx.serverUrl).toBe("http://localhost:3000")
            expect(ctx.windowState.windowWidth).toBe(200)
            expect(ctx.windowState.mainPane?.paneId).toBe("%0")
        })
    })
})
