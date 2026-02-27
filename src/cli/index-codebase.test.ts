import { describe, test, expect, mock, beforeEach } from "bun:test"

// Mock dependencies
const mockLog = mock(() => { })
mock.module("../../shared/logger", () => ({ log: mockLog }))

// Mock isConnected and getCodeOverview
const mockIsConnected = mock(async () => true)
const mockGetCodeOverview = mock(async () => ({
    fileCount: 42,
    elementCounts: [
        { kind: "function", count: 120 },
        { kind: "class", count: 15 },
        { kind: "interface", count: 25 },
    ],
    exportCount: 80,
}))

mock.module("./memory/surreal-client", () => ({
    isConnected: mockIsConnected,
    getCodeOverview: mockGetCodeOverview,
}))

// Mock indexer
const mockIndexProject = mock(async () => ({
    filesScanned: 50,
    filesSkipped: 10,
    elementsIndexed: 200,
    relationsIndexed: 45,
    durationMs: 1500,
    errors: [],
}))
mock.module("../features/code-intel/indexer", () => ({
    indexProject: mockIndexProject,
}))

import { createIndexCommand } from "./index-codebase"

describe("index-codebase CLI", () => {
    beforeEach(() => {
        mockLog.mockClear()
        mockIsConnected.mockClear()
        mockGetCodeOverview.mockClear()
        mockIndexProject.mockClear()
    })

    test("createIndexCommand returns a Command", () => {
        const cmd = createIndexCommand()
        expect(cmd).toBeDefined()
        expect(cmd.name()).toBe("index")
    })

    test("command has correct description", () => {
        const cmd = createIndexCommand()
        expect(cmd.description()).toContain("Index")
    })

    test("command has --vector option", () => {
        const cmd = createIndexCommand()
        const opts = cmd.options.map(o => o.long)
        expect(opts).toContain("--vector")
    })

    test("command has --stats option", () => {
        const cmd = createIndexCommand()
        const opts = cmd.options.map(o => o.long)
        expect(opts).toContain("--stats")
    })

    test("command has --rebuild option", () => {
        const cmd = createIndexCommand()
        const opts = cmd.options.map(o => o.long)
        expect(opts).toContain("--rebuild")
    })
})
