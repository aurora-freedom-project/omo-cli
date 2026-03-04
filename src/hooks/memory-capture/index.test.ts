import { describe, expect, it, mock, beforeEach } from "bun:test"

// --- Mock dependencies before importing ---

const mockAddConcept = mock(() => Promise.resolve("concept:abc123"))
const mockSearchSimilar = mock(() => Promise.resolve([]))
mock.module("../../cli/memory/surreal-client", () => ({
    addConcept: mockAddConcept,
    searchSimilar: mockSearchSimilar,
}))

const mockGenerateEmbedding = mock(() => Promise.resolve(new Array(384).fill(0.1)))
mock.module("../../cli/memory/embedder", () => ({
    generateEmbedding: mockGenerateEmbedding,
}))

mock.module("../../shared/logger", () => ({
    log: () => { },
}))

import { createMemoryCaptureHook } from "./index"
import type { MemoryConfig } from "../../config/schema"

// --- Helpers ---

function makeConfig(overrides: Partial<MemoryConfig> = {}): MemoryConfig {
    return {
        enabled: true,
        auto_capture: true,
        port: 18000,
        mode: "managed",
        user: "root",
        namespace: "omo",
        database: "memory",
        ...overrides,
    }
}

function makeOutput(texts: string[]) {
    return {
        message: {},
        parts: texts.map((text) => ({ type: "text", text })),
    }
}

function makeInput(overrides: Record<string, unknown> = {}) {
    return {
        sessionID: "test-session-1",
        agent: "orchestrator",
        ...overrides,
    }
}

// --- Tests ---

