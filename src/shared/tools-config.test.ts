import { describe, test, expect } from "bun:test"
import { parseToolsConfig } from "./tools-config"

describe("shared/tools-config", () => {
    test("returns undefined for empty/null input", () => {
        expect(parseToolsConfig()).toBeUndefined()
        expect(parseToolsConfig("")).toBeUndefined()
        expect(parseToolsConfig(undefined)).toBeUndefined()
    })

    test("parses single tool", () => {
        expect(parseToolsConfig("Bash")).toEqual({ bash: true })
    })

    test("parses multiple tools comma-separated", () => {
        expect(parseToolsConfig("Read,Write,Bash")).toEqual({ read: true, write: true, bash: true })
    })

    test("trims whitespace around each tool", () => {
        expect(parseToolsConfig("  Read , Write  ")).toEqual({ read: true, write: true })
    })

    test("lowercases all tool names", () => {
        expect(parseToolsConfig("ReadFile,WRITE,BaSh")).toEqual({ readfile: true, write: true, bash: true })
    })

    test("filters empty entries from trailing commas", () => {
        expect(parseToolsConfig("Read,,Write,")).toEqual({ read: true, write: true })
    })

    test("returns undefined for only commas/whitespace", () => {
        expect(parseToolsConfig(",,,")).toBeUndefined()
        expect(parseToolsConfig("  ,  ,  ")).toBeUndefined()
    })
})
