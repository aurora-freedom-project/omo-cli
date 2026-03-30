import { describe, it, expect } from "bun:test"
import {
    initKillChain,
    advanceStage,
    jumpToStage,
    failStage,
    addFinding,
    getAllFindings,
    getProgress,
    getCurrentStage,
    getSuggestedTools,
    formatKillChainStatus,
    resetKillChain,
    STAGE_ORDER,
    MITRE_TACTICS,
} from "./index"

describe("Kill Chain State Machine", () => {
    const SID = () => `kc-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    describe("initKillChain", () => {
        it("starts at reconnaissance", () => {
            const sid = SID()
            const state = initKillChain(sid)
            expect(state.currentStage).toBe("reconnaissance")
            expect(state.stages.reconnaissance.status).toBe("active")
            expect(state.stages.weaponization.status).toBe("pending")
            resetKillChain(sid)
        })

        it("has all 7 stages", () => {
            const sid = SID()
            const state = initKillChain(sid)
            expect(Object.keys(state.stages).length).toBe(7)
            resetKillChain(sid)
        })
    })

    describe("advanceStage", () => {
        it("advances reconnaissance → weaponization", () => {
            const sid = SID()
            initKillChain(sid)
            const next = advanceStage(sid, "recon complete")
            expect(next).toBe("weaponization")
            expect(getCurrentStage(sid)).toBe("weaponization")
            resetKillChain(sid)
        })

        it("marks previous stage completed", () => {
            const sid = SID()
            const state = initKillChain(sid)
            advanceStage(sid)
            expect(state.stages.reconnaissance.status).toBe("completed")
            expect(state.stages.reconnaissance.completedAt).toBeGreaterThan(0)
            resetKillChain(sid)
        })

        it("returns null at final stage", () => {
            const sid = SID()
            initKillChain(sid)
            for (let i = 0; i < 6; i++) advanceStage(sid)
            expect(getCurrentStage(sid)).toBe("actions_on_objectives")
            expect(advanceStage(sid)).toBeNull()
            resetKillChain(sid)
        })

        it("records transition history", () => {
            const sid = SID()
            const state = initKillChain(sid)
            advanceStage(sid, "test reason")
            expect(state.transitions.length).toBe(1)
            expect(state.transitions[0].from).toBe("reconnaissance")
            expect(state.transitions[0].to).toBe("weaponization")
            expect(state.transitions[0].reason).toBe("test reason")
            resetKillChain(sid)
        })
    })

    describe("jumpToStage", () => {
        it("jumps forward skipping stages", () => {
            const sid = SID()
            initKillChain(sid)
            jumpToStage(sid, "exploitation", "skip delivery")
            expect(getCurrentStage(sid)).toBe("exploitation")
            resetKillChain(sid)
        })

        it("jumps backward for backtracking", () => {
            const sid = SID()
            initKillChain(sid)
            advanceStage(sid)
            advanceStage(sid) // at delivery
            jumpToStage(sid, "reconnaissance", "re-scan needed")
            expect(getCurrentStage(sid)).toBe("reconnaissance")
            resetKillChain(sid)
        })
    })

    describe("failStage", () => {
        it("marks current stage as failed", () => {
            const sid = SID()
            const state = initKillChain(sid)
            failStage(sid, "no targets found")
            expect(state.stages.reconnaissance.status).toBe("failed")
            resetKillChain(sid)
        })
    })

    describe("addFinding", () => {
        it("adds finding to current stage", () => {
            const sid = SID()
            const state = initKillChain(sid)
            const id = addFinding(sid, {
                description: "Open port 22",
                severity: "medium",
                evidence: "nmap scan result",
                mitreTechnique: "T1595.002",
            })
            expect(id).toStartWith("F-RECO-")
            expect(state.stages.reconnaissance.findings.length).toBe(1)
            expect(state.stages.reconnaissance.findings[0].severity).toBe("medium")
            resetKillChain(sid)
        })

        it("returns null for unknown session", () => {
            expect(addFinding("nonexistent", { description: "test", severity: "low", evidence: "none" })).toBeNull()
        })
    })

    describe("getAllFindings", () => {
        it("aggregates findings across stages", () => {
            const sid = SID()
            initKillChain(sid)
            addFinding(sid, { description: "F1", severity: "low", evidence: "e1" })
            advanceStage(sid)
            addFinding(sid, { description: "F2", severity: "high", evidence: "e2" })
            const all = getAllFindings(sid)
            expect(all.length).toBe(2)
            resetKillChain(sid)
        })
    })

    describe("getProgress", () => {
        it("starts at 0%", () => {
            const sid = SID()
            initKillChain(sid)
            expect(getProgress(sid)).toBe(0)
            resetKillChain(sid)
        })

        it("increases with advancement", () => {
            const sid = SID()
            initKillChain(sid)
            advanceStage(sid) // recon completed
            expect(getProgress(sid)).toBe(14) // 1/7 ≈ 14%
            resetKillChain(sid)
        })

        it("reaches 86% at 6/7", () => {
            const sid = SID()
            initKillChain(sid)
            for (let i = 0; i < 6; i++) advanceStage(sid)
            expect(getProgress(sid)).toBe(86) // 6/7
            resetKillChain(sid)
        })
    })

    describe("getSuggestedTools", () => {
        it("returns recon tools at start", () => {
            const sid = SID()
            initKillChain(sid)
            const tools = getSuggestedTools(sid)
            expect(tools).toContain("dns_resolve")
            expect(tools).toContain("port_check")
            resetKillChain(sid)
        })
    })

    describe("formatKillChainStatus", () => {
        it("formats status correctly", () => {
            const sid = SID()
            initKillChain(sid)
            advanceStage(sid)
            const status = formatKillChainStatus(sid)
            expect(status).toContain("Kill Chain")
            expect(status).toContain("✅") // completed recon
            expect(status).toContain("🔵") // active weaponization
            resetKillChain(sid)
        })

        it("returns null for unknown session", () => {
            expect(formatKillChainStatus("not-a-session")).toBeNull()
        })
    })

    describe("constants", () => {
        it("has 7 stages in order", () => {
            expect(STAGE_ORDER.length).toBe(7)
            expect(STAGE_ORDER[0]).toBe("reconnaissance")
            expect(STAGE_ORDER[6]).toBe("actions_on_objectives")
        })

        it("has MITRE mappings for all stages", () => {
            for (const stage of STAGE_ORDER) {
                expect(MITRE_TACTICS[stage]).toMatch(/^TA\d{4}$/)
            }
        })
    })
})
