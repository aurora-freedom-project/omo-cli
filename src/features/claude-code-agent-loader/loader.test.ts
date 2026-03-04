import {  describe, expect, test, mock, afterAll } from "bun:test"

afterAll(() => { mock.restore() })

// Mock fs/path for agent loader
mock.module("fs", () => ({
    existsSync: mock((path: string) => false),
    readdirSync: mock(() => []),
    readFileSync: mock(() => ""),
}))
mock.module("node:fs", () => ({
    existsSync: mock((path: string) => false),
    readdirSync: mock(() => []),
    readFileSync: mock(() => ""),
}))

mock.module("node:fs/promises", () => ({
    access: mock((path: string) => false),
    readdirSync: mock(() => []),
    readFile: mock(() => ""),
}))

mock.module("../../shared", () => ({
    getClaudeConfigDir: mock(() => "/tmp/test-claude"),
}))

import { loadUserAgents, loadProjectAgents } from "./loader"

describe("claude-code-agent-loader", () => {
    describe("loadUserAgents", () => {
        test("returns empty object when agents dir does not exist", () => {
            const result = loadUserAgents()
            expect(result).toEqual({})
        })
    })

    describe("loadProjectAgents", () => {
        test("returns empty object when agents dir does not exist", () => {
            const result = loadProjectAgents()
            expect(result).toEqual({})
        })
    })
})
