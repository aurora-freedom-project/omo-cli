/**
 * Adaptive Provider Detection — Auto-detect LLM tool-call formats (from PentAGI)
 *
 * Different LLM providers use different formats for tool call IDs:
 * - OpenAI: "call_abc123" (prefix + alphanumeric)
 * - Anthropic: "toolu_01A..." (prefix + base62)
 * - Ollama: "123" or "call-abc" (numeric or kebab)
 *
 * This module probes each provider to learn its format at runtime,
 * caches results, and provides normalization across providers.
 *
 * Inspired by PentAGI's adaptive tool ID detection in agents.go.
 */

import { log } from "../../shared/logger"

// ── Types ────────────────────────────────────────────────────────────────────

interface ProviderProfile {
    provider: string
    endpoint: string
    model: string
    toolCallIdFormat: string       // Regex pattern for tool call IDs
    toolCallIdCharset: string      // Character set description
    supportsParallelCalls: boolean
    supportsStreaming: boolean
    maxToolsPerCall: number
    detectedAt: number
    probeLatencyMs: number
}

interface ProbeResult {
    success: boolean
    profile?: ProviderProfile
    error?: string
}

interface ProviderConfig {
    enabled: boolean
    cacheTtlMs: number           // How long to cache probe results
    probeTimeoutMs: number       // Timeout for probe requests
    fallbackProfiles: Record<string, Partial<ProviderProfile>>
    knownPatterns: ProviderPattern[]
}

interface ProviderPattern {
    name: string
    idRegex: RegExp
    charset: string
    parallel: boolean
    maxTools: number
}

interface NormalizeResult {
    originalId: string
    normalizedId: string
    detectedProvider: string
}

// ── Known Patterns ───────────────────────────────────────────────────────────

const KNOWN_PATTERNS: ProviderPattern[] = [
    {
        name: "openai",
        idRegex: /^call_[a-zA-Z0-9]{20,30}$/,
        charset: "alphanumeric",
        parallel: true,
        maxTools: 128,
    },
    {
        name: "anthropic",
        idRegex: /^toolu_[a-zA-Z0-9]{20,30}$/,
        charset: "base62",
        parallel: true,
        maxTools: 64,
    },
    {
        name: "ollama",
        idRegex: /^[a-z0-9_-]{1,20}$/,
        charset: "lowercase-alphanumeric",
        parallel: false,
        maxTools: 32,
    },
    {
        name: "gemini",
        idRegex: /^[a-zA-Z0-9_-]{8,32}$/,
        charset: "alphanumeric-dash",
        parallel: true,
        maxTools: 64,
    },
    {
        name: "deepseek",
        idRegex: /^call_[a-zA-Z0-9_]{16,}$/,
        charset: "alphanumeric-underscore",
        parallel: true,
        maxTools: 64,
    },
]

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ProviderConfig = {
    enabled: true,
    cacheTtlMs: 24 * 60 * 60 * 1000,  // 24 hours
    probeTimeoutMs: 5000,
    fallbackProfiles: {
        openai: { toolCallIdFormat: "^call_[a-zA-Z0-9]+$", supportsParallelCalls: true, maxToolsPerCall: 128 },
        anthropic: { toolCallIdFormat: "^toolu_[a-zA-Z0-9]+$", supportsParallelCalls: true, maxToolsPerCall: 64 },
        ollama: { toolCallIdFormat: "^[a-z0-9_-]+$", supportsParallelCalls: false, maxToolsPerCall: 32 },
    },
    knownPatterns: KNOWN_PATTERNS,
}

// ── State ────────────────────────────────────────────────────────────────────

const profileCache = new Map<string, ProviderProfile>()
let config: ProviderConfig = { ...DEFAULT_CONFIG, knownPatterns: [...KNOWN_PATTERNS] }

// ── Cache Key ────────────────────────────────────────────────────────────────

function cacheKey(endpoint: string, model: string): string {
    return `${endpoint}|${model}`
}

// ── Provider Detection ───────────────────────────────────────────────────────

/**
 * Detect provider from a tool call ID by matching against known patterns.
 */
function detectProviderFromId(toolCallId: string): string {
    for (const pattern of config.knownPatterns) {
        if (pattern.idRegex.test(toolCallId)) {
            return pattern.name
        }
    }
    return "unknown"
}

/**
 * Detect provider from an endpoint URL.
 */
function detectProviderFromEndpoint(endpoint: string): string {
    const lower = endpoint.toLowerCase()
    if (lower.includes("openai.com") || lower.includes("api.openai")) return "openai"
    if (lower.includes("anthropic.com")) return "anthropic"
    if (lower.includes("localhost:11434") || lower.includes("ollama")) return "ollama"
    if (lower.includes("generativelanguage.googleapis")) return "gemini"
    if (lower.includes("deepseek")) return "deepseek"
    if (lower.includes("groq")) return "groq"
    if (lower.includes("together")) return "together"
    return "unknown"
}

/**
 * Probe a provider endpoint to learn its tool-call format.
 * In a real implementation, this would send a test tool-call request.
 */
