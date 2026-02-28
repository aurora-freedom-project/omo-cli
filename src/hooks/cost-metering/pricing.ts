export interface ModelPrice {
    input: number
    output: number
}

/**
 * Bundled default pricing per million tokens (USD).
 * Sources: Official API docs + OpenRouter (Feb 2026).
 * User overrides in omo-cli.json `cost_metering.model_pricing` merge on top.
 */
const BUNDLED_PRICING: Record<string, ModelPrice> = {
    // Anthropic (direct + Antigravity-proxied)
    "claude-opus-4-6": { input: 15.00, output: 75.00 },
    "claude-opus-4-5": { input: 15.00, output: 75.00 },
    "claude-opus": { input: 15.00, output: 75.00 },
    "claude-sonnet-4-5": { input: 3.00, output: 15.00 },
    "claude-sonnet": { input: 3.00, output: 15.00 },
    "claude-haiku-4-5": { input: 0.80, output: 4.00 },
    "claude-haiku": { input: 0.80, output: 4.00 },

    // Google (Antigravity-proxied + Gemini CLI)
    "gemini-3-pro": { input: 1.25, output: 5.00 },
    "gemini-3-flash": { input: 0.075, output: 0.30 },
    "gemini-3-pro-preview": { input: 1.25, output: 5.00 },
    "gemini-3-flash-preview": { input: 0.075, output: 0.30 },
    "gemini-2.5-pro": { input: 1.25, output: 5.00 },
    "gemini-2.5-flash": { input: 0.075, output: 0.30 },

    // OpenAI (from model-requirements.ts)
    "gpt-5.2-codex": { input: 1.50, output: 6.00 },
    "gpt-5.2": { input: 2.50, output: 10.00 },
    "gpt-5-mini": { input: 0.15, output: 0.60 },
    "gpt-5-nano": { input: 0.07, output: 0.30 },

    // Ollama Cloud (mike-local profile)
    "minimax-m2": { input: 0.30, output: 1.20 },
    "glm-5": { input: 1.00, output: 3.20 },
    "glm-4": { input: 0.30, output: 0.60 },
    "qwen3.5": { input: 0.55, output: 3.50 },
    "qwen3-coder": { input: 0.14, output: 0.42 },

    // Other
    "big-pickle": { input: 2.00, output: 8.00 },
}

const DEFAULT_PRICE: ModelPrice = { input: 3.00, output: 15.00 }

/**
 * Normalize model ID by stripping known prefixes/suffixes:
 * - "antigravity-" prefix
 * - "-thinking" suffix
 * - ":cloud" suffix
 * - Version tags like ":397b-cloud"
 */
export function normalizeModelID(raw: string): string {
    let id = raw.toLowerCase().trim()

    // Strip "antigravity-" prefix
    if (id.startsWith("antigravity-")) {
        id = id.slice("antigravity-".length)
    }

    // Strip ":cloud" or ":<tag>-cloud" suffix (e.g. ":397b-cloud")
    const colonIdx = id.indexOf(":")
    if (colonIdx !== -1) {
        id = id.slice(0, colonIdx)
    }

    // Strip "-thinking" suffix
    if (id.endsWith("-thinking")) {
        id = id.slice(0, -"-thinking".length)
    }

    return id
}

/**
 * Create a pricing engine with user overrides merged on top of bundled defaults.
 */
export function createPricingEngine(config?: {
    model_pricing?: Record<string, ModelPrice>
    default_pricing?: ModelPrice
}) {
    const pricing = { ...BUNDLED_PRICING, ...(config?.model_pricing ?? {}) }
    const defaultPrice = config?.default_pricing ?? DEFAULT_PRICE

    function matchModelPricing(modelID: string): ModelPrice {
        const normalized = normalizeModelID(modelID)

        // 1. Exact match
        if (pricing[normalized]) {
            return pricing[normalized]
        }

        // 2. Fuzzy prefix match — find longest matching key
        let bestMatch: string | null = null
        let bestLength = 0
        for (const key of Object.keys(pricing)) {
            if (normalized.startsWith(key) && key.length > bestLength) {
                bestMatch = key
                bestLength = key.length
            }
        }
        if (bestMatch) {
            return pricing[bestMatch]
        }

        // 3. Reverse fuzzy — check if any key starts with normalized
        for (const key of Object.keys(pricing)) {
            if (key.startsWith(normalized) && normalized.length >= 3) {
                return pricing[key]
            }
        }

        return defaultPrice
    }

    function estimateCost(
        modelID: string,
        inputTokens: number,
        outputTokens: number,
        reasoningTokens: number = 0
    ): number {
        const price = matchModelPricing(modelID)
        const inputCost = (inputTokens / 1_000_000) * price.input
        // Reasoning tokens are priced same as output tokens (Anthropic billing model)
        const outputCost = ((outputTokens + reasoningTokens) / 1_000_000) * price.output
        return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000 // 6 decimal precision
    }

    return { matchModelPricing, estimateCost, normalizeModelID }
}
