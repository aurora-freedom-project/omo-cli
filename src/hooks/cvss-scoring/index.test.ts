import { describe, it, expect } from "bun:test"
import {
    calculateCvss,
    scoreSeverity,
    scoreFinding,
    mapToFrameworks,
    formatScoredFinding,
    formatScoreSummary,
} from "./index"

describe("CVSS Auto-Scoring Engine", () => {
    describe("calculateCvss", () => {
        it("calculates max score (all 10s, low complexity)", () => {
            const result = calculateCvss(10, 10, 0, 10)
            // (10*0.4) + (10*0.3) + (10*0.2) + (10*0.1) = 4+3+2+1 = 10
            expect(result.score).toBe(10)
            expect(result.severity).toBe("CRITICAL")
        })

        it("calculates zero score (all zeros, max complexity)", () => {
            const result = calculateCvss(0, 0, 10, 0)
            // (0*0.4) + (0*0.3) + (0*0.2) + (0*0.1) = 0
            expect(result.score).toBe(0)
            expect(result.severity).toBe("NONE")
        })

        it("calculates medium score", () => {
            const result = calculateCvss(5, 5, 5, 5)
            // (5*0.4) + (5*0.3) + (5*0.2) + (5*0.1) = 2+1.5+1+0.5 = 5
            expect(result.score).toBe(5)
            expect(result.severity).toBe("MEDIUM")
        })

        it("clamps inputs to [0, 10]", () => {
            const result = calculateCvss(15, -5, 20, -10)
            expect(result.components.impact).toBe(10)
            expect(result.components.exploitability).toBe(0)
            expect(result.components.complexity).toBe(10)
            expect(result.components.humanFactor).toBe(0)
        })

        it("stores component scores", () => {
            const result = calculateCvss(8, 6, 3, 4)
            expect(result.components.impact).toBe(8)
            expect(result.components.exploitability).toBe(6)
            expect(result.components.complexity).toBe(3)
            expect(result.components.humanFactor).toBe(4)
        })
    })

    describe("scoreSeverity", () => {
        it("CRITICAL for >= 9.0", () => expect(scoreSeverity(9.0)).toBe("CRITICAL"))
        it("HIGH for >= 7.0", () => expect(scoreSeverity(7.0)).toBe("HIGH"))
        it("MEDIUM for >= 4.0", () => expect(scoreSeverity(4.0)).toBe("MEDIUM"))
        it("LOW for >= 0.1", () => expect(scoreSeverity(0.1)).toBe("LOW"))
        it("NONE for 0", () => expect(scoreSeverity(0)).toBe("NONE"))
    })

    describe("scoreFinding", () => {
        it("scores secrets as HIGH (8.2)", () => {
            const result = scoreFinding("API key exposed", "secrets")
            expect(result.cvss.severity).toBe("HIGH")
            expect(result.cvss.score).toBe(8.2)
        })

        it("scores encoding_bypass as MEDIUM", () => {
            const result = scoreFinding("Base64 bypass", "encoding_bypass")
            expect(result.cvss.severity).toBe("MEDIUM")
        })

        it("uses default profile for unknown category", () => {
            const result = scoreFinding("Unknown issue", "nonexistent_category")
            expect(result.cvss.score).toBe(5) // All 5s default
        })

        it("includes framework mappings", () => {
            const result = scoreFinding("Prompt injection", "instruction_override")
            expect(result.cvss.frameworks.length).toBeGreaterThan(0)
            expect(result.cvss.frameworks.some(f => f.framework === "OWASP_LLM" && f.id === "LLM01")).toBe(true)
        })
    })

    describe("mapToFrameworks", () => {
        it("maps instruction_override to OWASP LLM01", () => {
            const maps = mapToFrameworks("instruction_override")
            expect(maps.some(m => m.framework === "OWASP_LLM" && m.id === "LLM01")).toBe(true)
        })

        it("maps secrets to OWASP LLM06", () => {
            const maps = mapToFrameworks("secrets")
            expect(maps.some(m => m.framework === "OWASP_LLM" && m.id === "LLM06")).toBe(true)
        })

        it("maps jailbreak to MITRE ATLAS", () => {
            const maps = mapToFrameworks("jailbreak")
            expect(maps.some(m => m.framework === "MITRE_ATLAS")).toBe(true)
        })

        it("always includes NIST AI RMF", () => {
            const maps = mapToFrameworks("anything")
            expect(maps.some(m => m.framework === "NIST_AI_RMF")).toBe(true)
        })
    })

    describe("formatScoredFinding", () => {
        it("formats CVSS score and frameworks", () => {
            const scored = scoreFinding("Open API key", "secrets")
            const formatted = formatScoredFinding(scored)
            expect(formatted).toContain("CVSS")
            expect(formatted).toContain("HIGH")
            expect(formatted).toContain("secrets")
            expect(formatted).toContain("OWASP_LLM")
        })
    })

    describe("formatScoreSummary", () => {
        it("formats multiple findings", () => {
            const findings = [
                scoreFinding("Key leak", "secrets"),
                scoreFinding("XSS", "command_injection"),
                scoreFinding("Info leak", "pii"),
            ]
            const summary = formatScoreSummary(findings)
            expect(summary).toContain("Security Posture")
            expect(summary).toContain("3 total")
        })

        it("handles empty findings", () => {
            expect(formatScoreSummary([])).toContain("No findings")
        })
    })
})
