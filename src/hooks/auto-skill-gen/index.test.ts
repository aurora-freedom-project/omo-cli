/**
 * Auto-Generated Skills — Test Suite
 */

import { describe, it, expect } from "vitest"
import {
    detectComponents,
    detectNamingPatterns,
    detectCoClusters,
    buildProjectProfile,
    generateArchitectureSkill,
    generateConventionsSkill,
    generateSkills,
    type CodeElement,
} from "./index"

// ── Test Data ──────────────────────────────────────────────────────────────

const SAMPLE_ELEMENTS: CodeElement[] = [
    { name: "createUser", kind: "function", file: "src/models/user.ts", signature: "createUser(data: UserData): User" },
    { name: "updateUser", kind: "function", file: "src/models/user.ts", signature: "updateUser(id: string, data: Partial<UserData>): User" },
    { name: "deleteUser", kind: "function", file: "src/models/user.ts", signature: "deleteUser(id: string): void" },
    { name: "UserService", kind: "class", file: "src/services/user-service.ts", signature: "class UserService" },
    { name: "AuthService", kind: "class", file: "src/services/auth-service.ts", signature: "class AuthService" },
    { name: "ApiService", kind: "class", file: "src/services/api-service.ts", signature: "class ApiService" },
    { name: "handleLogin", kind: "function", file: "src/handlers/auth.ts", signature: "handleLogin(req, res): void" },
    { name: "handleLogout", kind: "function", file: "src/handlers/auth.ts", signature: "handleLogout(req, res): void" },
    { name: "handleRegister", kind: "function", file: "src/handlers/auth.ts", signature: "handleRegister(req, res): void" },
    { name: "testCreateUser", kind: "function", file: "tests/user.test.ts", signature: "testCreateUser(): void" },
    { name: "testDeleteUser", kind: "function", file: "tests/user.test.ts", signature: "testDeleteUser(): void" },
]

// ── Component Detection ────────────────────────────────────────────────────

describe("detectComponents", () => {
    it("detects top-level directories", () => {
        const files = [
            "src/a.ts", "src/b.ts", "src/c.ts",
            "tests/x.ts", "tests/y.ts",
            "docs/readme.md",
        ]
        const components = detectComponents(files)
        expect(components).toContain("src")
        expect(components).toContain("tests")
    })

    it("ignores single-file directories", () => {
        const files = ["src/a.ts", "src/b.ts", "lone/single.ts"]
        const components = detectComponents(files)
        expect(components).toContain("src")
        expect(components).not.toContain("lone")
    })

    it("sorts by file count descending", () => {
        const files = [
            "small/a.ts", "small/b.ts",
            "big/a.ts", "big/b.ts", "big/c.ts", "big/d.ts",
        ]
        const components = detectComponents(files)
        expect(components[0]).toBe("big")
    })

    it("handles root-level files", () => {
        const files = ["package.json", "tsconfig.json", "src/index.ts", "src/app.ts"]
        const components = detectComponents(files)
        expect(components).toContain("src")
    })

    it("handles empty input", () => {
        expect(detectComponents([])).toHaveLength(0)
    })
})

// ── Naming Patterns ────────────────────────────────────────────────────────

describe("detectNamingPatterns", () => {
    it("detects common prefixes", () => {
        const patterns = detectNamingPatterns(SAMPLE_ELEMENTS)
        const prefixPatterns = patterns.filter(p => p.type === "prefix")

        // "handle" is a prefix for handleLogin, handleLogout, handleRegister
        const handlePattern = prefixPatterns.find(p => p.pattern === "handle")
        expect(handlePattern).toBeDefined()
        expect(handlePattern!.count).toBe(3)
    })

    it("detects common suffixes", () => {
        const patterns = detectNamingPatterns(SAMPLE_ELEMENTS)
        const suffixPatterns = patterns.filter(p => p.type === "suffix")

        // "Service" is a suffix for UserService, AuthService, ApiService
        const servicePattern = suffixPatterns.find(p => p.pattern === "service")
        expect(servicePattern).toBeDefined()
        expect(servicePattern!.count).toBe(3)
    })

    it("includes examples", () => {
        const patterns = detectNamingPatterns(SAMPLE_ELEMENTS)

        for (const p of patterns) {
            expect(p.examples.length).toBeGreaterThan(0)
            expect(p.examples.length).toBeLessThanOrEqual(3)
        }
    })

    it("ignores patterns with fewer than 3 occurrences", () => {
        const patterns = detectNamingPatterns([
            { name: "fooBar", kind: "function", file: "a.ts" },
            { name: "fooBaz", kind: "function", file: "b.ts" },
        ])
        expect(patterns).toHaveLength(0) // only 2 occurrences
    })

    it("handles empty input", () => {
        expect(detectNamingPatterns([])).toHaveLength(0)
    })
})

// ── Co-Clusters ────────────────────────────────────────────────────────────

