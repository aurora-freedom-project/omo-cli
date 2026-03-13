import { describe, test, expect } from "bun:test"
import { formatSearchResult, formatReplaceResult, formatAnalyzeResult, formatTransformResult } from "./utils"
import type { SgResult, AnalyzeResult } from "./types"

describe("ast-grep/utils", () => {
    const makeMatch = (file: string, line: number, text: string, lines: string) => ({
        file,
        text,
        range: {
            byteOffset: { start: 0, end: text.length },
            start: { line, column: 0 },
            end: { line, column: text.length },
        },
        lines,
        charCount: { leading: 0, trailing: 0 },
        language: "typescript",
    })

    describe("formatSearchResult", () => {
        test("formats empty result", () => {
            const result: SgResult = { matches: [], totalMatches: 0, truncated: false }
            expect(formatSearchResult(result)).toBe("No matches found")
        })

        test("formats error result", () => {
            const result: SgResult = { matches: [], totalMatches: 0, truncated: false, error: "sg not found" }
            expect(formatSearchResult(result)).toBe("Error: sg not found")
        })

        test("formats single match", () => {
            const result: SgResult = {
                matches: [makeMatch("src/foo.ts", 5, "console.log(x)", "  console.log(x)")],
                totalMatches: 1,
                truncated: false,
            }
            const output = formatSearchResult(result)
            expect(output).toContain("Found 1 match(es)")
            expect(output).toContain("src/foo.ts:6:1")
            expect(output).toContain("console.log(x)")
        })

        test("shows truncation notice for max_matches", () => {
            const result: SgResult = {
                matches: [makeMatch("a.ts", 0, "x", "x")],
                totalMatches: 500,
                truncated: true,
                truncatedReason: "max_matches",
            }
            const output = formatSearchResult(result)
            expect(output).toContain("[TRUNCATED]")
            expect(output).toContain("showing first 1 of 500")
        })

        test("shows truncation notice for max_output_bytes", () => {
            const result: SgResult = {
                matches: [makeMatch("a.ts", 0, "x", "x")],
                totalMatches: 1,
                truncated: true,
                truncatedReason: "max_output_bytes",
            }
            expect(formatSearchResult(result)).toContain("1MB limit")
        })
    })

    describe("formatReplaceResult", () => {
        test("formats empty result", () => {
            const result: SgResult = { matches: [], totalMatches: 0, truncated: false }
            expect(formatReplaceResult(result, true)).toBe("No matches found to replace")
        })

        test("formats dry-run replacements", () => {
            const result: SgResult = {
                matches: [makeMatch("src/bar.ts", 10, "newCall()", "  newCall()")],
                totalMatches: 1,
                truncated: false,
            }
            const output = formatReplaceResult(result, true)
            expect(output).toContain("[DRY RUN]")
            expect(output).toContain("1 replacement(s)")
            expect(output).toContain("Use dryRun=false to apply changes")
        })

        test("formats live replacements without dry-run hint", () => {
            const result: SgResult = {
                matches: [makeMatch("src/bar.ts", 10, "newCall()", "  newCall()")],
                totalMatches: 1,
                truncated: false,
            }
            const output = formatReplaceResult(result, false)
            expect(output).not.toContain("[DRY RUN]")
            expect(output).not.toContain("Use dryRun=false")
        })
    })

    describe("formatAnalyzeResult", () => {
        test("formats empty result", () => {
            expect(formatAnalyzeResult([], false)).toBe("No matches found")
        })

        test("formats results without meta-variables", () => {
            const results: AnalyzeResult[] = [{
                text: "const x = 1",
                range: { start: { line: 0, column: 0 }, end: { line: 0, column: 11 } },
                kind: "variable_declaration",
                metaVariables: [],
            }]
            const output = formatAnalyzeResult(results, false)
            expect(output).toContain("Found 1 match(es)")
            expect(output).toContain("(variable_declaration)")
        })

        test("formats results with meta-variables", () => {
            const results: AnalyzeResult[] = [{
                text: "const x = 1",
                range: { start: { line: 0, column: 0 }, end: { line: 0, column: 11 } },
                kind: "variable_declaration",
                metaVariables: [{ name: "NAME", text: "x", kind: "identifier" }],
            }]
            const output = formatAnalyzeResult(results, true)
            expect(output).toContain("$NAME = \"x\"")
            expect(output).toContain("(identifier)")
        })
    })

    describe("formatTransformResult", () => {
        test("formats no-match result", () => {
            expect(formatTransformResult("original", "original", 0)).toBe("No matches found to transform")
        })

        test("formats transformation result", () => {
            const output = formatTransformResult("old code", "new code", 3)
            expect(output).toContain("Transformed (3 edit(s))")
            expect(output).toContain("new code")
        })
    })
})
