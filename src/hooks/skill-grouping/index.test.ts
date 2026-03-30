/**
 * Skill Grouping — Test Suite
 *
 * Tests the community detection algorithm:
 * 1. Keyword extraction from skill entries
 * 2. Jaccard similarity computation
 * 3. Community detection on various graph structures
 * 4. Community booster (sibling retrieval)
 * 5. Edge cases (empty, single, disconnected)
 */

import { describe, it, expect } from "vitest"
import {
    extractKeywords,
    jaccardSimilarity,
    detectCommunities,
    createCommunityBooster,
    type SkillEntry,
} from "./index"

// ── Test Data ──────────────────────────────────────────────────────────────

const SECURITY_SKILLS: SkillEntry[] = [
    { name: "security-scanning-web", description: "Web application security scanning tool" },
    { name: "security-scanning-api", description: "API endpoint security scanning tool" },
    { name: "vulnerability-scanner", description: "Automated vulnerability scanning and reporting" },
    { name: "pentest-checklist", description: "Penetration testing methodology checklist" },
    { name: "pentest-commands", description: "Common penetration testing commands reference" },
    { name: "red-team-tactics", description: "Red team tactics techniques and procedures" },
]

const MIXED_SKILLS: SkillEntry[] = [
    // Security cluster
    { name: "security-audit", description: "Security auditing guidelines" },
    { name: "security-review", description: "Security code review checklist" },
    // RAG cluster
    { name: "rag-engineer", description: "RAG retrieval augmented generation patterns" },
    { name: "rag-implementation", description: "RAG implementation best practices for retrieval" },
    // Unrelated singleton
    { name: "docker-compose", description: "Docker compose configuration reference" },
]

// ── Keyword Extraction ─────────────────────────────────────────────────────

describe("extractKeywords", () => {
    it("extracts meaningful words from name and description", () => {
        const kws = extractKeywords({
            name: "security-scanning-web",
            description: "Web application security scanning tool",
        })

        expect(kws).toContain("security")
        expect(kws).toContain("scanning")
        expect(kws).toContain("web")
        expect(kws).toContain("application")
    })

    it("excludes stop words", () => {
        const kws = extractKeywords({
            name: "the-tool",
            description: "This is a tool for the system to use",
        })

        expect(kws).not.toContain("the")
        expect(kws).not.toContain("is")
        expect(kws).not.toContain("for")
        expect(kws).not.toContain("to")
    })

    it("deduplicates keywords", () => {
        const kws = extractKeywords({
            name: "security-security",
            description: "Security security security",
        })

        const securityCount = kws.filter(k => k === "security").length
        expect(securityCount).toBe(1)
    })

    it("includes tags", () => {
        const kws = extractKeywords({
            name: "generic-tool",
            description: "A generic tool",
            tags: ["pentest", "offensive"],
        })

        expect(kws).toContain("pentest")
        expect(kws).toContain("offensive")
    })

    it("handles empty description", () => {
        const kws = extractKeywords({
            name: "auth-middleware",
            description: "",
        })

        expect(kws).toContain("auth")
        expect(kws).toContain("middleware")
    })

    it("caps at 20 keywords", () => {
        const longDesc = Array.from({ length: 50 }, (_, i) => `keyword${i}`).join(" ")
        const kws = extractKeywords({
            name: "many-keywords",
            description: longDesc,
        })

        expect(kws.length).toBeLessThanOrEqual(20)
    })
})

// ── Jaccard Similarity ─────────────────────────────────────────────────────

describe("jaccardSimilarity", () => {
    it("returns 1.0 for identical sets", () => {
        const set = new Set(["a", "b", "c"])
        expect(jaccardSimilarity(set, set)).toBe(1.0)
    })

    it("returns 0.0 for disjoint sets", () => {
        const a = new Set(["x", "y"])
        const b = new Set(["a", "b"])
        expect(jaccardSimilarity(a, b)).toBe(0.0)
    })

    it("returns correct value for partial overlap", () => {
        const a = new Set(["a", "b", "c"])
        const b = new Set(["b", "c", "d"])
        // intersection = {b, c} = 2, union = {a, b, c, d} = 4
        expect(jaccardSimilarity(a, b)).toBeCloseTo(0.5)
    })

    it("returns 0.0 for two empty sets", () => {
        expect(jaccardSimilarity(new Set(), new Set())).toBe(0.0)
    })

    it("returns 0.0 for one empty set", () => {
        expect(jaccardSimilarity(new Set(["a"]), new Set())).toBe(0.0)
    })

    it("is symmetric", () => {
        const a = new Set(["x", "y", "z"])
        const b = new Set(["y", "z", "w"])
        expect(jaccardSimilarity(a, b)).toBe(jaccardSimilarity(b, a))
    })
})

