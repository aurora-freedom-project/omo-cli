import { describe, it, expect } from "bun:test"
import { preprocessQuery, type TaskType } from "./index"

describe("Query Preprocessor", () => {
    describe("Task type detection", () => {
        const cases: Array<[string, TaskType]> = [
            ["Fix the bug in auth module", "debug"],
            ["Write unit tests for the spec coverage", "test"],
            ["Implement JWT authentication", "code"],
            ["Refactor the database layer", "refactor"],
            ["Deploy to production", "deploy"],
            ["Design the API architecture", "design"],
            ["Research best practices for caching", "research"],
            ["Explain how the auth system works", "analysis"],
            ["Hello", "general"],
        ]

        for (const [input, expected] of cases) {
            it(`classifies "${input}" as ${expected}`, () => {
                const result = preprocessQuery(input)
                expect(result.taskType).toBe(expected)
            })
        }
    })

    describe("Language detection", () => {
        it("detects TypeScript from extension", () => {
            const result = preprocessQuery("Fix the bug in auth.ts file")
            expect(result.languages).toContain("typescript")
        })

        it("detects Rust from keyword", () => {
            const result = preprocessQuery("Build a Rust CLI tool with cargo")
            expect(result.languages).toContain("rust")
        })

        it("detects multiple languages", () => {
            const result = preprocessQuery("Convert the Python script to TypeScript")
            expect(result.languages).toContain("python")
            expect(result.languages).toContain("typescript")
        })
    })

    describe("File path extraction", () => {
        it("extracts .ts file paths", () => {
            const result = preprocessQuery("Fix the bug in src/auth/index.ts")
            expect(result.filePaths).toContain("src/auth/index.ts")
        })

        it("extracts multiple file paths", () => {
            const result = preprocessQuery("Merge config.yaml and setup.json")
            expect(result.filePaths.length).toBeGreaterThanOrEqual(2)
        })
    })

    describe("Urgency detection", () => {
        it("detects high urgency", () => {
            const result = preprocessQuery("URGENT: production is down, fix the auth bug")
            expect(result.urgency).toBe("high")
        })

        it("detects medium urgency", () => {
            const result = preprocessQuery("This is important before we deploy")
            expect(result.urgency).toBe("medium")
        })

        it("defaults to low urgency", () => {
            const result = preprocessQuery("Add a new feature to the dashboard")
            expect(result.urgency).toBe("low")
        })
    })

    describe("Complexity estimation", () => {
        it("trivial for short prompts", () => {
            const result = preprocessQuery("fix typo")
            expect(result.complexity).toBe("trivial")
        })

        it("complex for long detailed prompts", () => {
            const words = Array.from({ length: 120 }, (_, i) => `word${i} file${i}.ts`).join(" ")
            const result = preprocessQuery(words)
            expect(result.complexity).toBe("complex")
        })
    })

    describe("Keyword extraction", () => {
        it("extracts meaningful keywords", () => {
            const result = preprocessQuery("implement JWT authentication with bcrypt hashing")
            expect(result.keywords.length).toBeGreaterThan(0)
            expect(result.keywords).toContain("implement")
        })

        it("filters stop words", () => {
            const result = preprocessQuery("the quick brown implement jumps along with lazy something")
            expect(result.keywords).not.toContain("with")
            expect(result.keywords).toContain("quick")
        })
    })
})
