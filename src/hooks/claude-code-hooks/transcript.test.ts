import { describe, test, expect, mock, spyOn, afterEach, beforeEach } from "bun:test"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

// Calculate expected test path statically (since we don't mock getClaudeConfigDir)
const expectedConfigDir = path.join(os.homedir(), ".claude")
const expectedTranscriptsDir = path.join(expectedConfigDir, "transcripts")

// Mocks for core FS functions
let mockedFsState: Record<string, string> = {}
let mockedExistsState: Record<string, boolean> = {}

mock.module("fs", () => ({
    mkdirSync: mock(),
    appendFileSync: mock((p: string, data: string) => {
        mockedFsState[p] = (mockedFsState[p] || "") + data
    }),
    existsSync: mock((p: string) => mockedExistsState[p] || false),
    writeFileSync: mock((p: string, data: string) => {
        mockedFsState[p] = data
    }),
    unlinkSync: mock((p: string) => {
        if (!mockedExistsState[p] && p.includes("throw-unlink")) {
            throw new Error("Cannot unlink")
        }
        delete mockedFsState[p]
    })
}))

import {
    getTranscriptPath,
    appendTranscriptEntry,
    recordToolUse,
    recordToolResult,
    recordUserMessage,
    recordAssistantMessage,
    buildTranscriptFromSession,
    deleteTempTranscript
} from "./transcript"

