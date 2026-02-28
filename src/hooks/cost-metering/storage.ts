import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    unlinkSync,
    readdirSync,
} from "node:fs"
import { join } from "node:path"
import { COST_METERING_STORAGE } from "./constants"
import type { SessionCostState } from "./types"

function ensureDir(): void {
    if (!existsSync(COST_METERING_STORAGE)) {
        mkdirSync(COST_METERING_STORAGE, { recursive: true })
    }
}

function getSessionPath(sessionID: string): string {
    return join(COST_METERING_STORAGE, `session-${sessionID}.json`)
}

function getDailyPath(date: string): string {
    return join(COST_METERING_STORAGE, `daily-${date}.json`)
}

function getMonthlyPath(month: string): string {
    return join(COST_METERING_STORAGE, `monthly-${month}.json`)
}

// ─── Session Cost ───────────────────────────────────────────────

export function loadSessionCost(sessionID: string): SessionCostState | null {
    const filePath = getSessionPath(sessionID)
    if (!existsSync(filePath)) return null
    try {
        return JSON.parse(readFileSync(filePath, "utf-8")) as SessionCostState
    } catch {
        return null
    }
}

export function saveSessionCost(state: SessionCostState): void {
    ensureDir()
    writeFileSync(getSessionPath(state.sessionID), JSON.stringify(state, null, 2))
}

export function clearSessionCost(sessionID: string): void {
    const filePath = getSessionPath(sessionID)
    if (existsSync(filePath)) {
        try { unlinkSync(filePath) } catch { /* ignore */ }
    }
}

// ─── Daily Total ────────────────────────────────────────────────

export function loadDailyTotal(date: string): number {
    const filePath = getDailyPath(date)
    if (!existsSync(filePath)) return 0
    try {
        const data = JSON.parse(readFileSync(filePath, "utf-8"))
        return data.totalUsd ?? 0
    } catch {
        return 0
    }
}

export function saveDailyTotal(date: string, totalUsd: number): void {
    ensureDir()
    writeFileSync(getDailyPath(date), JSON.stringify({ date, totalUsd }, null, 2))
}

// ─── Monthly Total ──────────────────────────────────────────────

export function loadMonthlyTotal(month: string): number {
    const filePath = getMonthlyPath(month)
    if (!existsSync(filePath)) return 0
    try {
        const data = JSON.parse(readFileSync(filePath, "utf-8"))
        return data.totalUsd ?? 0
    } catch {
        return 0
    }
}

export function saveMonthlyTotal(month: string, totalUsd: number): void {
    ensureDir()
    writeFileSync(getMonthlyPath(month), JSON.stringify({ month, totalUsd }, null, 2))
}

// ─── Cleanup ────────────────────────────────────────────────────

const DAILY_RETENTION_DAYS = 90
const MONTHLY_RETENTION_MONTHS = 12

export function cleanupOldTotals(): void {
    if (!existsSync(COST_METERING_STORAGE)) return

    const now = Date.now()
    const dailyCutoff = now - DAILY_RETENTION_DAYS * 24 * 60 * 60 * 1000

    try {
        const files = readdirSync(COST_METERING_STORAGE)

        for (const file of files) {
            if (file.startsWith("daily-") && file.endsWith(".json")) {
                // daily-2026-02-28.json → parse date
                const dateStr = file.slice("daily-".length, -".json".length)
                const fileDate = new Date(dateStr).getTime()
                if (!isNaN(fileDate) && fileDate < dailyCutoff) {
                    try { unlinkSync(join(COST_METERING_STORAGE, file)) } catch { /* ignore */ }
                }
            }

            if (file.startsWith("monthly-") && file.endsWith(".json")) {
                // monthly-2026-02.json → parse month
                const monthStr = file.slice("monthly-".length, -".json".length)
                const fileDate = new Date(monthStr + "-01").getTime()
                const monthlyCutoff = now - MONTHLY_RETENTION_MONTHS * 30 * 24 * 60 * 60 * 1000
                if (!isNaN(fileDate) && fileDate < monthlyCutoff) {
                    try { unlinkSync(join(COST_METERING_STORAGE, file)) } catch { /* ignore */ }
                }
            }
        }
    } catch { /* ignore */ }
}

// ─── Helpers ────────────────────────────────────────────────────

export function getTodayDate(): string {
    return new Date().toISOString().slice(0, 10) // "2026-02-28"
}

export function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7) // "2026-02"
}
