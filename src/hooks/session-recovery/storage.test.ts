import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"
import { join } from "node:path"

const mockFs = {
    existsSync: mock(),
    mkdirSync: mock(),
    readdirSync: mock(),
    readFileSync: mock(),
    unlinkSync: mock(),
    writeFileSync: mock(),
}
mock.module("node:fs", () => mockFs)

const mockConstants = {
    MESSAGE_STORAGE: "/mock/msg",
    PART_STORAGE: "/mock/part",
    THINKING_TYPES: new Set(["thinking", "reasoning"]),
    META_TYPES: new Set(["system", "meta"])
}
mock.module("./constants", () => mockConstants)

import * as storage from "./storage"

describe("session-recovery/storage", () => {
    beforeEach(() => {
        Object.values(mockFs).forEach(m => m.mockReset())
    })

    afterEach(() => {
        mock.restore()
    })

    describe("generatePartId", () => {
        test("generates unique ids", () => {
            expect(storage.generatePartId().startsWith("prt_")).toBe(true)
        })
    })

    describe("getMessageDir", () => {
        test("resolves paths", () => {
            mockFs.existsSync.mockImplementation((p: string) => p === "/mock/msg" || p === join("/mock/msg", "s1"))
            expect(storage.getMessageDir("s1")).toBe(join("/mock/msg", "s1"))
        })
        test("returns empty when root missing", () => {
            mockFs.existsSync.mockReturnValue(false)
            expect(storage.getMessageDir("s1")).toBe("")
        })
        test("scans subdirs", () => {
            mockFs.existsSync.mockImplementation((p: string) => {
                if (p === "/mock/msg") return true
                if (p === join("/mock/msg", "s1")) return false
                if (p === join("/mock/msg", "subA", "s1")) return true
                return false
            })
            mockFs.readdirSync.mockReturnValue(["subA", "subB"])
            expect(storage.getMessageDir("s1")).toBe(join("/mock/msg", "subA", "s1"))
        })
        test("returns empty if not found anywhere", () => {
            mockFs.existsSync.mockImplementation((p: string) => p === "/mock/msg")
            mockFs.readdirSync.mockReturnValue(["subA"])
            expect(storage.getMessageDir("s1")).toBe("")
        })
    })

    describe("readMessages", () => {
        test("returns empty properly", () => {
            mockFs.existsSync.mockReturnValue(false)
            expect(storage.readMessages("s2")).toEqual([])
        })
        test("parses files effectively", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue(["b.json", "d.json"])
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("b.json")) return JSON.stringify({ id: "m2", time: { created: 10 } })
                if (p.endsWith("d.json")) return JSON.stringify({ id: "m1", time: { created: 5 } })
                return ""
            })
            const msgs = storage.readMessages("s1")
            expect(msgs[0].id).toBe("m1")
            expect(msgs[1].id).toBe("m2")
        })
        test("handles syntactically broken objects", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue(["b.json"])
            mockFs.readFileSync.mockReturnValue("INVALID")
            expect(storage.readMessages("s1")).toEqual([])
        })
        test("sorts by lexical string ID identically when creation time spans match or are missing", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue(["x.json", "y.json"])
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("x.json")) return JSON.stringify({ id: "Z9" })
                if (p.endsWith("y.json")) return JSON.stringify({ id: "A1" })
                return ""
            })
            const msgs = storage.readMessages("s1")
            expect(msgs[0].id).toBe("A1")
            expect(msgs[1].id).toBe("Z9")
        })
    })

    describe("readParts", () => {
        test("missing dir", () => {
            mockFs.existsSync.mockReturnValue(false)
            expect(storage.readParts("m1")).toEqual([])
        })
        test("parsing and skipping broken files", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue(["a.json", "b.txt", "c.json"])
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("a.json")) return JSON.stringify({ id: "p1" })
                if (p.endsWith("c.json")) return "CORRUPTED"
                return ""
            })
            expect(storage.readParts("m1")).toEqual([{ id: "p1" }])
        })
    })

    describe("hasContent", () => {
        test("handles boundary boundaries gracefully", () => {
            expect(storage.hasContent({ type: "thinking" } as never)).toBe(false)
            expect(storage.hasContent({ type: "system" } as never)).toBe(false)
            expect(storage.hasContent({ type: "tool" } as never)).toBe(true)
            expect(storage.hasContent({ type: "tool_use" } as never)).toBe(true)
            expect(storage.hasContent({ type: "tool_result" } as never)).toBe(true)
            expect(storage.hasContent({ type: "text", text: "  " } as never)).toBe(false)
            expect(storage.hasContent({ type: "text", text: "hi!" } as never)).toBe(true)
            expect(storage.hasContent({ type: "unknown" } as never)).toBe(false)
        })
    })

    describe("messageHasContent", () => {
        test("determines content correctly", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue(["a.json"])
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ type: "tool_use" }))
            expect(storage.messageHasContent("m1")).toBe(true)
        })
    })

    describe("injectTextPart", () => {
        test("bootstraps partial directories and writes part json safely", () => {
            mockFs.existsSync.mockReturnValue(false)
            mockFs.mkdirSync.mockImplementation(() => { })
            mockFs.writeFileSync.mockImplementation(() => { })

            expect(storage.injectTextPart("s1", "m1", "some text")).toBe(true)
            expect(mockFs.mkdirSync).toHaveBeenCalledWith(join("/mock/part", "m1"), { recursive: true })
            expect(mockFs.writeFileSync).toHaveBeenCalled()
        })
        test("catches persistence generic exceptions", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.writeFileSync.mockImplementation(() => { throw new Error("Disk Full") })
            expect(storage.injectTextPart("s1", "m1", "text")).toBe(false)
        })
    })

    describe("findEmptyMessages & variants", () => {
        test("findEmptyMessages collects structurally empty representations", () => {
            mockFs.existsSync.mockReturnValue(true)
            // msgDir -> m0 (empty no parts), m1 (only thinking)
            mockFs.readdirSync.mockImplementation((p: string) => {
                if (p.endsWith("s1")) return ["m0.json", "m1.json"]
                if (p.endsWith("m1")) return ["p.json"]
                return []
            })
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("m0.json")) return JSON.stringify({ id: "m0", role: "assistant" })
                if (p.endsWith("m1.json")) return JSON.stringify({ id: "m1", role: "assistant" })
                if (p.endsWith("p.json")) return JSON.stringify({ id: "p1", type: "thinking" })
                return "{}"
            })
            expect(storage.findEmptyMessages("s1")).toEqual(["m0", "m1"])
        })

        test("findFirstEmptyMessage and findEmptyMessageByIndex", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockImplementation((p: string) => {
                if (p.endsWith("s1")) return ["m0.json", "m1.json"]
                if (p.endsWith("m0")) return []
                if (p.endsWith("m1")) return ["p.json"]
                return []
            })
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("m0.json")) return JSON.stringify({ id: "m0" })
                if (p.endsWith("m1.json")) return JSON.stringify({ id: "m1" })
                if (p.endsWith("p.json")) return JSON.stringify({ id: "p1", type: "tool_use" }) // m1 is content
                return "{}"
            })

            expect(storage.findFirstEmptyMessage("s1")).toBe("m0") // m0 is empty

            // index 1 is m1. m1 has content. checks adjacent index 0. m0 has no content. returns m0
            expect(storage.findEmptyMessageByIndex("s1", 1)).toBe("m0")
            expect(storage.findEmptyMessageByIndex("s1", -99)).toBe(null) // out of bounds bounds check
            expect(storage.findEmptyMessageByIndex("s1", 99)).toBe(null) // skips fully
        })

        test("findFirstEmptyMessage returning null when all full", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockImplementation((p: string) => {
                if (p.endsWith("s1")) return ["m1.json"]
                if (p.endsWith("m1")) return ["p.json"]
                return []
            })
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("m1.json")) return JSON.stringify({ id: "m1" })
                if (p.endsWith("p.json")) return JSON.stringify({ id: "p1", type: "tool_use" })
                return "{}"
            })
            expect(storage.findFirstEmptyMessage("s1")).toBeNull()
        })
    })

    describe("thinking logic block helpers", () => {
        test("findMessagesWithThinkingBlocks grabs any blocks present properly mapped by assistant filters", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockImplementation((p: string) => {
                if (p.endsWith("s1")) return ["m0.json", "m1.json"]
                if (p.endsWith("m0")) return ["p.json"]
                return []
            })
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("m0.json")) return JSON.stringify({ id: "m0", role: "assistant" })
                if (p.endsWith("m1.json")) return JSON.stringify({ id: "m1", role: "user" })
                if (p.endsWith("p.json")) return JSON.stringify({ id: "p2", type: "thinking" })
                return "{}"
            })
            expect(storage.findMessagesWithThinkingBlocks("s1")).toEqual(["m0"]) // only assistant m0 has block
        })

        test("findMessagesWithThinkingOnly checks text availability on blocks accurately", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockImplementation((p: string) => {
                if (p.endsWith("s1")) return ["m1.json", "m2.json"]
                if (p.endsWith("m1")) return ["p.json", "p2.json"]
                if (p.endsWith("m2")) return ["p1.json"]
                return []
            })
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("m1.json")) return JSON.stringify({ id: "m1", role: "assistant" })
                if (p.endsWith("m2.json")) return JSON.stringify({ id: "m2", role: "assistant" })
                if (p.endsWith("m1/p.json")) return JSON.stringify({ id: "p1", type: "thinking" })
                if (p.endsWith("m1/p2.json")) return JSON.stringify({ id: "p2", type: "text", text: "  " }) // empty text => thinking only
                if (p.endsWith("m2/p1.json")) return JSON.stringify({ id: "px", type: "text", text: "valid" }) // text only
                return "{}"
            })
            expect(storage.findMessagesWithThinkingOnly("s1")).toEqual(["m1"])
        })

        test("findMessagesWithOrphanThinking ensures ordered mappings of chunk IDs specifically", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockImplementation((p: string) => {
                if (p.endsWith("s1")) return ["m1.json", "m2.json"] // test no-parts, and text-before-thinking
                if (p.endsWith("m1")) return ["pA.json", "pB.json"]
                return [] // m2 has no parts
            })
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("m1.json")) return JSON.stringify({ id: "m1", role: "assistant" })
                if (p.endsWith("m2.json")) return JSON.stringify({ id: "m2", role: "assistant" })
                if (p.endsWith("pA.json")) return JSON.stringify({ id: "p1_text", type: "text" })  // sort first alphabetically
                if (p.endsWith("pB.json")) return JSON.stringify({ id: "p2_think", type: "thinking" }) // sort second
                return "{}"
            })
            // m1 has text as first block, so thinking is orphaned. 
            expect(storage.findMessagesWithOrphanThinking("s1")).toEqual(["m1"])
        })

        test("findMessageByIndexNeedingThinking handles null returns and successful hits precisely", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockImplementation((p: string) => {
                if (p.endsWith("s1")) return ["m1.json", "m2.json", "m3.json"]
                if (p.endsWith("m1")) return ["p.json"]
                if (p.endsWith("m3")) return ["p3.json"]
                return []
            })
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("m1.json")) return JSON.stringify({ id: "m1", role: "assistant" })
                if (p.endsWith("m2.json")) return JSON.stringify({ id: "m2", role: "user" })
                if (p.endsWith("m3.json")) return JSON.stringify({ id: "m3", role: "assistant" })
                if (p.endsWith("p.json")) return JSON.stringify({ id: "px", type: "text" })  // first part is text!
                if (p.endsWith("p3.json")) return JSON.stringify({ id: "py", type: "thinking" }) // first part is thinking
                return "{}"
            })

            // index 0 -> m1 -> first part is text -> orphan! returns m1
            expect(storage.findMessageByIndexNeedingThinking("s1", 0)).toBe("m1")
            // index 1 -> m2 -> user -> returns null
            expect(storage.findMessageByIndexNeedingThinking("s1", 1)).toBe(null)
            // index 2 -> m3 -> first part is thinking -> returns null
            expect(storage.findMessageByIndexNeedingThinking("s1", 2)).toBe(null)
            // bad index -> null
            expect(storage.findMessageByIndexNeedingThinking("s1", 9)).toBe(null)
        })
    })

    describe("prependThinkingPart", () => {
        test("chains backward resolving correctly while injecting parts safely across failures", () => {
            // current index 2 -> c. Previous assistant is b, and a. b has empty thinking. a has valid thinking.
            mockFs.existsSync.mockImplementation((p: string) => {
                if (p.includes("mock/part/c")) return false;
                return true;
            })
            mockFs.mkdirSync.mockImplementation(() => { })
            mockFs.readdirSync.mockImplementation((p: string) => {
                if (p.endsWith("s1")) return ["a.json", "b.json", "c.json"]
                if (p.endsWith("a")) return ["p1.json"]
                if (p.endsWith("b")) return ["p2.json"]
                return []
            })
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("a.json")) return JSON.stringify({ id: "a", role: "assistant" })
                if (p.endsWith("b.json")) return JSON.stringify({ id: "b", role: "assistant" })
                if (p.endsWith("c.json")) return JSON.stringify({ id: "c", role: "assistant" })

                if (p.endsWith("p1.json")) return JSON.stringify({ id: "pt1", type: "reasoning", text: "valid thoughts" })
                // b part empty thinking mapped via reasoning text property:
                if (p.endsWith("p2.json")) return JSON.stringify({ id: "pt2", type: "reasoning", text: "  " })
                return "{}"
            })

            expect(storage.prependThinkingPart("s1", "c")).toBe(true)
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining("valid thoughts")
            )
            expect(mockFs.mkdirSync).toHaveBeenCalledWith(join("/mock/part", "c"), { recursive: true })
        })

        test("gracefully denies actions across failed serialization blocks dynamically", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue([]) // won't break loop logic
            mockFs.writeFileSync.mockImplementation(() => { throw new Error("I/O crash") })
            expect(storage.prependThinkingPart("s1", "m1")).toBe(false)
        })
    })

    describe("stripThinkingParts and textual replacement checks", () => {
        test("stripThinkingParts finds block identities appropriately", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue(["a.json", "b.json", "c.json"])
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("a.json")) return JSON.stringify({ id: "a", type: "text" })
                if (p.endsWith("b.json")) return JSON.stringify({ id: "b", type: "thinking" })
                if (p.endsWith("c.json")) return "INVALID_SYNTAX_THROW_CATCH"
                return ""
            })

            expect(storage.stripThinkingParts("m1")).toBe(true)
            expect(mockFs.unlinkSync).toHaveBeenCalledWith(join("/mock/part/m1", "b.json"))

            mockFs.existsSync.mockReturnValue(false)
            expect(storage.stripThinkingParts("m1")).toBe(false)
        })

        test("replaceEmptyTextParts injects strings successfully", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue(["a.json", "b.json"])
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("a.json")) return JSON.stringify({ id: "a", type: "text", text: " \n " }) // Empty string
                if (p.endsWith("b.json")) return "INVALID_JSON_CORRUPTION_BOUNDARY"
                return ""
            })

            expect(storage.replaceEmptyTextParts("m1", "some fix")).toBe(true)
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(join("/mock/part/m1", "a.json"), expect.stringContaining("some fix"))

            mockFs.existsSync.mockReturnValue(false)
            expect(storage.replaceEmptyTextParts("m1", "text")).toBe(false)
        })

        test("findMessagesWithEmptyTextParts scopes null arrays robustly without breaking", () => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockImplementation((p: string) => {
                if (p.endsWith("s1")) return ["m1.json", "m2.json"]
                if (p.endsWith("m1")) return ["a.json"]
                if (p.endsWith("m2")) return ["b.json"]
                return []
            })
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p.endsWith("m1.json")) return JSON.stringify({ id: "m1" })
                if (p.endsWith("m2.json")) return JSON.stringify({ id: "m2" })
                if (p.endsWith("a.json")) return JSON.stringify({ id: "a", type: "text", text: "" })
                if (p.endsWith("b.json")) return JSON.stringify({ id: "b", type: "thinking" })
                return ""
            })

            expect(storage.findMessagesWithEmptyTextParts("s1")).toEqual(["m1"])
        })
    })
})
