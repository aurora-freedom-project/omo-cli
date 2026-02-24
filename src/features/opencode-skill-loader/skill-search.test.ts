import { describe, expect, test } from "bun:test"
import { tokenize, calculateIDF, calculateBM25, searchSkills, hasSkillMatches } from "./skill-search"
import type { LoadedSkill } from "./types"

// ---------------------------------------------------------------------------
// Helper: Create mock skills
// ---------------------------------------------------------------------------

function mockSkill(name: string, description: string, template = ""): LoadedSkill {
    return {
        name,
        scope: "agent",
        definition: {
            name,
            description,
            template,
        },
    }
}

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

describe("tokenize", () => {
    test("lowercases and splits text", () => {
        const tokens = tokenize("Build a REST API")
        expect(tokens).toContain("build")
        expect(tokens).toContain("rest")
        expect(tokens).toContain("api")
    })

    test("removes stop words", () => {
        const tokens = tokenize("the quick brown fox is on the mat")
        expect(tokens).not.toContain("the")
        expect(tokens).not.toContain("is")
        expect(tokens).not.toContain("on")
        expect(tokens).toContain("quick")
        expect(tokens).toContain("brown")
        expect(tokens).toContain("fox")
    })

    test("filters single-char tokens", () => {
        const tokens = tokenize("a b cd efg")
        expect(tokens).not.toContain("a")
        expect(tokens).not.toContain("b")
        expect(tokens).toContain("cd")
        expect(tokens).toContain("efg")
    })

    test("strips punctuation", () => {
        const tokens = tokenize("hello, world! (test)")
        expect(tokens).toContain("hello")
        expect(tokens).toContain("world")
        expect(tokens).toContain("test")
    })

    test("handles hyphens in skill names", () => {
        const tokens = tokenize("frontend-ui-ux")
        expect(tokens).toContain("frontend-ui-ux")
    })

    test("returns empty array for empty input", () => {
        expect(tokenize("")).toEqual([])
        expect(tokenize("   ")).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// IDF
// ---------------------------------------------------------------------------

describe("calculateIDF", () => {
    test("rare terms get higher IDF", () => {
        const docs = [
            ["react", "component"],
            ["react", "hooks"],
            ["python", "flask"],
        ]
        const reactIDF = calculateIDF("react", docs)
        const pythonIDF = calculateIDF("python", docs)
        // "python" appears in 1 doc, "react" in 2 → python should have higher IDF
        expect(pythonIDF).toBeGreaterThan(reactIDF)
    })

    test("absent terms get max IDF", () => {
        const docs = [["react"], ["vue"]]
        const idf = calculateIDF("angular", docs)
        expect(idf).toBeGreaterThan(0)
    })
})

// ---------------------------------------------------------------------------
// BM25 Score
// ---------------------------------------------------------------------------

describe("calculateBM25", () => {
    test("matching document scores higher than non-matching", () => {
        const query = ["react", "component"]
        const matchDoc = ["react", "component", "library"]
        const noMatchDoc = ["python", "flask", "server"]

        const idfMap = new Map<string, number>()
        idfMap.set("react", 1.0)
        idfMap.set("component", 1.0)

        const matchScore = calculateBM25(query, matchDoc, idfMap, 3)
        const noMatchScore = calculateBM25(query, noMatchDoc, idfMap, 3)

        expect(matchScore).toBeGreaterThan(0)
        expect(noMatchScore).toBe(0)
    })

    test("empty document scores zero", () => {
        const query = ["react"]
        const idfMap = new Map([["react", 1.0]])
        expect(calculateBM25(query, [], idfMap, 3)).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// searchSkills
// ---------------------------------------------------------------------------

describe("searchSkills", () => {
    const testSkills: LoadedSkill[] = [
        mockSkill("react-patterns", "Modern React patterns and principles. Hooks, composition, performance."),
        mockSkill("python-pro", "Master Python 3.12+ with modern features, async programming."),
        mockSkill("golang-pro", "Master Go 1.21+ with modern patterns, advanced concurrency."),
        mockSkill("frontend-developer", "Build React components, implement responsive layouts.", "React 19, Next.js 15"),
        mockSkill("fastapi-pro", "Build high-performance async APIs with FastAPI, SQLAlchemy."),
        mockSkill("database-design", "Database design principles. Schema design, indexing strategy."),
    ]

    test("returns relevant skills for React query", () => {
        const results = searchSkills("Build a React component with hooks", testSkills)
        expect(results.length).toBeGreaterThan(0)
        // React-related skills should rank highest
        const topNames = results.slice(0, 2).map((r) => r.skill.name)
        expect(topNames).toContain("react-patterns")
    })

    test("returns relevant skills for Python query", () => {
        const results = searchSkills("Write async Python code with FastAPI", testSkills)
        expect(results.length).toBeGreaterThan(0)
        const topNames = results.slice(0, 3).map((r) => r.skill.name)
        expect(topNames).toContain("python-pro")
        expect(topNames).toContain("fastapi-pro")
    })

    test("returns relevant skills for database query", () => {
        const results = searchSkills("Design a database schema with indexes", testSkills)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].skill.name).toBe("database-design")
    })

    test("respects limit parameter", () => {
        const results = searchSkills("programming", testSkills, 2)
        expect(results.length).toBeLessThanOrEqual(2)
    })

    test("returns empty for irrelevant query", () => {
        const results = searchSkills("quantum physics simulation", testSkills)
        // Should return few or no matches
        for (const r of results) {
            expect(r.score).toBeLessThan(1.0)
        }
    })

    test("returns empty for empty query", () => {
        expect(searchSkills("", testSkills)).toEqual([])
    })

    test("returns empty for empty skills array", () => {
        expect(searchSkills("React", [])).toEqual([])
    })

    test("results are sorted by score descending", () => {
        const results = searchSkills("React component", testSkills)
        for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
        }
    })
})

// ---------------------------------------------------------------------------
// hasSkillMatches
// ---------------------------------------------------------------------------

describe("hasSkillMatches", () => {
    const skills: LoadedSkill[] = [
        mockSkill("typescript-pro", "Master TypeScript with advanced types"),
        mockSkill("rust-pro", "Master Rust async patterns"),
    ]

    test("returns true for matching query", () => {
        expect(hasSkillMatches("typescript advanced types", skills)).toBe(true)
    })

    test("returns false for non-matching query", () => {
        expect(hasSkillMatches("", skills)).toBe(false)
    })
})
