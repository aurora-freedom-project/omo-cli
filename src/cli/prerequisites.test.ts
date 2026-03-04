import { describe, it, expect } from "bun:test"
import type { PrerequisiteResult, PrerequisitesReport } from "./prerequisites"

describe("prerequisites", () => {
    describe("PrerequisiteResult interface", () => {
        it("represents a passing check", () => {
            const result: PrerequisiteResult = {
                name: "Docker",
                ok: true,
                critical: true,
                version: "25.0.3",
            }
            expect(result.ok).toBe(true)
            expect(result.critical).toBe(true)
            expect(result.version).toBe("25.0.3")
            expect(result.hint).toBeUndefined()
        })

        it("represents a failing check with hint", () => {
            const result: PrerequisiteResult = {
                name: "Ollama",
                ok: false,
                critical: true,
                hint: "Install: https://ollama.com/download",
            }
            expect(result.ok).toBe(false)
            expect(result.hint).toContain("ollama.com")
        })

        it("represents a non-critical check", () => {
            const result: PrerequisiteResult = {
                name: "Git",
                ok: true,
                critical: false,
                version: "2.44.0",
            }
            expect(result.critical).toBe(false)
        })
    })

    describe("PrerequisitesReport interface", () => {
        it("reports all passed", () => {
            const results: PrerequisiteResult[] = [
                { name: "Docker", ok: true, critical: true },
                { name: "Git", ok: true, critical: false },
            ]
            const report: PrerequisitesReport = {
                results,
                allCriticalPassed: true,
                allPassed: true,
            }
            expect(report.allCriticalPassed).toBe(true)
            expect(report.allPassed).toBe(true)
            expect(report.results).toHaveLength(2)
        })

        it("reports critical failure", () => {
            const results: PrerequisiteResult[] = [
                { name: "Docker", ok: false, critical: true, hint: "Install Docker" },
                { name: "Git", ok: true, critical: false },
            ]
            const allCriticalPassed = results.filter(r => r.critical).every(r => r.ok)
            const allPassed = results.every(r => r.ok)

            expect(allCriticalPassed).toBe(false)
            expect(allPassed).toBe(false)
        })

        it("reports non-critical failure only", () => {
            const results: PrerequisiteResult[] = [
                { name: "Docker", ok: true, critical: true },
                { name: "Embedding Model", ok: false, critical: false },
            ]
            const allCriticalPassed = results.filter(r => r.critical).every(r => r.ok)
            const allPassed = results.every(r => r.ok)

            expect(allCriticalPassed).toBe(true)
            expect(allPassed).toBe(false)
        })
    })
})