describe("transcript", () => {
    beforeEach(() => {
        mockedFsState = {}
        mockedExistsState = {}
    })

    afterEach(() => {
        mock.restore()
    })

    describe("getTranscriptPath", () => {
        test("returns path inside transcripts dir based on sessionId", () => {
            const result = getTranscriptPath("test-session")
            expect(result).toBe(path.join(expectedTranscriptsDir, "test-session.jsonl"))
        })
    })

    describe("appendTranscriptEntry", () => {
        test("creates directory if missing and appends entry array", () => {
            const entry = { type: "test", content: "data" } as never
            mockedExistsState[expectedTranscriptsDir] = false

            appendTranscriptEntry("sess1", entry)

            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedTranscriptsDir, { recursive: true })
            const writtenPath = getTranscriptPath("sess1")
            expect(mockedFsState[writtenPath]).toBe(JSON.stringify(entry) + "\n")
        })

        test("does not attempt directory creation if true", () => {
            const entry = { type: "test", content: "data" } as never
            mockedExistsState[expectedTranscriptsDir] = true

                // clear mock counts
                ; (fs.mkdirSync as unknown as { mockClear: () => void }).mockClear()

            appendTranscriptEntry("sess1", entry)
            expect(fs.mkdirSync).not.toHaveBeenCalled()
        })
    })

    describe("record functions", () => {
        test("recordToolUse adds timestamp and types", () => {
            // Need a deterministic timestamp
            const mockDate = new Date("2023-01-01T00:00:00.000Z")
            spyOn(global, "Date").mockImplementation((() => mockDate) as never)

            recordToolUse("sess1", "Bash", { command: "ls" })
            const writtenPath = getTranscriptPath("sess1")
            const lines = mockedFsState[writtenPath].trim().split("\n").map(l => JSON.parse(l))
            expect(lines[0]).toEqual({
                type: "tool_use",
                timestamp: "2023-01-01T00:00:00.000Z",
                tool_name: "Bash",
                tool_input: { command: "ls" }
            })
        })

        test("recordToolResult adds timestamp and types", () => {
            const mockDate = new Date("2023-01-01T00:00:00.000Z")
            spyOn(global, "Date").mockImplementation((() => mockDate) as never)

            recordToolResult("sess1", "Bash", { command: "ls" }, { out: "list" })
            const writtenPath = getTranscriptPath("sess1")
            const lines = mockedFsState[writtenPath].trim().split("\n").map(l => JSON.parse(l))
            expect(lines[0]).toEqual({
                type: "tool_result",
                timestamp: "2023-01-01T00:00:00.000Z",
                tool_name: "Bash",
                tool_input: { command: "ls" },
                tool_output: { out: "list" }
            })
        })

        test("recordUserMessage adds content", () => {
            const mockDate = new Date("2023-01-01T00:00:00.000Z")
            spyOn(global, "Date").mockImplementation((() => mockDate) as never)

            recordUserMessage("sess1", "hello")
            const writtenPath = getTranscriptPath("sess1")
            const lines = mockedFsState[writtenPath].trim().split("\n").map(l => JSON.parse(l))
            expect(lines[0]).toEqual({
                type: "user",
                timestamp: "2023-01-01T00:00:00.000Z",
                content: "hello"
            })
        })

        test("recordAssistantMessage adds content", () => {
            const mockDate = new Date("2023-01-01T00:00:00.000Z")
            spyOn(global, "Date").mockImplementation((() => mockDate) as never)

            recordAssistantMessage("sess1", "hello back")
            const writtenPath = getTranscriptPath("sess1")
            const lines = mockedFsState[writtenPath].trim().split("\n").map(l => JSON.parse(l))
            expect(lines[0]).toEqual({
                type: "assistant",
                timestamp: "2023-01-01T00:00:00.000Z",
                content: "hello back"
            })
        })
    })

    describe("buildTranscriptFromSession", () => {
        test("builds matching file and transforms tool names correctly from array messages", async () => {
            const client = {
                session: {
                    messages: mock().mockResolvedValue([
                        {
                            info: { role: "user" }
                        },
                        {
                            info: { role: "assistant" },
                            parts: [
                                { type: "text" },
                                {
                                    type: "tool",
                                    tool: "my_dash_tool",
                                    state: {
                                        status: "completed",
                                        input: { arg: 1 }
                                    }
                                }
                            ]
                        }
                    ])
                }
            }

            const res = await buildTranscriptFromSession(client, "sess2", "/test/dir", "currTool", { x: 2 })
            expect(res).toBeDefined()

            const fileContent = mockedFsState[res!]
            const items = fileContent.trim().split("\n").map(l => JSON.parse(l))

            expect(items.length).toBe(2)
            expect(items[0]).toEqual({
                type: "assistant",
                message: {
                    role: "assistant",
                    content: [{
                        type: "tool_use",
                        name: "MyDashTool", // testing transformToolName
                        input: { arg: 1 }
                    }]
                }
            })
            expect(items[1]).toEqual({
                type: "assistant",
                message: {
                    role: "assistant",
                    content: [{
                        type: "tool_use",
                        name: "CurrTool", // transforms trailing tool
                        input: { x: 2 }
                    }]
                }
            })
        })

        test("builds properly when response object hides messages inside .data", async () => {
            const client = {
                session: {
                    messages: mock().mockResolvedValue({
                        data: [{
                            info: { role: "assistant" },
                            parts: [{
                                type: "tool", tool: "some_tool",
                                state: { status: "completed", input: {} }
                            }]
                        }]
                    })
                }
            }
            const res = await buildTranscriptFromSession(client, "sess2", "/test/dir", "curr", {})
            expect(res).toBeDefined()
            const items = mockedFsState[res!].trim().split("\n").map(l => JSON.parse(l))
            expect(items.length).toBe(2)
        })

        test("builds properly when response object hides messages inside 200 array", async () => {
            const client = {
                session: {
                    messages: mock().mockResolvedValue({
                        "200": [{
                            info: { role: "assistant" },
                            parts: [{
                                type: "tool", tool: "some_tool",
                                state: { status: "completed", input: {} }
                            }]
                        }]
                    })
                }
            }
            const res = await buildTranscriptFromSession(client, "sess2", "/test/dir", "curr", {})
            expect(res).toBeDefined()
            const items = mockedFsState[res!].trim().split("\n").map(l => JSON.parse(l))
            expect(items.length).toBe(2)
        })

        test("gracefully falls back on hard api error returning single active command block", async () => {
            const client = {
                session: {
                    messages: mock().mockRejectedValue(new Error("Network failed"))
                }
            }

            const res = await buildTranscriptFromSession(client, "sess-error", "/test/dir", "badTool", {})
            expect(res).toBeDefined()

            const fileContent = mockedFsState[res!]
            const items = fileContent.trim().split("\n").map(l => JSON.parse(l))

            expect(items.length).toBe(1)
            expect(items[0]).toEqual({
                type: "assistant",
                message: {
                    role: "assistant",
                    content: [{
                        type: "tool_use",
                        name: "BadTool",
                        input: {}
                    }]
                }
            })
        })
    })

    describe("deleteTempTranscript", () => {
        test("exits immediately on null path", () => {
            deleteTempTranscript(null)
            expect(fs.unlinkSync).not.toHaveBeenCalled()
        })

        test("deletes valid target path", () => {
            mockedFsState["/tmp/t1"] = "test"
            deleteTempTranscript("/tmp/t1")
            expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/t1")
        })

        test("catches error implicitly resulting in no breakages", () => {
            expect(() => {
                deleteTempTranscript("throw-unlink")
            }).not.toThrow()
        })
    })
})
