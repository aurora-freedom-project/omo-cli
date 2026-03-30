import { describe, it, expect, mock, beforeEach } from "bun:test"

// Mock dependencies
const mockIsConnected = mock(() => Promise.resolve(false))
const mockGetCodeOverview = mock(() => Promise.resolve({
    fileCount: 0,
    exportCount: 0,
    elementCounts: [],
}))

mock.module("./memory/surreal-client", () => ({
    isConnected: mockIsConnected,
    getCodeOverview: mockGetCodeOverview,
}))
mock.module("../features/code-intel/indexer", () => ({
    indexProject: mock(() => Promise.resolve({
        filesScanned: 10,
        filesSkipped: 5,
        elementsIndexed: 42,
        relationsIndexed: 20,
        durationMs: 1234,
        errors: [],
    })),
}))
mock.module("@clack/prompts", () => ({
    intro: mock(() => {}),
    outro: mock(() => {}),
    spinner: () => ({ start: mock(() => {}), stop: mock(() => {}) }),
    log: {
        info: mock(() => {}),
        error: mock(() => {}),
        warn: mock(() => {}),
        message: mock(() => {}),
        success: mock(() => {}),
    },
}))

import { createIndexCommand } from "./index-codebase"

describe("createIndexCommand", () => {
    beforeEach(() => {
        mockIsConnected.mockClear()
        mockGetCodeOverview.mockClear()
    })

    it("returns a Command instance", () => {
        const cmd = createIndexCommand()
        expect(cmd.name()).toBe("index")
    })

    it("has expected options", () => {
        const cmd = createIndexCommand()
        const opts = cmd.options.map(o => o.long)
        expect(opts).toContain("--vector")
        expect(opts).toContain("--stats")
        expect(opts).toContain("--rebuild")
    })
})
