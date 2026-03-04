import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"

const mockExistsSync = mock((_path: string) => false)
const mockMkdirSync = mock((_path: string, _opts?: unknown) => { })
const mockReadFileSync = mock((_path: string, _enc?: string) => "{}")
const mockReaddirSync = mock((_path: string) => [] as string[])
const mockWriteFileSync = mock((_path: string, _data: string) => { })

mock.module("node:fs", () => ({
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
    writeFileSync: mockWriteFileSync
}))

import * as injector from "./injector"
import { MESSAGE_STORAGE } from "./constants"
import { join } from "node:path"

describe("features/hook-message-injector/injector", () => {
    beforeEach(() => {
        mockExistsSync.mockReset()
        mockMkdirSync.mockReset()
        mockReadFileSync.mockReset()
        mockReaddirSync.mockReset()
        mockWriteFileSync.mockReset()

        mockExistsSync.mockImplementation(() => false)
        mockMkdirSync.mockImplementation(() => { })
        mockReadFileSync.mockImplementation(() => "{}")
        mockReaddirSync.mockImplementation(() => [])
        mockWriteFileSync.mockImplementation(() => { })
    })

    describe("findNearestMessageWithFields", () => {
        test("returns null if directory reading fails", () => {
            mockReaddirSync.mockImplementationOnce(() => { throw new Error("error") })
            expect(injector.findNearestMessageWithFields("/dir")).toBeNull()
        })

        test("returns perfect match containing all fields", () => {
            mockReaddirSync.mockReturnValueOnce(["1.json", "2.json"])
            mockReadFileSync.mockImplementation((path: string) => {
                if (String(path).includes("2.json")) {
                    return JSON.stringify({ agent: "a1", model: { providerID: "p", modelID: "m" } })
                }
                return "{}"
            })
            const res = injector.findNearestMessageWithFields("/dir")
            expect(res?.agent).toBe("a1")
        })

        test("returns partial match containing ANY fields if perfect match fails", () => {
            mockReaddirSync.mockReturnValue(["1.json", "2.json"])
            mockReadFileSync.mockImplementation((path: string) => {
                return JSON.stringify({ agent: "a2" })
            })
            const res = injector.findNearestMessageWithFields("/dir")
            expect(res?.agent).toBe("a2")
        })

        test("skips invalid JSON", () => {
            mockReaddirSync.mockReturnValue(["1.json"])
            mockReadFileSync.mockReturnValue("definitely not json")
            expect(injector.findNearestMessageWithFields("/dir")).toBeNull()
        })
    })

    describe("findFirstMessageWithAgent", () => {
        test("returns null strings error map loop array throws", () => {
            mockReaddirSync.mockImplementationOnce(() => { throw new Error("not found") })
            expect(injector.findFirstMessageWithAgent("/dir")).toBeNull()
        })

        test("returns first string mapping loops resolving JSON", () => {
            mockReaddirSync.mockReturnValue(["1.json", "2.json"])
            mockReadFileSync.mockImplementation((path: string) => {
                if (String(path).includes("1.json")) return "invalid"
                if (String(path).includes("2.json")) return JSON.stringify({ agent: "target" })
                return "{}"
            })

            expect(injector.findFirstMessageWithAgent("/dir")).toBe("target")
        })

        test("returns null if no agents string mapped", () => {
            mockReaddirSync.mockReturnValue(["1.json"])
            mockReadFileSync.mockReturnValue(JSON.stringify({ notAgent: true }))
            expect(injector.findFirstMessageWithAgent("/dir")).toBeNull()
        })
    })

    describe("injectHookMessage", () => {
        test("early returns false string logic block if hook message is empty", () => {
            const res = injector.injectHookMessage("sess1", "   ", {} as any)
            expect(res).toBe(false)
        })

        test("resolves strings bounds directly skipping fallback", () => {
            mockExistsSync.mockReturnValue(true) // pretend dir exists

            const origMsg = {
                agent: "a1",
                model: { providerID: "p1", modelID: "m1", variant: "v1" },
                path: { cwd: "/test", root: "/" }
            }

            const res = injector.injectHookMessage("sess1", "test check str", origMsg)
            expect(res).toBe(true)

            expect(mockWriteFileSync).toHaveBeenCalledTimes(2)
        })

        test("resolves map searching subdirs if direct session path mapping boundaries limits array strings error fail limit maps", () => {
            // Mock existSync to fail direct path check, but succeed deep path
            // LINE 106 MATCH CHECK
            mockExistsSync.mockImplementation((path: string) => {
                if (path === MESSAGE_STORAGE) return true
                if (path === join(MESSAGE_STORAGE, "sess1")) return false
                if (path === join(MESSAGE_STORAGE, "subdir", "sess1")) return true
                return true // for partDir limits
            })

            mockReaddirSync.mockImplementation((path: string) => {
                if (path === MESSAGE_STORAGE) return ["subdir", "other"]
                return []
            })

            const origMsg = { agent: "a1", model: { providerID: "p1", modelID: "m1" } }
            const res = injector.injectHookMessage("sess1", "hi limits target mapped", origMsg)
            expect(res).toBe(true)
        })

        test("creates raw path completely natively boundaries resolving false checks arrays limit", () => {
            mockExistsSync.mockReturnValue(false)
            mockReaddirSync.mockReturnValue([])

            const res = injector.injectHookMessage("sess1", "fallback map", {})
            expect(res).toBe(true)

            // LINE 104 MESSAGE_STORAGE mkdir
            // LINE 195 PART_STORAGE mkdir
            expect(mockMkdirSync).toHaveBeenCalled()
        })

        test("returns false strings bounding mapping errors natively mapped limits loops logic boundaries schema error mapped var loops maps targets", () => {
            mockExistsSync.mockReturnValue(true)
            mockWriteFileSync.mockImplementation(() => { throw new Error("limit out") })

            const res = injector.injectHookMessage("sess1", "hi", { agent: "a1", model: { providerID: "p1", modelID: "m1" } })
            expect(res).toBe(false)
        })

        test("hits fallback ternary block limits tracking mapping constraints loops resolving boundaries mapping", () => {

            mockExistsSync.mockReturnValue(true)

            mockReaddirSync.mockImplementation((path: string) => {
                if (String(path).endsWith("sess3")) return ["fallback.json"]
                return []
            })

            mockReadFileSync.mockImplementation((path: string) => {
                if (String(path).includes("fallback.json")) {
                    return JSON.stringify({
                        agent: "fbAgent",
                        model: { providerID: "fbP", modelID: "fbM", variant: "fbV" },
                        tools: { "foo": "allow" }
                    })
                }
                return "{}"
            })

            const res = injector.injectHookMessage("sess3", "trigger fallback", {})
            expect(res).toBe(true)
            expect(mockReadFileSync).toHaveBeenCalled()
        })
    })
})
