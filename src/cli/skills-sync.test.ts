import { describe, it, expect, mock, beforeEach } from "bun:test"

// Mock all dependencies before import
const mockExecSync = mock(() => {})
const mockExistsSync = mock(() => false)
const mockMkdirSync = mock(() => {})
const mockWriteFileSync = mock(() => {})

mock.module("child_process", () => ({ execSync: mockExecSync }))
mock.module("fs", () => ({
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
}))
mock.module("@clack/prompts", () => ({
    log: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}), message: mock(() => {}) },
}))

const mockSanitizeAndSync = mock(() => Promise.resolve([]))
mock.module("../features/opencode-skill-loader/validator", () => ({
    SkillValidator: class { sanitizeAndSync = mockSanitizeAndSync },
}))
mock.module("./skills-setup", () => ({
    UNIFIED_SKILLS_DIR: "/tmp/test-unified-skills",
    ensureUnifiedSkillsDirectory: mock(() => {}),
}))
mock.module("../shared", () => ({
    getOpenCodeConfigDir: () => "/tmp/test-config",
    log: mock(() => {}),
}))

import { syncSkills } from "./skills-sync"

describe("syncSkills", () => {
    beforeEach(() => {
        mockExecSync.mockClear()
        mockExistsSync.mockClear()
        mockMkdirSync.mockClear()
        mockWriteFileSync.mockClear()
        mockSanitizeAndSync.mockClear()
    })

    it("throws when git init fails during initial clone", async () => {
        // No .git dir exists → triggers init path
        mockExistsSync.mockReturnValue(false)
        mockExecSync.mockImplementation(() => { throw new Error("git init failed") })

        await expect(syncSkills()).rejects.toThrow("Failed to initialize shadow clone")
    })

    it("throws when git pull fails during update", async () => {
        // .git dir exists → triggers update path
        mockExistsSync.mockImplementation(((path: unknown) => {
            if (typeof path === "string" && path.includes(".git")) return true
            return false
        }) as () => boolean)
        mockExecSync.mockImplementation(() => { throw new Error("network error") })

        await expect(syncSkills()).rejects.toThrow("Failed to update shadow clone")
    })

    it("throws when skills directory not found after clone", async () => {
        // .git exists, git pull succeeds, but source skills dir doesn't exist
        mockExistsSync.mockImplementation(((path: unknown) => {
            if (typeof path === "string" && path.includes(".git")) return true
            return false // skills dir doesn't exist
        }) as () => boolean)
        mockExecSync.mockReturnValue(undefined)

        await expect(syncSkills()).rejects.toThrow("Failed to find 'skills' directory")
    })

    it("succeeds when sync completes", async () => {
        mockExistsSync.mockReturnValue(true) // .git exists, skills dir exists
        mockExecSync.mockReturnValue(undefined)
        mockSanitizeAndSync.mockResolvedValue([
            { action: "COPIED", name: "skill1" } as never,
            { action: "FIXED_YAML", name: "skill2" } as never,
        ])

        await expect(syncSkills()).resolves.toBeUndefined()
    })
})