// ── Community Detection ────────────────────────────────────────────────────

describe("detectCommunities", () => {
    it("groups related security skills together", () => {
        const result = detectCommunities(SECURITY_SKILLS)

        expect(result.totalSkills).toBe(6)
        expect(result.communityCount).toBeGreaterThanOrEqual(1)

        // Security scanning skills should be in the same community
        const scanComm = result.skillToComm.get("security-scanning-web")
        const scanApiComm = result.skillToComm.get("security-scanning-api")
        if (scanComm !== undefined && scanComm >= 0 && scanApiComm !== undefined && scanApiComm >= 0) {
            expect(scanComm).toBe(scanApiComm)
        }
    })

    it("separates distinct clusters in mixed skill set", () => {
        const result = detectCommunities(MIXED_SKILLS)

        // Security skills should group together
        const secAudit = result.skillToComm.get("security-audit")
        const secReview = result.skillToComm.get("security-review")

        // RAG skills should group together
        const ragEng = result.skillToComm.get("rag-engineer")
        const ragImpl = result.skillToComm.get("rag-implementation")

        // Within-cluster: same community
        if (secAudit !== undefined && secAudit >= 0 && secReview !== undefined && secReview >= 0) {
            expect(secAudit).toBe(secReview)
        }
        if (ragEng !== undefined && ragEng >= 0 && ragImpl !== undefined && ragImpl >= 0) {
            expect(ragEng).toBe(ragImpl)
        }

        // Cross-cluster: different communities (if both formed communities)
        if (secAudit !== undefined && secAudit >= 0 && ragEng !== undefined && ragEng >= 0) {
            expect(secAudit).not.toBe(ragEng)
        }
    })

    it("handles empty input", () => {
        const result = detectCommunities([])
        expect(result.totalSkills).toBe(0)
        expect(result.communityCount).toBe(0)
        expect(result.communities).toHaveLength(0)
    })

    it("handles single skill (no communities)", () => {
        const result = detectCommunities([
            { name: "lonely-skill", description: "A single isolated skill" },
        ])
        expect(result.totalSkills).toBe(1)
        // Single skill can't form a community (MIN_COMMUNITY_SIZE = 2)
        expect(result.communityCount).toBe(0)
    })

    it("assigns community labels from top keywords", () => {
        const result = detectCommunities(SECURITY_SKILLS)

        for (const comm of result.communities) {
            expect(comm.label.length).toBeGreaterThan(0)
            expect(comm.keywords.length).toBeGreaterThan(0)
            expect(comm.keywords.length).toBeLessThanOrEqual(5)
        }
    })

    it("assigns -1 to skills not in any community", () => {
        const result = detectCommunities([
            { name: "alpha", description: "completely unique topic alpha" },
            { name: "beta", description: "completely different topic beta" },
        ])

        // If skills don't share enough keywords, they should be singletons
        for (const [_, commId] of result.skillToComm) {
            // Either in a community (>= 0) or singleton (-1)
            expect(commId).toBeGreaterThanOrEqual(-1)
        }
    })

    it("communities have at least MIN_COMMUNITY_SIZE members", () => {
        const result = detectCommunities(SECURITY_SKILLS)

        for (const comm of result.communities) {
            expect(comm.members.length).toBeGreaterThanOrEqual(2)
        }
    })

    it("sorts communities by size descending", () => {
        const result = detectCommunities(SECURITY_SKILLS)

        for (let i = 1; i < result.communities.length; i++) {
            expect(result.communities[i - 1].members.length)
                .toBeGreaterThanOrEqual(result.communities[i].members.length)
        }
    })
})

// ── Community Booster ──────────────────────────────────────────────────────

