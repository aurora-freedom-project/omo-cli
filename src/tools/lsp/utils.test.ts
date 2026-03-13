import { describe, test, expect } from "bun:test"
import {
    findWorkspaceRoot,
    uriToPath,
    formatLocation,
    formatSymbolKind,
    formatSeverity,
    formatDocumentSymbol,
    formatSymbolInfo,
    formatDiagnostic,
    filterDiagnosticsBySeverity,
    formatServerLookupError,
    formatPrepareRenameResult,
    formatTextEdit,
    formatWorkspaceEdit,
    formatApplyResult,
} from "./utils"
import type {
    Location,
    LocationLink,
    DocumentSymbol,
    SymbolInfo,
    Diagnostic,
    Range,
    WorkspaceEdit,
    TextEdit,
} from "./types"
import type { ApplyResult } from "./utils"

describe("lsp/utils", () => {
    describe("uriToPath", () => {
        test("converts file:// URI to path", () => {
            // #given / #when
            const path = uriToPath("file:///Users/mike/test.ts")

            // #then
            expect(path).toBe("/Users/mike/test.ts")
        })

        test("handles non-file URI by stripping protocol", () => {
            // #given / #when
            const path = uriToPath("file:///tmp/foo.ts")

            // #then
            expect(path).toBe("/tmp/foo.ts")
        })
    })

    describe("formatLocation", () => {
        test("formats Location with file path and line range", () => {
            // #given
            const loc: Location = {
                uri: "file:///Users/mike/test.ts",
                range: {
                    start: { line: 9, character: 0 },
                    end: { line: 9, character: 10 },
                },
            }

            // #when
            const result = formatLocation(loc)

            // #then
            expect(result).toContain("test.ts")
            expect(result).toContain("10") // 1-based line display
        })

        test("formats LocationLink with targetUri", () => {
            // #given
            const link: LocationLink = {
                targetUri: "file:///Users/mike/target.ts",
                targetRange: {
                    start: { line: 4, character: 0 },
                    end: { line: 4, character: 20 },
                },
                targetSelectionRange: {
                    start: { line: 4, character: 5 },
                    end: { line: 4, character: 15 },
                },
            }

            // #when
            const result = formatLocation(link)

            // #then
            expect(result).toContain("target.ts")
            expect(result).toContain("5") // 1-based line
        })
    })

    describe("formatSymbolKind", () => {
        test("maps known SymbolKind to name", () => {
            // #given / #when / #then
            expect(formatSymbolKind(5)).toBe("Class")
            expect(formatSymbolKind(12)).toBe("Function")
            expect(formatSymbolKind(13)).toBe("Variable")
        })

        test("returns Unknown for unrecognized kind", () => {
            // #given / #when / #then
            expect(formatSymbolKind(999)).toContain("Unknown")
        })
    })

    describe("formatSeverity", () => {
        test("maps severity numbers to labels", () => {
            // #given / #when / #then
            expect(formatSeverity(1)).toBe("error")
            expect(formatSeverity(2)).toBe("warning")
            expect(formatSeverity(3)).toBe("information")
            expect(formatSeverity(4)).toBe("hint")
        })

        test("returns unknown for undefined severity", () => {
            // #given / #when / #then
            expect(formatSeverity(undefined)).toBe("unknown")
        })
    })

    describe("formatDocumentSymbol", () => {
        test("formats single symbol without children", () => {
            // #given
            const symbol: DocumentSymbol = {
                name: "myFunction",
                kind: 12, // Function
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
                selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 19 } },
            }

            // #when
            const result = formatDocumentSymbol(symbol)

            // #then
            expect(result).toContain("myFunction")
            expect(result).toContain("Function")
        })

        test("formats symbol with children (indent)", () => {
            // #given
            const symbol: DocumentSymbol = {
                name: "MyClass",
                kind: 5, // Class
                range: { start: { line: 0, character: 0 }, end: { line: 20, character: 0 } },
                selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } },
                children: [
                    {
                        name: "method1",
                        kind: 6, // Method
                        range: { start: { line: 2, character: 0 }, end: { line: 5, character: 0 } },
                        selectionRange: { start: { line: 2, character: 2 }, end: { line: 2, character: 9 } },
                    },
                ],
            }

            // #when
            const result = formatDocumentSymbol(symbol)

            // #then
            expect(result).toContain("MyClass")
            expect(result).toContain("method1")
        })
    })

    describe("formatSymbolInfo", () => {
        test("formats workspace symbol", () => {
            // #given
            const symbol: SymbolInfo = {
                name: "globalVar",
                kind: 13, // Variable
                location: {
                    uri: "file:///Users/mike/main.ts",
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
                },
            }

            // #when
            const result = formatSymbolInfo(symbol)

            // #then
            expect(result).toContain("globalVar")
            expect(result).toContain("Variable")
        })
    })

    describe("formatDiagnostic", () => {
        test("formats error diagnostic with source", () => {
            // #given
            const diag: Diagnostic = {
                range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
                severity: 1,
                code: "TS2345",
                source: "ts",
                message: "Argument of type 'string' is not assignable",
            }

            // #when
            const result = formatDiagnostic(diag)

            // #then
            expect(result).toContain("error")
            expect(result).toContain("TS2345")
            expect(result).toContain("Argument of type")
        })

        test("formats diagnostic without source", () => {
            // #given
            const diag: Diagnostic = {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                message: "Unexpected token",
            }

            // #when
            const result = formatDiagnostic(diag)

            // #then
            expect(result).toContain("Unexpected token")
        })
    })

    describe("filterDiagnosticsBySeverity", () => {
        const diagnostics: Diagnostic[] = [
            { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 1, message: "err" },
            { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } }, severity: 2, message: "warn" },
            { range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } }, severity: 3, message: "info" },
            { range: { start: { line: 3, character: 0 }, end: { line: 3, character: 1 } }, severity: 4, message: "hint" },
        ]

        test("returns all diagnostics when filter is 'all'", () => {
            // #given / #when
            const result = filterDiagnosticsBySeverity(diagnostics, "all")

            // #then
            expect(result).toHaveLength(4)
        })

        test("filters errors only", () => {
            // #given / #when
            const result = filterDiagnosticsBySeverity(diagnostics, "error")

            // #then
            expect(result).toHaveLength(1)
            expect(result[0].message).toBe("err")
        })

        test("filters warnings only", () => {
            // #given / #when
            const result = filterDiagnosticsBySeverity(diagnostics, "warning")

            // #then
            expect(result).toHaveLength(1)
            expect(result[0].message).toBe("warn")
        })

        test("returns all when no filter specified", () => {
            // #given / #when
            const result = filterDiagnosticsBySeverity(diagnostics)

            // #then
            expect(result).toHaveLength(4)
        })
    })

    describe("formatServerLookupError", () => {
        test("formats not_configured error", () => {
            // #given / #when
            const result = formatServerLookupError({
                status: "not_configured",
                extension: ".xyz",
                availableServers: ["typescript", "gopls"],
            })

            // #then
            expect(result).toContain(".xyz")
        })

        test("formats not_installed error", () => {
            // #given / #when
            const result = formatServerLookupError({
                status: "not_installed",
                server: {
                    id: "typescript",
                    command: ["typescript-language-server"],
                    extensions: [".ts"],
                },
                installHint: "npm install -g typescript-language-server",
            })

            // #then
            expect(result).toContain("npm install")
        })
    })

    describe("formatTextEdit", () => {
        test("formats a text edit", () => {
            // #given
            const edit: TextEdit = {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
                newText: "hello",
            }

            // #when
            const result = formatTextEdit(edit)

            // #then
            expect(result).toContain("hello")
            expect(result).toContain("1") // 1-based line
        })
    })

    describe("formatWorkspaceEdit", () => {
        test("returns 'No changes' for null edit", () => {
            // #given / #when
            const result = formatWorkspaceEdit(null)

            // #then
            expect(result).toContain("No changes")
        })

        test("formats edit with changes", () => {
            // #given
            const edit: WorkspaceEdit = {
                changes: {
                    "file:///test.ts": [
                        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: "bar" },
                    ],
                },
            }

            // #when
            const result = formatWorkspaceEdit(edit)

            // #then
            expect(result).toContain("test.ts")
        })
    })

    describe("formatApplyResult", () => {
        test("formats successful apply", () => {
            // #given
            const result: ApplyResult = {
                success: true,
                filesModified: ["test.ts", "utils.ts"],
                totalEdits: 5,
                errors: [],
            }

            // #when
            const formatted = formatApplyResult(result)

            // #then
            expect(formatted).toContain("2") // files
            expect(formatted).toContain("5") // edits
        })

        test("formats apply with errors", () => {
            // #given
            const result: ApplyResult = {
                success: false,
                filesModified: [],
                totalEdits: 0,
                errors: ["File not found: missing.ts"],
            }

            // #when
            const formatted = formatApplyResult(result)

            // #then
            expect(formatted).toContain("missing.ts")
        })
    })
})
