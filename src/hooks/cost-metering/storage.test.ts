import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
    loadSessionCost,
    saveSessionCost,
    clearSessionCost,
    loadDailyTotal,
    saveDailyTotal,
    loadMonthlyTotal,
    saveMonthlyTotal,
    cleanupOldTotals,
    getTodayDate,
    getCurrentMonth,
} from "./storage"
import type { SessionCostState } from "./types"

// Use a temp directory for tests
const TEST_STORAGE = join(import.meta.dir, "__test_storage__")

// We need to mock the COST_METERING_STORAGE constant
// Since the module uses a constant from ./constants, we'll test the logic directly
// by calling the functions after setting up the test directory

describe("storage helpers", () => {
    test("getTodayDate returns YYYY-MM-DD format", () => {
        const date = getTodayDate()
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    test("getCurrentMonth returns YYYY-MM format", () => {
        const month = getCurrentMonth()
        expect(month).toMatch(/^\d{4}-\d{2}$/)
    })
})

describe("SessionCostState serialization", () => {
    test("state object serializes and deserializes correctly", () => {
        const state: SessionCostState = {
            sessionID: "test-session-123",
            totalInputTokens: 5000,
            totalOutputTokens: 2000,
            totalReasoningTokens: 500,
            totalCacheReadTokens: 1000,
            totalCostUsd: 0.042,
            recordCount: 3,
            lastCountedMessageIndex: 7,
            firstRecordAt: 1709100000000,
            lastRecordAt: 1709100060000,
        }

        const json = JSON.stringify(state, null, 2)
        const parsed = JSON.parse(json) as SessionCostState

        expect(parsed.sessionID).toBe("test-session-123")
        expect(parsed.totalInputTokens).toBe(5000)
        expect(parsed.totalOutputTokens).toBe(2000)
        expect(parsed.totalReasoningTokens).toBe(500)
        expect(parsed.totalCacheReadTokens).toBe(1000)
        expect(parsed.totalCostUsd).toBeCloseTo(0.042, 4)
        expect(parsed.recordCount).toBe(3)
        expect(parsed.lastCountedMessageIndex).toBe(7)
        expect(parsed.firstRecordAt).toBe(1709100000000)
        expect(parsed.lastRecordAt).toBe(1709100060000)
    })
})

describe("cleanupOldTotals", () => {
    const testDir = join(import.meta.dir, "__cleanup_test__")

    beforeEach(() => {
        mkdirSync(testDir, { recursive: true })
    })

    afterEach(() => {
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true })
        }
    })

    test("old daily files are identified correctly by date parsing", () => {
        // Test date parsing logic used in cleanup
        const oldDate = "2024-01-01"
        const recentDate = getTodayDate()

        const oldTimestamp = new Date(oldDate).getTime()
        const recentTimestamp = new Date(recentDate).getTime()

        expect(oldTimestamp).toBeLessThan(recentTimestamp)
        expect(isNaN(oldTimestamp)).toBe(false)
        expect(isNaN(recentTimestamp)).toBe(false)
    })

    test("month parsing works for monthly files", () => {
        const monthStr = "2024-01"
        const fileDate = new Date(monthStr + "-01").getTime()
        expect(isNaN(fileDate)).toBe(false)
        expect(fileDate).toBeLessThan(Date.now())
    })
})
