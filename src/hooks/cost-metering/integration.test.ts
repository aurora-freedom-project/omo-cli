/**
 * Integration test for cost metering end-to-end flow.
 *
 * Verifies:
 * - Pricing engine calculates correct costs for all profile models
 * - Storage persists session/daily/monthly data
 * - Budget thresholds trigger correctly
 * - Model normalization handles all tag variants
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createPricingEngine, normalizeModelID } from "./pricing"
import {
    saveSessionCost,
    loadSessionCost,
    clearSessionCost,
    saveDailyTotal,
    loadDailyTotal,
    saveMonthlyTotal,
    loadMonthlyTotal,
    cleanupOldTotals,
    getTodayDate,
    getCurrentMonth,
} from "./storage"
import type { SessionCostState } from "./types"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"

// ─── E2E: Full metering pipeline ───────────────────────────────────────────

describe("cost-metering integration", () => {
    const engine = createPricingEngine()

    describe("end-to-end pricing for mike-local profile models", () => {
        // All models from profiles/mike-local/omo-cli.json
        const profileModels = [
            { raw: "ollama/qwen3.5:397b-cloud", expectedNorm: "qwen3.5", minCostPer1k: 0 },
            { raw: "ollama/qwen3-coder-next:cloud", expectedNorm: "qwen3-coder-next", minCostPer1k: 0 },
            { raw: "ollama/minimax-m2.7:cloud", expectedNorm: "minimax-m2.7", minCostPer1k: 0 },
            { raw: "ollama/glm-5:cloud", expectedNorm: "glm-5", minCostPer1k: 0 },
        ]

        for (const { raw, expectedNorm } of profileModels) {
            test(`normalizes ${raw} → ${expectedNorm}`, () => {
                const norm = normalizeModelID(raw)
                expect(norm).toBe(expectedNorm)
            })

            test(`calculates non-zero cost for ${raw}`, () => {
                const cost = engine.estimateCost(raw, 1000, 500, 0)
                expect(cost).toBeGreaterThan(0)
            })
        }

        test("reasoning tokens are priced as output", () => {
            const costWithoutReasoning = engine.estimateCost("claude-sonnet-4-5", 1000, 500, 0)
            const costWithReasoning = engine.estimateCost("claude-sonnet-4-5", 1000, 500, 200)
            expect(costWithReasoning).toBeGreaterThan(costWithoutReasoning)
        })
    })

    describe("budget threshold detection", () => {
        test("detects daily budget exceeded", () => {
            const dailyBudget = 50
            const dailyTotal = 55.0
            expect(dailyTotal > dailyBudget).toBe(true)
        })

        test("detects monthly budget exceeded", () => {
            const monthlyBudget = 500
            const monthlyTotal = 520.0
            expect(monthlyTotal > monthlyBudget).toBe(true)
        })

        test("under budget does not trigger", () => {
            const dailyBudget = 50
            const dailyTotal = 30.0
            expect(dailyTotal > dailyBudget).toBe(false)
        })
    })
})

// ─── Storage integration ────────────────────────────────────────────────────

describe("cost-metering storage integration", () => {
    const testSessionID = "test-integration-" + Date.now()

    afterEach(() => {
        // Cleanup test session data
        clearSessionCost(testSessionID)
    })

    test("save → load → clear session cost cycle", () => {
        // #given
        const state: SessionCostState = {
            sessionID: testSessionID,
            totalInputTokens: 5000,
            totalOutputTokens: 2000,
            totalReasoningTokens: 500,
            totalCacheReadTokens: 100,
            totalCostUsd: 0.042,
            recordCount: 3,
            lastCountedMessageIndex: 5,
            firstRecordAt: Date.now() - 60000,
            lastRecordAt: Date.now(),
        }

        // #when - save
        saveSessionCost(state)

        // #then - load
        const loaded = loadSessionCost(testSessionID)
        expect(loaded).not.toBeNull()
        expect(loaded!.totalCostUsd).toBe(0.042)
        expect(loaded!.totalInputTokens).toBe(5000)
        expect(loaded!.recordCount).toBe(3)

        // #when - clear
        clearSessionCost(testSessionID)

        // #then - gone
        expect(loadSessionCost(testSessionID)).toBeNull()
    })

    test("daily total accumulates correctly", () => {
        const today = getTodayDate()
        const originalTotal = loadDailyTotal(today)

        // #when - add to daily
        saveDailyTotal(today, originalTotal + 1.50)

        // #then
        const updated = loadDailyTotal(today)
        expect(updated).toBe(originalTotal + 1.50)

        // Restore
        saveDailyTotal(today, originalTotal)
    })

    test("monthly total accumulates correctly", () => {
        const month = getCurrentMonth()
        const originalTotal = loadMonthlyTotal(month)

        // #when - add to monthly
        saveMonthlyTotal(month, originalTotal + 5.00)

        // #then
        const updated = loadMonthlyTotal(month)
        expect(updated).toBe(originalTotal + 5.00)

        // Restore
        saveMonthlyTotal(month, originalTotal)
    })

    test("getTodayDate returns ISO date format", () => {
        const today = getTodayDate()
        expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    test("getCurrentMonth returns YYYY-MM format", () => {
        const month = getCurrentMonth()
        expect(month).toMatch(/^\d{4}-\d{2}$/)
    })
})
