import { describe, expect, test, mock, afterAll } from "bun:test"

afterAll(() => { mock.restore() })

mock.module("fs", () => ({
    existsSync: mock(() => false),
    readdirSync: mock(() => []),
    readFileSync: mock(() => ""),
}))
mock.module("node:fs", () => ({
    existsSync: mock(() => false),
    readdirSync: mock(() => []),
    readFileSync: mock(() => ""),
}))

mock.module("node:fs/promises", () => ({
    access: mock(() => false),
    readdirSync: mock(() => []),
    readFile: mock(() => ""),
}))

mock.module("../../shared", () => ({
    getClaudeConfigDir: mock(() => "/tmp/test-claude"),
}))

import { loadUserCommands, loadProjectCommands } from "./loader"

describe("claude-code-command-loader", () => {
    describe("loadUserCommands", () => {
        test("returns empty object when commands dir does not exist", () => {
            const result = loadUserCommands()
            expect(result).toEqual({} as never)
        })
    })

    describe("loadProjectCommands", () => {
        test("returns empty object when commands dir does not exist", () => {
            const result = loadProjectCommands()
            expect(result).toEqual({} as never)
        })
    })
})
