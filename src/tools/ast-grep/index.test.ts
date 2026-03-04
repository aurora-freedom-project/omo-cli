import { describe, expect, test } from "bun:test"
import { builtinTools } from "./index"

describe("ast-grep tool", () => {
    test("exports builtinTools with ast_grep_search and ast_grep_replace", () => {
        expect(builtinTools).toBeDefined()
        expect(builtinTools.ast_grep_search).toBeDefined()
        expect(builtinTools.ast_grep_replace).toBeDefined()
    })

    test("ast_grep_search has correct tool definition shape", () => {
        const tool = builtinTools.ast_grep_search
        expect(tool.description).toBeDefined()
        expect(typeof tool.description).toBe("string")
    })

    test("ast_grep_replace has correct tool definition shape", () => {
        const tool = builtinTools.ast_grep_replace
        expect(tool.description).toBeDefined()
        expect(typeof tool.description).toBe("string")
    })
})
