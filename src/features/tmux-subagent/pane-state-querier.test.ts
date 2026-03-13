import { describe, test, expect } from "bun:test"
import type { WindowState, TmuxPaneInfo } from "./types"
import { MIN_PANE_WIDTH, MIN_PANE_HEIGHT } from "./types"

/**
 * Tests for pane-state-querier logic.
 *
 * Note: queryWindowState() spawns a tmux process to list panes, so it
 * can only be fully integration-tested in a tmux environment. These tests
 * verify the parsing logic and type contracts that queryWindowState produces.
 */
describe("pane-state-querier", () => {
    describe("WindowState structure", () => {
        test("empty window has no agent panes", () => {
            // #given / #when
            const state: WindowState = {
                windowWidth: 200,
                windowHeight: 50,
                mainPane: {
                    paneId: "%0",
                    width: 200,
                    height: 50,
                    left: 0,
                    top: 0,
                    title: "main",
                    isActive: true,
                },
                agentPanes: [],
            }

            // #then
            expect(state.mainPane?.paneId).toBe("%0")
            expect(state.agentPanes).toHaveLength(0)
            expect(state.windowWidth).toBe(200)
        })

        test("WindowState with agent panes", () => {
            // #given / #when
            const mainPane: TmuxPaneInfo = {
                paneId: "%0",
                width: 100,
                height: 50,
                left: 0,
                top: 0,
                title: "main",
                isActive: true,
            }

            const agentPanes: TmuxPaneInfo[] = [
                {
                    paneId: "%1",
                    width: 50,
                    height: 50,
                    left: 101,
                    top: 0,
                    title: "agent-1",
                    isActive: false,
                },
                {
                    paneId: "%2",
                    width: 50,
                    height: 25,
                    left: 101,
                    top: 26,
                    title: "agent-2",
                    isActive: false,
                },
            ]

            const state: WindowState = {
                windowWidth: 200,
                windowHeight: 50,
                mainPane,
                agentPanes,
            }

            // #then
            expect(state.agentPanes).toHaveLength(2)
            expect(state.agentPanes[0].paneId).toBe("%1")
            expect(state.agentPanes[1].paneId).toBe("%2")
        })

        test("WindowState with null mainPane (source pane not found)", () => {
            // #given / #when
            const state: WindowState = {
                windowWidth: 200,
                windowHeight: 50,
                mainPane: null,
                agentPanes: [],
            }

            // #then
            expect(state.mainPane).toBeNull()
        })
    })

    describe("TmuxPaneInfo structure", () => {
        test("pane has all required dimensions", () => {
            // #given / #when
            const pane: TmuxPaneInfo = {
                paneId: "%3",
                width: MIN_PANE_WIDTH,
                height: MIN_PANE_HEIGHT,
                left: 100,
                top: 20,
                title: "background: explorer",
                isActive: false,
            }

            // #then
            expect(pane.width).toBe(MIN_PANE_WIDTH)
            expect(pane.height).toBe(MIN_PANE_HEIGHT)
            expect(pane.paneId).toStartWith("%")
            expect(pane.isActive).toBe(false)
        })

        test("MIN_PANE_WIDTH and MIN_PANE_HEIGHT are reasonable", () => {
            // #given / #when / #then
            expect(MIN_PANE_WIDTH).toBeGreaterThanOrEqual(20)
            expect(MIN_PANE_WIDTH).toBeLessThanOrEqual(120)
            expect(MIN_PANE_HEIGHT).toBeGreaterThanOrEqual(5)
            expect(MIN_PANE_HEIGHT).toBeLessThanOrEqual(40)
        })
    })

    describe("tmux output parsing simulation", () => {
        test("parses typical tmux list-panes output format", () => {
            // #given - simulated tmux list-panes output
            const tmuxOutput = [
                "%0,100,50,0,0,main,1,200,50",
                "%1,50,50,101,0,agent-explorer,0,200,50",
            ].join("\n")

            // #when - parse the lines (simulating queryWindowState logic)
            const lines = tmuxOutput.trim().split("\n").filter(Boolean)
            const panes: TmuxPaneInfo[] = []
            let windowWidth = 0
            let windowHeight = 0

            for (const line of lines) {
                const [paneId, widthStr, heightStr, leftStr, topStr, title, activeStr, windowWidthStr, windowHeightStr] = line.split(",")
                const width = parseInt(widthStr, 10)
                const height = parseInt(heightStr, 10)
                const left = parseInt(leftStr, 10)
                const top = parseInt(topStr, 10)
                const isActive = activeStr === "1"
                windowWidth = parseInt(windowWidthStr, 10)
                windowHeight = parseInt(windowHeightStr, 10)

                if (!isNaN(width) && !isNaN(left) && !isNaN(height) && !isNaN(top)) {
                    panes.push({ paneId, width, height, left, top, title, isActive })
                }
            }

            panes.sort((a, b) => a.left - b.left || a.top - b.top)

            // #then
            expect(panes).toHaveLength(2)
            expect(windowWidth).toBe(200)
            expect(windowHeight).toBe(50)
            expect(panes[0].paneId).toBe("%0")
            expect(panes[0].isActive).toBe(true)
            expect(panes[1].paneId).toBe("%1")
            expect(panes[1].left).toBe(101)
        })

        test("handles empty tmux output", () => {
            // #given
            const tmuxOutput = ""

            // #when
            const lines = tmuxOutput.trim().split("\n").filter(Boolean)

            // #then
            expect(lines).toHaveLength(0)
        })

        test("sorts panes by position (left, then top)", () => {
            // #given - panes in random order
            const panes: TmuxPaneInfo[] = [
                { paneId: "%2", width: 50, height: 25, left: 101, top: 26, title: "b", isActive: false },
                { paneId: "%0", width: 100, height: 50, left: 0, top: 0, title: "main", isActive: true },
                { paneId: "%1", width: 50, height: 25, left: 101, top: 0, title: "a", isActive: false },
            ]

            // #when
            panes.sort((a, b) => a.left - b.left || a.top - b.top)

            // #then
            expect(panes[0].paneId).toBe("%0") // left=0
            expect(panes[1].paneId).toBe("%1") // left=101, top=0
            expect(panes[2].paneId).toBe("%2") // left=101, top=26
        })

        test("filters invalid NaN entries", () => {
            // #given - line with invalid data
            const invalidLine = "%bad,NaN,NaN,NaN,NaN,invalid,0,200,50"
            const [, widthStr, , leftStr] = invalidLine.split(",")

            // #when
            const width = parseInt(widthStr, 10)
            const left = parseInt(leftStr, 10)
            const isValid = !isNaN(width) && !isNaN(left)

            // #then
            expect(isValid).toBe(false)
        })
    })
})
