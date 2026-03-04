import { describe, it, expect } from "bun:test"
import { getDataDir, getOpenCodeStorageDir, getCacheDir, getOmoOpenCodeCacheDir, getOpenCodeCacheDir } from "./data-path"

describe("data-path", () => {
    it("getDataDir returns XDG_DATA_HOME when set", () => {
        const original = process.env.XDG_DATA_HOME
        process.env.XDG_DATA_HOME = "/custom/data"
        try {
            expect(getDataDir()).toBe("/custom/data")
        } finally {
            if (original !== undefined) process.env.XDG_DATA_HOME = original
            else delete process.env.XDG_DATA_HOME
        }
    })

    it("getDataDir returns default when XDG_DATA_HOME not set", () => {
        const original = process.env.XDG_DATA_HOME
        delete process.env.XDG_DATA_HOME
        try {
            const result = getDataDir()
            expect(result).toContain(".local/share")
        } finally {
            if (original !== undefined) process.env.XDG_DATA_HOME = original
        }
    })

    it("getOpenCodeStorageDir includes opencode/storage", () => {
        expect(getOpenCodeStorageDir()).toContain("opencode/storage")
    })

    it("getCacheDir returns default path", () => {
        const original = process.env.XDG_CACHE_HOME
        delete process.env.XDG_CACHE_HOME
        try {
            expect(getCacheDir()).toContain(".cache")
        } finally {
            if (original !== undefined) process.env.XDG_CACHE_HOME = original
        }
    })

    it("getOmoOpenCodeCacheDir includes omo-cli", () => {
        expect(getOmoOpenCodeCacheDir()).toContain("omo-cli")
    })

    it("getOpenCodeCacheDir includes opencode", () => {
        expect(getOpenCodeCacheDir()).toContain("opencode")
    })
})