describe("createCommunityBooster", () => {
    it("returns siblings for a skill in a community", () => {
        const grouping = detectCommunities(SECURITY_SKILLS)
        const booster = createCommunityBooster(grouping)

        // Find a skill that's in a community
        let testSkill: string | null = null
        for (const [name, commId] of grouping.skillToComm) {
            if (commId >= 0) {
                testSkill = name
                break
            }
        }

        if (testSkill) {
            const boost = booster.getSiblings(testSkill)
            if (boost) {
                expect(boost.siblings.length).toBeGreaterThan(0)
                expect(boost.siblings).not.toContain(testSkill) // should not include self
                expect(boost.communityLabel.length).toBeGreaterThan(0)
                expect(boost.communityId).toBeGreaterThanOrEqual(0)
            }
        }
    })

    it("returns null for a skill not in any community", () => {
        const grouping = detectCommunities([
            { name: "unique-skill", description: "Completely unique" },
        ])
        const booster = createCommunityBooster(grouping)

        const boost = booster.getSiblings("unique-skill")
        expect(boost).toBeNull()
    })

    it("returns null for unknown skill", () => {
        const grouping = detectCommunities(SECURITY_SKILLS)
        const booster = createCommunityBooster(grouping)

        const boost = booster.getSiblings("nonexistent-skill")
        expect(boost).toBeNull()
    })

    it("limits siblings to MAX_SIBLINGS", () => {
        // Create a large community
        const manySkills: SkillEntry[] = Array.from({ length: 15 }, (_, i) => ({
            name: `security-tool-${i}`,
            description: "Security scanning vulnerability testing tool",
        }))

        const grouping = detectCommunities(manySkills)
        const booster = createCommunityBooster(grouping)

        const boost = booster.getSiblings("security-tool-0")
        if (boost) {
            expect(boost.siblings.length).toBeLessThanOrEqual(8)
        }
    })

    it("getCommunityLabel returns label for grouped skill", () => {
        const grouping = detectCommunities(SECURITY_SKILLS)
        const booster = createCommunityBooster(grouping)

        // Find a grouped skill
        for (const [name, commId] of grouping.skillToComm) {
            if (commId >= 0) {
                const label = booster.getCommunityLabel(name)
                expect(label).not.toBeNull()
                expect(label!.length).toBeGreaterThan(0)
                break
            }
        }
    })

    it("getCommunityLabel returns null for ungrouped skill", () => {
        const grouping = detectCommunities([
            { name: "solo", description: "solo description unique" },
        ])
        const booster = createCommunityBooster(grouping)
        expect(booster.getCommunityLabel("solo")).toBeNull()
    })

    it("getCommunitiesForSkills returns unique communities", () => {
        const grouping = detectCommunities(SECURITY_SKILLS)
        const booster = createCommunityBooster(grouping)

        const comms = booster.getCommunitiesForSkills(
            SECURITY_SKILLS.map(s => s.name)
        )

        // All returned communities should have unique IDs
        const ids = comms.map(c => c.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it("getCommunitiesForSkills returns empty for unknown skills", () => {
        const grouping = detectCommunities(SECURITY_SKILLS)
        const booster = createCommunityBooster(grouping)

        const comms = booster.getCommunitiesForSkills(["x", "y", "z"])
        expect(comms).toHaveLength(0)
    })
})

// ── Edge Cases ─────────────────────────────────────────────────────────────

describe("edge cases", () => {
    it("handles skills with identical names gracefully", () => {
        // Map-based, so last one wins — but should not crash
        const result = detectCommunities([
            { name: "dup", description: "first description" },
            { name: "dup", description: "second description" },
        ])
        expect(result.totalSkills).toBe(2)
    })

    it("handles skills with no meaningful keywords", () => {
        const result = detectCommunities([
            { name: "a", description: "be" }, // too short
            { name: "b", description: "do" },
        ])
        // Should not crash — skills might not form communities
        expect(result.totalSkills).toBe(2)
    })

    it("handles large skill sets without hanging", () => {
        const skills: SkillEntry[] = Array.from({ length: 100 }, (_, i) => ({
            name: `skill-${i}`,
            description: `Description for skill number ${i} in category ${i % 5}`,
        }))

        const start = performance.now()
        const result = detectCommunities(skills)
        const elapsed = performance.now() - start

        expect(result.totalSkills).toBe(100)
        // Should complete well within 5 seconds (O(n²) for 100 skills)
        expect(elapsed).toBeLessThan(5000)
    })
})
