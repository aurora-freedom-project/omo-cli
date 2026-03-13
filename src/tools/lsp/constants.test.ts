import { describe, test, expect } from "bun:test"
import {
    SYMBOL_KIND_MAP,
    SEVERITY_MAP,
    DEFAULT_MAX_REFERENCES,
    DEFAULT_MAX_SYMBOLS,
    DEFAULT_MAX_DIAGNOSTICS,
    LSP_INSTALL_HINTS,
    BUILTIN_SERVERS,
    EXT_TO_LANG,
} from "./constants"

describe("lsp/constants", () => {
    describe("SYMBOL_KIND_MAP", () => {
        test("covers all 26 LSP SymbolKind values", () => {
            // #given / #when / #then
            // LSP spec defines SymbolKind 1-26
            for (let i = 1; i <= 26; i++) {
                expect(SYMBOL_KIND_MAP[i]).toBeDefined()
                expect(typeof SYMBOL_KIND_MAP[i]).toBe("string")
            }
        })

        test("maps known kinds correctly", () => {
            // #given / #when / #then
            expect(SYMBOL_KIND_MAP[5]).toBe("Class")
            expect(SYMBOL_KIND_MAP[6]).toBe("Method")
            expect(SYMBOL_KIND_MAP[12]).toBe("Function")
            expect(SYMBOL_KIND_MAP[13]).toBe("Variable")
        })
    })

    describe("SEVERITY_MAP", () => {
        test("covers all 4 LSP severity levels", () => {
            // #given / #when / #then
            expect(SEVERITY_MAP[1]).toBe("error")
            expect(SEVERITY_MAP[2]).toBe("warning")
            expect(SEVERITY_MAP[3]).toBe("information")
            expect(SEVERITY_MAP[4]).toBe("hint")
        })
    })

    describe("default limits", () => {
        test("limits are reasonable positive numbers", () => {
            // #given / #when / #then
            expect(DEFAULT_MAX_REFERENCES).toBeGreaterThanOrEqual(50)
            expect(DEFAULT_MAX_SYMBOLS).toBeGreaterThanOrEqual(50)
            expect(DEFAULT_MAX_DIAGNOSTICS).toBeGreaterThanOrEqual(50)
        })
    })

    describe("LSP_INSTALL_HINTS", () => {
        test("has hints for major servers", () => {
            // #given / #when / #then
            expect(LSP_INSTALL_HINTS["typescript"]).toContain("npm")
            expect(LSP_INSTALL_HINTS["gopls"]).toContain("go install")
            expect(LSP_INSTALL_HINTS["rust"]).toContain("rustup")
            expect(LSP_INSTALL_HINTS["basedpyright"]).toContain("pip")
        })

        test("all hints are non-empty strings", () => {
            // #given / #when / #then
            for (const [key, hint] of Object.entries(LSP_INSTALL_HINTS)) {
                expect(typeof hint).toBe("string")
                expect(hint.length).toBeGreaterThan(5)
            }
        })
    })

    describe("BUILTIN_SERVERS", () => {
        test("has configuration for major languages", () => {
            // #given / #when / #then
            expect(BUILTIN_SERVERS["typescript"]).toBeDefined()
            expect(BUILTIN_SERVERS["gopls"]).toBeDefined()
            expect(BUILTIN_SERVERS["rust"]).toBeDefined()
            expect(BUILTIN_SERVERS["basedpyright"]).toBeDefined()
        })

        test("all servers have command and extensions", () => {
            // #given / #when / #then
            for (const [id, config] of Object.entries(BUILTIN_SERVERS)) {
                expect(config.command.length).toBeGreaterThan(0)
                expect(config.extensions.length).toBeGreaterThan(0)
            }
        })

        test("typescript server handles common extensions", () => {
            // #given / #when / #then
            const ts = BUILTIN_SERVERS["typescript"]
            expect(ts.extensions).toContain(".ts")
            expect(ts.extensions).toContain(".tsx")
            expect(ts.extensions).toContain(".js")
            expect(ts.extensions).toContain(".jsx")
        })
    })

    describe("EXT_TO_LANG", () => {
        test("maps TypeScript extensions", () => {
            // #given / #when / #then
            expect(EXT_TO_LANG[".ts"]).toBe("typescript")
            expect(EXT_TO_LANG[".tsx"]).toBe("typescriptreact")
            expect(EXT_TO_LANG[".mts"]).toBe("typescript")
        })

        test("maps Python extension", () => {
            // #given / #when / #then
            expect(EXT_TO_LANG[".py"]).toBe("python")
        })

        test("maps JavaScript extensions", () => {
            // #given / #when / #then
            expect(EXT_TO_LANG[".js"]).toBe("javascript")
            expect(EXT_TO_LANG[".jsx"]).toBe("javascriptreact")
            expect(EXT_TO_LANG[".mjs"]).toBe("javascript")
        })

        test("maps Rust extension", () => {
            // #given / #when / #then
            expect(EXT_TO_LANG[".rs"]).toBe("rust")
        })

        test("maps C/C++ header extensions", () => {
            // #given / #when / #then
            expect(EXT_TO_LANG[".h"]).toBe("c")
            expect(EXT_TO_LANG[".hpp"]).toBe("cpp")
        })

        test("has reasonable total count of extension mappings", () => {
            // #given / #when / #then
            const count = Object.keys(EXT_TO_LANG).length
            expect(count).toBeGreaterThan(60)
        })
    })
})
