import { describe, it, expect } from "bun:test"
import {
    formatSnippet,
    formatContext,
    type CodeSnippet,
} from "./index"

describe("RAG Enricher", () => {
    describe("formatSnippet", () => {
        it("formats a basic snippet", () => {
            const snippet: CodeSnippet = {
                name: "createUser",
                kind: "function",
                file: "src/users.ts",
                signature: "function createUser(name: string): User",
            }
            const result = formatSnippet(snippet)
            expect(result).toContain("[Code: createUser | src/users.ts]")
            expect(result).toContain("Kind: function")
            expect(result).toContain("function createUser")
        })

        it("includes graph context when present", () => {
            const snippet: CodeSnippet = {
                name: "createUser",
                kind: "function",
                file: "src/users.ts",
                signature: "function createUser(name: string): User",
                graph: {
                    callers: ["handleRegister", "importUsers"],
                    callees: [],
                    imports: ["utils.ts"],
                },
            }
            const result = formatSnippet(snippet)
            expect(result).toContain("Graph Context")
            expect(result).toContain("Called by: handleRegister, importUsers")
            expect(result).toContain("Imports: utils.ts")
        })

        it("includes docstring when present", () => {
            const snippet: CodeSnippet = {
                name: "foo",
                kind: "function",
                file: "src/foo.ts",
                signature: "function foo()",
                docstring: "A helpful function",
            }
            const result = formatSnippet(snippet)
            expect(result).toContain("Doc: A helpful function")
        })
    })

    describe("formatContext", () => {
        it("returns empty for no snippets", () => {
            expect(formatContext([])).toBe("")
        })

        it("formats multiple snippets with header", () => {
            const snippets: CodeSnippet[] = [
                { name: "a", kind: "function", file: "a.ts", signature: "fn a()" },
                { name: "b", kind: "class", file: "b.ts", signature: "class B" },
            ]
            const result = formatContext(snippets)
            expect(result).toContain("Codebase Context (RAG)")
            expect(result).toContain("[Code: a |")
            expect(result).toContain("[Code: b |")
        })
    })
})