function probeProvider(endpoint: string, model: string): ProbeResult {
    if (!config.enabled) {
        return { success: false, error: "Provider probing disabled" }
    }

    // Check cache first
    const key = cacheKey(endpoint, model)
    const cached = profileCache.get(key)
    if (cached && (Date.now() - cached.detectedAt) < config.cacheTtlMs) {
        return { success: true, profile: cached }
    }

    const startTime = Date.now()
    const detectedProvider = detectProviderFromEndpoint(endpoint)

    // Find matching pattern
    const pattern = config.knownPatterns.find(p => p.name === detectedProvider)
    const fallback = config.fallbackProfiles[detectedProvider]

    const profile: ProviderProfile = {
        provider: detectedProvider,
        endpoint,
        model,
        toolCallIdFormat: pattern?.idRegex.source ?? fallback?.toolCallIdFormat ?? "^[a-zA-Z0-9_-]+$",
        toolCallIdCharset: pattern?.charset ?? "alphanumeric",
        supportsParallelCalls: pattern?.parallel ?? fallback?.supportsParallelCalls ?? false,
        supportsStreaming: true,
        maxToolsPerCall: pattern?.maxTools ?? fallback?.maxToolsPerCall ?? 32,
        detectedAt: Date.now(),
        probeLatencyMs: Date.now() - startTime,
    }

    // Cache the result
    profileCache.set(key, profile)

    log("[provider-probe] Provider detected", { provider: detectedProvider, endpoint, model })
    return { success: true, profile }
}

/**
 * Get cached profile for an endpoint + model.
 */
function getCachedProfile(endpoint: string, model: string): ProviderProfile | undefined {
    const key = cacheKey(endpoint, model)
    const cached = profileCache.get(key)
    if (cached && (Date.now() - cached.detectedAt) < config.cacheTtlMs) {
        return cached
    }
    return undefined
}

/**
 * Normalize a tool call ID to a standard format.
 */
function normalizeToolCallId(toolCallId: string): NormalizeResult {
    const detected = detectProviderFromId(toolCallId)
    // Strip provider-specific prefixes for normalized ID
    let normalizedId = toolCallId
    if (toolCallId.startsWith("call_")) normalizedId = toolCallId.slice(5)
    if (toolCallId.startsWith("toolu_")) normalizedId = toolCallId.slice(6)

    return {
        originalId: toolCallId,
        normalizedId,
        detectedProvider: detected,
    }
}

/**
 * Validate if a tool call ID matches the expected format for a provider.
 */
function validateToolCallId(toolCallId: string, providerName: string): boolean {
    const pattern = config.knownPatterns.find(p => p.name === providerName)
    if (!pattern) return true // Unknown provider — accept any format
    return pattern.idRegex.test(toolCallId)
}

/**
 * Get provider capabilities.
 */
function getCapabilities(providerName: string): { parallel: boolean; maxTools: number } {
    const pattern = config.knownPatterns.find(p => p.name === providerName)
    if (pattern) {
        return { parallel: pattern.parallel, maxTools: pattern.maxTools }
    }
    return { parallel: false, maxTools: 32 }
}

/**
 * List all known provider patterns.
 */
function listKnownProviders(): string[] {
    return config.knownPatterns.map(p => p.name)
}

/**
 * Get all cached profiles.
 */
function getAllCachedProfiles(): ProviderProfile[] {
    return Array.from(profileCache.values())
}

/**
 * Reset all state.
 */
function resetAll(): void {
    profileCache.clear()
    config = { ...DEFAULT_CONFIG, knownPatterns: [...KNOWN_PATTERNS] }
}

function configure(overrides: Partial<ProviderConfig>): void {
    config = { ...config, ...overrides }
}

// ── Hook Factory ─────────────────────────────────────────────────────────────

function createProviderProbeHook(overrides?: Partial<ProviderConfig>): Record<string, Function> | null {
    if (overrides) configure(overrides)
    if (!config.enabled) return null

    return {
        "agent.start": async (ctx: Record<string, unknown>) => {
            const endpoint = (ctx.endpoint as string) ?? "http://localhost:11434"
            const model = (ctx.model as string) ?? "unknown"
            probeProvider(endpoint, model)
        },

        "tool.call.validate": async (ctx: Record<string, unknown>) => {
            const toolCallId = ctx.toolCallId as string
            if (toolCallId) {
                const detected = detectProviderFromId(toolCallId)
                let normalizedId = toolCallId
                if (toolCallId.startsWith("call_")) normalizedId = toolCallId.slice(5)
                if (toolCallId.startsWith("toolu_")) normalizedId = toolCallId.slice(6)
                ctx.__normalizedToolCallId = normalizedId
                ctx.__detectedProvider = detected
            }
        },
    }
}

// ── Exports ──────────────────────────────────────────────────────────────────

export {
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
    type ProviderProfile,
    type ProviderConfig,
    type ProbeResult,
    type NormalizeResult,
    type ProviderPattern,
}
