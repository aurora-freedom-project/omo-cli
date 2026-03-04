import { describe, it, expect } from "bun:test"
import type { GetLocalVersionOptions, VersionInfo } from "./types"
import { formatVersionOutput, formatJsonOutput } from "./formatter"

describe("get-local-version", () => {
    describe("VersionInfo type contract", () => {
        it("represents local dev mode", () => {
            const info: VersionInfo = {
                currentVersion: "3.2.13",
                latestVersion: null,
                isUpToDate: false,
                isLocalDev: true,
                isPinned: false,
                pinnedVersion: null,
                status: "local-dev",
            }
            expect(info.isLocalDev).toBe(true)
            expect(info.status).toBe("local-dev")
        })

        it("represents up-to-date version", () => {
            const info: VersionInfo = {
                currentVersion: "3.2.13",
                latestVersion: "3.2.13",
                isUpToDate: true,
                isLocalDev: false,
                isPinned: false,
                pinnedVersion: null,
                status: "up-to-date",
            }
            expect(info.isUpToDate).toBe(true)
            expect(info.status).toBe("up-to-date")
        })

        it("represents outdated version", () => {
            const info: VersionInfo = {
                currentVersion: "3.2.10",
                latestVersion: "3.2.13",
                isUpToDate: false,
                isLocalDev: false,
                isPinned: false,
                pinnedVersion: null,
                status: "outdated",
            }
            expect(info.isUpToDate).toBe(false)
            expect(info.status).toBe("outdated")
        })

        it("represents pinned version", () => {
            const info: VersionInfo = {
                currentVersion: "3.2.10",
                latestVersion: null,
                isUpToDate: false,
                isLocalDev: false,
                isPinned: true,
                pinnedVersion: "3.2.10",
                status: "pinned",
            }
            expect(info.isPinned).toBe(true)
            expect(info.pinnedVersion).toBe("3.2.10")
        })
    })

    describe("formatVersionOutput", () => {
        it("formats up-to-date version", () => {
            const info: VersionInfo = {
                currentVersion: "3.2.13",
                latestVersion: "3.2.13",
                isUpToDate: true,
                isLocalDev: false,
                isPinned: false,
                pinnedVersion: null,
                status: "up-to-date",
            }
            const output = formatVersionOutput(info)
            expect(typeof output).toBe("string")
            expect(output.length).toBeGreaterThan(0)
        })

        it("formats local-dev version", () => {
            const info: VersionInfo = {
                currentVersion: "3.2.13-dev",
                latestVersion: null,
                isUpToDate: false,
                isLocalDev: true,
                isPinned: false,
                pinnedVersion: null,
                status: "local-dev",
            }
            const output = formatVersionOutput(info)
            expect(output).toContain("3.2.13-dev")
        })
    })

    describe("formatJsonOutput", () => {
        it("returns valid JSON string", () => {
            const info: VersionInfo = {
                currentVersion: "3.2.13",
                latestVersion: "3.2.13",
                isUpToDate: true,
                isLocalDev: false,
                isPinned: false,
                pinnedVersion: null,
                status: "up-to-date",
            }
            const output = formatJsonOutput(info)
            const parsed = JSON.parse(output)
            expect(parsed.currentVersion).toBe("3.2.13")
            expect(parsed.status).toBe("up-to-date")
        })
    })
})
