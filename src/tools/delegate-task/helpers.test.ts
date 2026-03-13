import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import {
    parseModelString,
    formatDuration,
    formatDetailedError,
    resolveCategoryConfig,
    buildSystemContent,
    getDelegationDepth,
    setDelegationDepth,
    cleanupDelegationDepth,
    type ErrorContext,
} from "./helpers"
import type { DelegateTaskArgs } from "./types"

describe("helpers", () => {
    describe("parseModelString", () => {
        test("parses provider/model format correctly", () => {
            // #given
            const model = "anthropic/claude-sonnet-4-5"

            // #when
            const result = parseModelString(model)

            // #then
            expect(result).toEqual({ providerID: "anthropic", modelID: "claude-sonnet-4-5" })
        })

        test("handles model with multiple slashes", () => {
            // #given
            const model = "openai/gpt-5.2/turbo"

            // #when
            const result = parseModelString(model)

            // #then
            expect(result).toEqual({ providerID: "openai", modelID: "gpt-5.2/turbo" })
        })

        test("returns undefined for string without slash", () => {
            // #given
            const model = "claude-sonnet"

            // #when
            const result = parseModelString(model)

            // #then
            expect(result).toBeUndefined()
        })

        test("returns undefined for empty string", () => {
            // #given / #when
            const result = parseModelString("")

            // #then
            expect(result).toBeUndefined()
        })
    })

    describe("formatDuration", () => {
        test("formats seconds only", () => {
            // #given
            const start = new Date("2024-01-01T00:00:00Z")
            const end = new Date("2024-01-01T00:00:42Z")

            // #when
            const result = formatDuration(start, end)

            // #then
            expect(result).toBe("42s")
        })

        test("formats minutes and seconds", () => {
            // #given
            const start = new Date("2024-01-01T00:00:00Z")
            const end = new Date("2024-01-01T00:03:15Z")

            // #when
            const result = formatDuration(start, end)

            // #then
            expect(result).toBe("3m 15s")
        })

        test("formats hours, minutes, and seconds", () => {
            // #given
            const start = new Date("2024-01-01T00:00:00Z")
            const end = new Date("2024-01-01T01:30:45Z")

            // #when
            const result = formatDuration(start, end)

            // #then
            expect(result).toBe("1h 30m 45s")
        })

        test("uses current time when end is not provided", () => {
            // #given
            const start = new Date(Date.now() - 5000) // 5 seconds ago

            // #when
            const result = formatDuration(start)

            // #then
            expect(result).toMatch(/^\d+s$/)
        })
    })

    describe("formatDetailedError", () => {
        test("formats Error instance with message", () => {
            // #given
            const error = new Error("Something went wrong")
            const ctx: ErrorContext = { operation: "Test operation" }

            // #when
            const result = formatDetailedError(error, ctx)

            // #then
            expect(result).toContain("Test operation failed")
            expect(result).toContain("Something went wrong")
        })

        test("formats string error", () => {
            // #given
            const error = "raw string error"
            const ctx: ErrorContext = { operation: "String op" }

            // #when
            const result = formatDetailedError(error, ctx)

            // #then
            expect(result).toContain("raw string error")
        })

        test("includes sessionID when provided", () => {
            // #given
            const error = new Error("fail")
            const ctx: ErrorContext = { operation: "Op", sessionID: "ses_abc123" }

            // #when
            const result = formatDetailedError(error, ctx)

            // #then
            expect(result).toContain("ses_abc123")
        })

        test("includes agent and category when provided", () => {
            // #given
            const error = new Error("fail")
            const ctx: ErrorContext = {
                operation: "Op",
                agent: "explorer",
                category: "general",
            }

            // #when
            const result = formatDetailedError(error, ctx)

            // #then
            expect(result).toContain("explorer")
            expect(result).toContain("general")
        })

        test("includes args details when provided", () => {
            // #given
            const error = new Error("fail")
            const args: DelegateTaskArgs = {
                description: "test task",
                prompt: "do something",
                category: "general",
                run_in_background: false,
                load_skills: ["skill1"],
            }
            const ctx: ErrorContext = { operation: "Op", args }

            // #when
            const result = formatDetailedError(error, ctx)

            // #then
            expect(result).toContain("test task")
            expect(result).toContain("general")
            expect(result).toContain("skill1")
        })

        test("includes truncated stack trace for Error", () => {
            // #given
            const error = new Error("fail with stack")
            const ctx: ErrorContext = { operation: "Op" }

            // #when
            const result = formatDetailedError(error, ctx)

            // #then
            expect(result).toContain("Stack Trace")
            expect(result).toContain("```")
        })
    })

    describe("resolveCategoryConfig", () => {
        test("returns null for unknown category", () => {
            // #given / #when
            const result = resolveCategoryConfig("nonexistent", {})

            // #then
            expect(result).toBeNull()
        })

        test("returns config for default category", () => {
            // #given / #when
            const result = resolveCategoryConfig("unspecified-low", {
                systemDefaultModel: "anthropic/claude-sonnet-4-5",
            })

            // #then
            expect(result).not.toBeNull()
            expect(result!.config).toBeDefined()
            expect(result!.promptAppend).toBeDefined()
        })

        test("user category model overrides default", () => {
            // #given
            const userCategories = {
                "unspecified-low": { model: "custom/model" },
            }

            // #when
            const result = resolveCategoryConfig("unspecified-low", {
                userCategories,
                systemDefaultModel: "anthropic/claude-sonnet-4-5",
            })

            // #then
            expect(result!.config.model).toBe("custom/model")
        })

        test("user prompt_append is appended to default", () => {
            // #given
            const userCategories = {
                "visual-engineering": {
                    model: "google/gemini-3-pro",
                    prompt_append: "Extra instructions",
                },
            }

            // #when
            const result = resolveCategoryConfig("visual-engineering", {
                userCategories,
                systemDefaultModel: "anthropic/claude-sonnet-4-5",
            })

            // #then
            expect(result!.promptAppend).toContain("Extra instructions")
        })

        test("user-only category without default works", () => {
            // #given
            const userCategories = {
                "my-custom": { model: "my/model", temperature: 0.5 },
            }

            // #when
            const result = resolveCategoryConfig("my-custom", {
                userCategories,
            })

            // #then
            expect(result).not.toBeNull()
            expect(result!.config.model).toBe("my/model")
            expect(result!.config.temperature).toBe(0.5)
            expect(result!.promptAppend).toBe("")
        })
    })

    describe("buildSystemContent", () => {
        test("returns undefined when no content provided", () => {
            // #given / #when
            const result = buildSystemContent({})

            // #then
            expect(result).toBeUndefined()
        })

        test("returns skill content when provided", () => {
            // #given / #when
            const result = buildSystemContent({ skillContent: "Use git-master skill" })

            // #then
            expect(result).toBe("Use git-master skill")
        })

        test("returns prompt append when provided", () => {
            // #given / #when
            const result = buildSystemContent({ categoryPromptAppend: "Be careful" })

            // #then
            expect(result).toBe("Be careful")
        })

        test("combines skill content and prompt append", () => {
            // #given / #when
            const result = buildSystemContent({
                skillContent: "Skill info",
                categoryPromptAppend: "Category rules",
            })

            // #then
            expect(result).toContain("Skill info")
            expect(result).toContain("Category rules")
        })

        test("prepends PLAN_AGENT_SYSTEM_PREPEND for plan agents", () => {
            // #given / #when
            const result = buildSystemContent({ agentName: "plan" })

            // #then
            expect(result).toBeDefined()
            expect(result).toContain("PLAN") // PLAN_AGENT_SYSTEM_PREPEND contains plan-related content
        })

        test("does not prepend plan content for non-plan agents", () => {
            // #given / #when
            const result = buildSystemContent({
                agentName: "explorer",
                skillContent: "skill data",
            })

            // #then
            expect(result).toBe("skill data")
        })
    })

    describe("delegation depth tracking", () => {
        const testSession = "test-session-depth"

        afterEach(() => {
            cleanupDelegationDepth(testSession)
        })

        test("returns 0 for untracked session", () => {
            // #given / #when
            const depth = getDelegationDepth("untracked-session")

            // #then
            expect(depth).toBe(0)
        })

        test("sets and gets delegation depth", () => {
            // #given
            setDelegationDepth(testSession, 3)

            // #when
            const depth = getDelegationDepth(testSession)

            // #then
            expect(depth).toBe(3)
        })

        test("cleanup removes depth tracking", () => {
            // #given
            setDelegationDepth(testSession, 2)
            expect(getDelegationDepth(testSession)).toBe(2)

            // #when
            cleanupDelegationDepth(testSession)

            // #then
            expect(getDelegationDepth(testSession)).toBe(0)
        })

        test("overwriting depth works", () => {
            // #given
            setDelegationDepth(testSession, 1)

            // #when
            setDelegationDepth(testSession, 5)

            // #then
            expect(getDelegationDepth(testSession)).toBe(5)
        })
    })
})
