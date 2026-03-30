/**
 * Adaptive Provider Detection — Tests
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    probeProvider,
    detectProviderFromId,
    detectProviderFromEndpoint,
    getCachedProfile,
    normalizeToolCallId,
    validateToolCallId,
    getCapabilities,
    listKnownProviders,
    getAllCachedProfiles,
    resetAll,
    configure,
    createProviderProbeHook,
    DEFAULT_CONFIG,
    KNOWN_PATTERNS,
} from "./index"

describe("Adaptive Provider Detection", () => {
    beforeEach(() => {
        resetAll()
    })

    // ── Provider Detection from ID ──────────────────────────────────────

    describe("detectProviderFromId", () => {
        it("detects OpenAI format", () => {
            expect(detectProviderFromId("call_abc123def456ghi789jk")).toBe("openai")
        })

        it("detects Anthropic format", () => {
            expect(detectProviderFromId("toolu_abc123def456ghi789jk")).toBe("anthropic")
        })

        it("detects Ollama format", () => {
            expect(detectProviderFromId("123")).toBe("ollama")
            expect(detectProviderFromId("call-abc")).toBe("ollama")
        })

        it("returns unknown for unrecognized format", () => {
            expect(detectProviderFromId("!!!invalid!!!")).toBe("unknown")
        })
    })

    // ── Provider Detection from Endpoint ────────────────────────────────

    describe("detectProviderFromEndpoint", () => {
        it("detects OpenAI", () => {
            expect(detectProviderFromEndpoint("https://api.openai.com/v1")).toBe("openai")
        })

        it("detects Anthropic", () => {
            expect(detectProviderFromEndpoint("https://api.anthropic.com")).toBe("anthropic")
        })

        it("detects Ollama (localhost)", () => {
            expect(detectProviderFromEndpoint("http://localhost:11434")).toBe("ollama")
        })

        it("detects Gemini", () => {
            expect(detectProviderFromEndpoint("https://generativelanguage.googleapis.com")).toBe("gemini")
        })

        it("detects DeepSeek", () => {
            expect(detectProviderFromEndpoint("https://api.deepseek.com/v1")).toBe("deepseek")
        })

        it("returns unknown for unrecognized endpoint", () => {
            expect(detectProviderFromEndpoint("https://custom-llm.example.com")).toBe("unknown")
        })
    })

    // ── Probing ─────────────────────────────────────────────────────────

    describe("probeProvider", () => {
        it("probes and returns profile", () => {
            const r = probeProvider("https://api.openai.com/v1", "gpt-4")
            expect(r.success).toBe(true)
            expect(r.profile).toBeDefined()
            expect(r.profile!.provider).toBe("openai")
            expect(r.profile!.supportsParallelCalls).toBe(true)
        })

        it("caches probe results", () => {
            probeProvider("https://api.openai.com/v1", "gpt-4")
            const cached = getCachedProfile("https://api.openai.com/v1", "gpt-4")
            expect(cached).toBeDefined()
            expect(cached!.provider).toBe("openai")
        })

        it("returns cached result on repeat probe", () => {
            const r1 = probeProvider("https://api.openai.com/v1", "gpt-4")
            const r2 = probeProvider("https://api.openai.com/v1", "gpt-4")
            expect(r1.profile!.detectedAt).toBe(r2.profile!.detectedAt) // Same cached result
        })

        it("rejects when disabled", () => {
            configure({ enabled: false })
            const r = probeProvider("https://api.openai.com/v1", "gpt-4")
            expect(r.success).toBe(false)
        })

        it("handles unknown provider gracefully", () => {
            const r = probeProvider("https://custom-llm.example.com", "model-x")
            expect(r.success).toBe(true)
            expect(r.profile!.provider).toBe("unknown")
        })
    })

    // ── Normalization ───────────────────────────────────────────────────

    describe("normalizeToolCallId", () => {
        it("strips OpenAI prefix", () => {
            const r = normalizeToolCallId("call_abc123def456ghi789jk")
            expect(r.normalizedId).toBe("abc123def456ghi789jk")
            expect(r.detectedProvider).toBe("openai")
        })

        it("strips Anthropic prefix", () => {
            const r = normalizeToolCallId("toolu_abc123def456ghi789jk")
            expect(r.normalizedId).toBe("abc123def456ghi789jk")
            expect(r.detectedProvider).toBe("anthropic")
        })

        it("keeps Ollama IDs as-is", () => {
            const r = normalizeToolCallId("123")
            expect(r.normalizedId).toBe("123")
            expect(r.detectedProvider).toBe("ollama")
        })

        it("preserves original ID", () => {
            const r = normalizeToolCallId("call_test123")
            expect(r.originalId).toBe("call_test123")
        })
    })

    // ── Validation ──────────────────────────────────────────────────────

    describe("validateToolCallId", () => {
        it("validates correct OpenAI format", () => {
            expect(validateToolCallId("call_abc123def456ghi789jk", "openai")).toBe(true)
        })

        it("rejects incorrect format for OpenAI", () => {
            expect(validateToolCallId("123", "openai")).toBe(false)
        })

        it("accepts any format for unknown provider", () => {
            expect(validateToolCallId("anything", "unknown-provider")).toBe(true)
        })
    })

    // ── Capabilities ────────────────────────────────────────────────────

    describe("getCapabilities", () => {
        it("returns OpenAI capabilities", () => {
            const c = getCapabilities("openai")
            expect(c.parallel).toBe(true)
            expect(c.maxTools).toBe(128)
        })

        it("returns Ollama capabilities", () => {
            const c = getCapabilities("ollama")
            expect(c.parallel).toBe(false)
            expect(c.maxTools).toBe(32)
        })

        it("returns defaults for unknown provider", () => {
            const c = getCapabilities("unknown")
            expect(c.parallel).toBe(false)
            expect(c.maxTools).toBe(32)
        })
    })

    // ── Known Providers ─────────────────────────────────────────────────

    describe("listKnownProviders", () => {
        it("lists at least 4 providers", () => {
            const providers = listKnownProviders()
            expect(providers.length).toBeGreaterThanOrEqual(4)
            expect(providers).toContain("openai")
            expect(providers).toContain("anthropic")
            expect(providers).toContain("ollama")
        })
    })

    // ── Hook Factory ────────────────────────────────────────────────────

    describe("createProviderProbeHook", () => {
        it("returns hook when enabled", () => {
            const hook = createProviderProbeHook()
            expect(hook).not.toBeNull()
            expect(hook!["agent.start"]).toBeDefined()
            expect(hook!["tool.call.validate"]).toBeDefined()
        })

        it("returns null when disabled", () => {
            expect(createProviderProbeHook({ enabled: false })).toBeNull()
        })

        it("agent.start probes provider", async () => {
            resetAll()
            const hook = createProviderProbeHook()!
            await hook["agent.start"]({ endpoint: "https://api.openai.com/v1", model: "gpt-4" })
            expect(getAllCachedProfiles().length).toBe(1)
        })

        it("tool.call.validate normalizes ID", async () => {
            resetAll()
            const hook = createProviderProbeHook()!
            const ctx: Record<string, unknown> = { toolCallId: "call_abc123def456ghi789jk" }
            await hook["tool.call.validate"](ctx)
            expect(ctx.__normalizedToolCallId).toBe("abc123def456ghi789jk")
            expect(ctx.__detectedProvider).toBe("openai")
        })
    })

    // ── Configuration ───────────────────────────────────────────────────

    describe("configuration", () => {
        it("has known patterns", () => {
            expect(KNOWN_PATTERNS.length).toBeGreaterThanOrEqual(4)
        })

        it("cache TTL defaults to 24 hours", () => {
            expect(DEFAULT_CONFIG.cacheTtlMs).toBe(86400000)
        })
    })
})