describe("createMemoryCaptureHook", () => {
    beforeEach(() => {
        mockAddConcept.mockClear()
        mockSearchSimilar.mockClear()
        mockGenerateEmbedding.mockClear()
        // Reset defaults
        mockAddConcept.mockResolvedValue("concept:abc123")
        mockSearchSimilar.mockResolvedValue([])
        mockGenerateEmbedding.mockResolvedValue(new Array(384).fill(0.1))
    })

    // =========================================================================
    // Hook creation / config gating
    // =========================================================================

    describe("hook creation", () => {
        it("returns null when memory.enabled is false", () => {
            const result = createMemoryCaptureHook(
                makeConfig({ enabled: false }),
                "/test/dir"
            )
            expect(result).toBeNull()
        })

        it("returns null when auto_capture is false", () => {
            const result = createMemoryCaptureHook(
                makeConfig({ auto_capture: false }),
                "/test/dir"
            )
            expect(result).toBeNull()
        })

        it("returns null when both enabled and auto_capture are false", () => {
            const result = createMemoryCaptureHook(
                makeConfig({ enabled: false, auto_capture: false }),
                "/test/dir"
            )
            expect(result).toBeNull()
        })

        it("returns hook object when enabled and auto_capture are true", () => {
            const result = createMemoryCaptureHook(
                makeConfig(),
                "/test/dir"
            )
            expect(result).not.toBeNull()
            expect(result!["chat.message"]).toBeDefined()
            expect(typeof result!["chat.message"]).toBe("function")
        })
    })

    // =========================================================================
    // Content filtering — isWorthCapturing (indirectly via hook behavior)
    // =========================================================================

    describe("content filtering", () => {
        it("skips messages with no text parts", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            await hook["chat.message"](makeInput(), {
                message: {},
                parts: [{ type: "tool_use" }],
            })
            expect(mockGenerateEmbedding).not.toHaveBeenCalled()
            expect(mockAddConcept).not.toHaveBeenCalled()
        })

        it("skips messages with empty text", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            await hook["chat.message"](makeInput(), makeOutput([""]))
            expect(mockGenerateEmbedding).not.toHaveBeenCalled()
        })

        it("skips text shorter than 30 characters", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            await hook["chat.message"](makeInput(), makeOutput(["Too short"]))
            expect(mockGenerateEmbedding).not.toHaveBeenCalled()
        })

        it("skips text without decision patterns", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            // 35 chars but no decision keywords
            await hook["chat.message"](
                makeInput(),
                makeOutput(["Here is some random text that says nothing particularly interesting at all"])
            )
            expect(mockAddConcept).not.toHaveBeenCalled()
        })

        it("captures text with 'decided' keyword", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We decided to use the repository pattern for all data access layers in this project"
            await hook["chat.message"](makeInput(), makeOutput([insight]))
            expect(mockAddConcept).toHaveBeenCalledTimes(1)
        })

        it("captures text with 'architecture' keyword", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "The architecture of this system follows a clean layered approach with domain separation"
            await hook["chat.message"](makeInput(), makeOutput([insight]))
            expect(mockAddConcept).toHaveBeenCalledTimes(1)
        })

        it("captures text with 'because' keyword (rationale)", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We chose TypeScript because it provides better type safety and refactoring support for large codebases"
            await hook["chat.message"](makeInput(), makeOutput([insight]))
            expect(mockAddConcept).toHaveBeenCalledTimes(1)
        })

        it("captures text with 'important' keyword", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "It is important to always validate user input before passing it to the database layer"
            await hook["chat.message"](makeInput(), makeOutput([insight]))
            expect(mockAddConcept).toHaveBeenCalledTimes(1)
        })

        it("limits insights to max 3 per message", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const text = [
                "We decided to use React for the frontend framework.",
                "The architecture follows a microservices approach for scalability.",
                "We should always validate inputs before processing them.",
                "We must never store passwords in plaintext in the database.",
                "It is important to add proper error handling everywhere in the app.",
            ].join("\n")
            await hook["chat.message"](makeInput(), makeOutput([text]))
            expect(mockAddConcept).toHaveBeenCalledTimes(3)
        })
    })

    // =========================================================================
    // Tag extraction
    // =========================================================================

    describe("tag extraction", () => {
        it("includes agent name in tags", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We decided to use this approach for the whole system"
            await hook["chat.message"](
                makeInput({ agent: "architect" }),
                makeOutput([insight])
            )
            const call = mockAddConcept.mock.calls[0] as unknown as [Record<string, unknown>]
            expect((call[0].tags as string[])).toContain("architect")
        })

        it("detects typescript tag", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We decided to use TypeScript for better type safety across the project"
            await hook["chat.message"](makeInput(), makeOutput([insight]))
            const call = mockAddConcept.mock.calls[0] as unknown as [Record<string, unknown>]
            expect((call[0].tags as string[])).toContain("typescript")
        })

        it("detects react tag", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We should always use React hooks instead of class components in this project"
            await hook["chat.message"](makeInput(), makeOutput([insight]))
            const call = mockAddConcept.mock.calls[0] as unknown as [Record<string, unknown>]
            expect((call[0].tags as string[])).toContain("react")
        })

        it("detects database tag", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We decided to use PostgreSQL database for all persistent storage needs"
            await hook["chat.message"](makeInput(), makeOutput([insight]))
            const call = mockAddConcept.mock.calls[0] as unknown as [Record<string, unknown>]
            expect((call[0].tags as string[])).toContain("database")
        })

        it("detects multiple tags from text", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We decided to use TypeScript with React and PostgreSQL database for this architecture pattern"
            await hook["chat.message"](makeInput(), makeOutput([insight]))
            const call = mockAddConcept.mock.calls[0] as unknown as [Record<string, unknown>]
            const tags = call[0].tags as string[]
            expect(tags).toContain("typescript")
            expect(tags).toContain("react")
            expect(tags).toContain("database")
            expect(tags).toContain("architecture")
        })

        it("deduplicates tags", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We decided to use TypeScript and more TypeScript for testing purposes"
            await hook["chat.message"](
                makeInput({ agent: "orchestrator" }),
                makeOutput([insight])
            )
            const call = mockAddConcept.mock.calls[0] as unknown as [Record<string, unknown>]
            const tags = call[0].tags as string[]
            const typescriptCount = tags.filter(t => t === "typescript").length
            expect(typescriptCount).toBe(1)
        })
    })

    // =========================================================================
    // Deduplication via similarity check
    // =========================================================================

    describe("deduplication", () => {
        it("skips insight when similar concept exists (score >= 0.92)", async () => {
            mockSearchSimilar.mockResolvedValue([
                { content: "existing", tags: [], embedding: [], source: "auto", score: 0.95 },
            ] as never)

            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We decided to use the repository pattern for data access"
            await hook["chat.message"](makeInput(), makeOutput([insight]))

            expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1)
            expect(mockSearchSimilar).toHaveBeenCalledTimes(1)
            expect(mockAddConcept).not.toHaveBeenCalled()
        })

        it("captures insight when similar concept score < 0.92", async () => {
            mockSearchSimilar.mockResolvedValue([
                { content: "somewhat related", tags: [], embedding: [], source: "auto", score: 0.80 },
            ] as never)

            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We decided to use the repository pattern for data access"
            await hook["chat.message"](makeInput(), makeOutput([insight]))

            expect(mockAddConcept).toHaveBeenCalledTimes(1)
        })

        it("captures insight when no similar concepts exist", async () => {
            mockSearchSimilar.mockResolvedValue([])

            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We decided to use the repository pattern for data access"
            await hook["chat.message"](makeInput(), makeOutput([insight]))

            expect(mockAddConcept).toHaveBeenCalledTimes(1)
        })

        it("passes directory as project to searchSimilar", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/my/project")!
            const insight = "We decided to use the repository pattern for data access"
            await hook["chat.message"](makeInput(), makeOutput([insight]))

            const searchCall = mockSearchSimilar.mock.calls[0] as unknown as [number[], number, string]
            expect(searchCall[2]).toBe("/my/project")
        })
    })

    // =========================================================================
    // addConcept call shape
    // =========================================================================

    describe("addConcept arguments", () => {
        it("passes correct concept shape to addConcept", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/my/project")!
            const insight = "We decided to use the repository pattern for data access"
            await hook["chat.message"](
                makeInput({ agent: "architect" }),
                makeOutput([insight])
            )

            expect(mockAddConcept).toHaveBeenCalledTimes(1)
            const call = mockAddConcept.mock.calls[0] as unknown as [Record<string, unknown>]
            const concept = call[0]
            expect(concept.content).toBe(insight)
            expect(concept.source).toBe("auto")
            expect(concept.project).toBe("/my/project")
            expect(concept.embedding).toHaveLength(384)
            expect(Array.isArray(concept.tags)).toBe(true)
        })
    })

    // =========================================================================
    // Error resilience — never break chat pipeline
    // =========================================================================

    describe("error resilience", () => {
        it("silently catches generateEmbedding errors", async () => {
            mockGenerateEmbedding.mockRejectedValue(new Error("Model load failed"))

            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We decided to use the repository pattern for data access"

            // Should NOT throw
            await hook["chat.message"](makeInput(), makeOutput([insight]))
            expect(mockAddConcept).not.toHaveBeenCalled()
        })

        it("silently catches searchSimilar errors", async () => {
            mockSearchSimilar.mockRejectedValue(new Error("SurrealDB connection refused"))

            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We decided to use the repository pattern for data access"

            await hook["chat.message"](makeInput(), makeOutput([insight]))
            expect(mockAddConcept).not.toHaveBeenCalled()
        })

        it("silently catches addConcept errors", async () => {
            mockAddConcept.mockRejectedValue(new Error("SurrealDB write failed"))

            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            const insight = "We decided to use the repository pattern for data access"

            // Should NOT throw even if addConcept fails
            await hook["chat.message"](makeInput(), makeOutput([insight]))
        })
    })

    // =========================================================================
    // Multi-part text aggregation
    // =========================================================================

    describe("multi-part text handling", () => {
        it("joins multiple text parts with newlines", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            await hook["chat.message"](makeInput(), {
                message: {},
                parts: [
                    { type: "text", text: "We decided to use" },
                    { type: "tool_use", name: "bash" },
                    { type: "text", text: "the repository pattern for all data access layers" },
                ],
            })

            // The joined text should match decision pattern
            expect(mockGenerateEmbedding).toHaveBeenCalled()
        })

        it("ignores non-text parts", async () => {
            const hook = createMemoryCaptureHook(makeConfig(), "/test/dir")!
            await hook["chat.message"](makeInput(), {
                message: {},
                parts: [
                    { type: "tool_use", name: "bash" },
                    { type: "tool_result", content: "output" },
                ],
            })
            expect(mockGenerateEmbedding).not.toHaveBeenCalled()
        })
    })
})