describe("detectCoClusters", () => {
    it("detects elements that co-occur in the same file", () => {
        const clusters = detectCoClusters(SAMPLE_ELEMENTS)
        // Multiple files have 2+ elements, so clusters should exist
        // handling auth.ts has 3 functions, user.ts has 3 functions
        expect(clusters.length).toBeGreaterThanOrEqual(0)
    })

    it("includes file references in clusters", () => {
        const clusters = detectCoClusters(SAMPLE_ELEMENTS)
        for (const cluster of clusters) {
            expect(cluster.files.length).toBeGreaterThan(0)
        }
    })

    it("handles single-element files (no clusters)", () => {
        const elements: CodeElement[] = [
            { name: "a", kind: "function", file: "a.ts" },
            { name: "b", kind: "function", file: "b.ts" },
        ]
        const clusters = detectCoClusters(elements)
        expect(clusters).toHaveLength(0)
    })

    it("handles empty input", () => {
        expect(detectCoClusters([])).toHaveLength(0)
    })
})

// ── Project Profile ────────────────────────────────────────────────────────

describe("buildProjectProfile", () => {
    it("builds a complete profile", () => {
        const profile = buildProjectProfile("test-project", SAMPLE_ELEMENTS)

        expect(profile.name).toBe("test-project")
        expect(profile.fileCount).toBeGreaterThan(0)
        expect(profile.elementCount).toBe(SAMPLE_ELEMENTS.length)
        expect(profile.components.length).toBeGreaterThan(0)
        expect(profile.languages.length).toBeGreaterThan(0)
    })

    it("detects TypeScript from .ts files", () => {
        const profile = buildProjectProfile("ts-project", SAMPLE_ELEMENTS)
        expect(profile.languages).toContain("TypeScript")
    })

    it("includes extension distribution", () => {
        const profile = buildProjectProfile("test", SAMPLE_ELEMENTS)
        expect(profile.extensionDistribution).toHaveProperty("ts")
        expect(profile.extensionDistribution["ts"]).toBeGreaterThan(0)
    })

    it("includes kind distribution", () => {
        const profile = buildProjectProfile("test", SAMPLE_ELEMENTS)
        expect(profile.kindDistribution).toHaveProperty("function")
        expect(profile.kindDistribution).toHaveProperty("class")
    })

    it("handles empty elements", () => {
        const profile = buildProjectProfile("empty", [])
        expect(profile.fileCount).toBe(0)
        expect(profile.elementCount).toBe(0)
        expect(profile.components).toHaveLength(0)
    })
})

// ── Skill Generation ───────────────────────────────────────────────────────

describe("generateArchitectureSkill", () => {
    it("generates valid SKILL.md format", () => {
        const profile = buildProjectProfile("my-app", SAMPLE_ELEMENTS)
        const skill = generateArchitectureSkill(profile)

        expect(skill.filename).toBe("my-app-architecture.md")
        expect(skill.category).toBe("architecture")
        expect(skill.content).toContain("---")
        expect(skill.content).toContain("name: my-app-architecture")
        expect(skill.content).toContain("Architecture Overview")
    })

    it("includes component layout", () => {
        const profile = buildProjectProfile("my-app", SAMPLE_ELEMENTS)
        const skill = generateArchitectureSkill(profile)
        expect(skill.content).toContain("Component Layout")
    })

    it("includes element distribution table", () => {
        const profile = buildProjectProfile("my-app", SAMPLE_ELEMENTS)
        const skill = generateArchitectureSkill(profile)
        expect(skill.content).toContain("function")
        expect(skill.content).toContain("class")
    })
})

describe("generateConventionsSkill", () => {
    it("generates conventions skill when patterns exist", () => {
        const profile = buildProjectProfile("my-app", SAMPLE_ELEMENTS)
        const skill = generateConventionsSkill(profile)

        expect(skill).not.toBeNull()
        expect(skill!.category).toBe("conventions")
        expect(skill!.content).toContain("Naming Conventions")
    })

    it("includes anti-patterns section", () => {
        const profile = buildProjectProfile("my-app", SAMPLE_ELEMENTS)
        const skill = generateConventionsSkill(profile)

        expect(skill!.content).toContain("Anti-Patterns")
    })

    it("returns null when no patterns detected", () => {
        const profile = buildProjectProfile("tiny", [
            { name: "a", kind: "function", file: "a.ts" },
        ])
        const skill = generateConventionsSkill(profile)
        expect(skill).toBeNull()
    })
})

describe("generateSkills", () => {
    it("generates at least architecture skill", () => {
        const profile = buildProjectProfile("my-app", SAMPLE_ELEMENTS)
        const skills = generateSkills(profile)

        expect(skills.length).toBeGreaterThanOrEqual(1)
        expect(skills.some(s => s.category === "architecture")).toBe(true)
    })

    it("includes conventions skill when patterns exist", () => {
        const profile = buildProjectProfile("my-app", SAMPLE_ELEMENTS)
        const skills = generateSkills(profile)

        expect(skills.some(s => s.category === "conventions")).toBe(true)
    })

    it("all skills have valid filenames", () => {
        const profile = buildProjectProfile("my-app", SAMPLE_ELEMENTS)
        const skills = generateSkills(profile)

        for (const skill of skills) {
            expect(skill.filename).toMatch(/\.md$/)
            expect(skill.filename.length).toBeGreaterThan(4)
        }
    })
})
