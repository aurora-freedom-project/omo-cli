/**
 * @module shared/model-availability
 * 
 * Provides utilities for querying, filtering, and matching AI models available 
 * from the connected providers. Handles fuzzy matching of model names and 
 * falling back to local file caches (`provider-models.json` or `models.json`) 
 * when exact data isn't provided by the SDK.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { log } from "./logger"
import { getOpenCodeCacheDir } from "./data-path"
import { readProviderModelsCache, hasProviderModelsCache } from "./connected-providers-cache"
import type { OpencodeClient } from "./sdk-types"
import { parseJsoncSafe, readJsoncFileEffect } from "./jsonc-parser"
import { Effect } from "effect"
import { fromPromise, runEffect } from "./effect/result"

/**
 * Fuzzy match a target model name against available models
 * 
 * @param target - The model name or substring to search for (e.g., "gpt-5.2", "claude-opus")
 * @param available - Set of available model names in format "provider/model-name"
 * @param providers - Optional array of provider names to filter by (e.g., ["openai", "anthropic"])
 * @returns The matched model name or null if no match found
 * 
 * Matching priority:
 * 1. Exact match (if exists)
 * 2. Shorter model name (more specific)
 * 
 * Matching is case-insensitive substring match.
 * If providers array is given, only models starting with "provider/" are considered.
 * 
 * @example
 * const available = new Set(["openai/gpt-5.2", "openai/gpt-5.2-codex", "anthropic/claude-opus-4-5"])
 * fuzzyMatchModel("gpt-5.2", available) // → "openai/gpt-5.2"
 * fuzzyMatchModel("claude", available, ["openai"]) // → null (provider filter excludes anthropic)
 */
function normalizeModelName(name: string): string {
	return name
		.toLowerCase()
		.replace(/claude-(opus|sonnet|haiku)-4-5/g, "claude-$1-4.5")
		.replace(/claude-(opus|sonnet|haiku)-4\.5/g, "claude-$1-4.5")
}

/**
 * Fuzzy match a model name against a set of available models.
 * Supports provider filtering and normalized comparison (e.g., claude-sonnet-4-5 → claude-sonnet-4.5).
 */
export function fuzzyMatchModel(
	target: string,
	available: Set<string>,
	providers?: string[],
): string | null {
	log("[fuzzyMatchModel] called", { target, availableCount: available.size, providers })

	if (available.size === 0) {
		log("[fuzzyMatchModel] empty available set")
		return null
	}

	const targetNormalized = normalizeModelName(target)

	// Filter by providers if specified
	let candidates = Array.from(available)
	if (providers && providers.length > 0) {
		const providerSet = new Set(providers)
		candidates = candidates.filter((model) => {
			const [provider] = model.split("/")
			return providerSet.has(provider)
		})
		log("[fuzzyMatchModel] filtered by providers", { candidateCount: candidates.length, candidates: candidates.slice(0, 10) })
	}

	if (candidates.length === 0) {
		log("[fuzzyMatchModel] no candidates after filter")
		return null
	}

	// Find all matches (case-insensitive substring match with normalization)
	const matches = candidates.filter((model) =>
		normalizeModelName(model).includes(targetNormalized),
	)

	log("[fuzzyMatchModel] substring matches", { targetNormalized, matchCount: matches.length, matches })

	if (matches.length === 0) {
		return null
	}

	// Priority 1: Exact match (normalized)
	const exactMatch = matches.find((model) => normalizeModelName(model) === targetNormalized)
	if (exactMatch) {
		log("[fuzzyMatchModel] exact match found", { exactMatch })
		return exactMatch
	}

	// Priority 2: Shorter model name (more specific)
	const result = matches.reduce((shortest, current) =>
		current.length < shortest.length ? current : shortest,
	)
	log("[fuzzyMatchModel] shortest match", { result })
	return result
}

/** 
 * Effect variant of getConnectedProviders.
 */
export const getConnectedProvidersEffect = (client: OpencodeClient): Effect.Effect<string[], never> =>
	Effect.gen(function* () {
		if (!client?.provider?.list) {
			log("[getConnectedProviders] client.provider.list not available")
			return []
		}

		const result = yield* fromPromise(() => client.provider.list(), "client.provider.list").pipe(
			Effect.catchAll((err) => {
				log("[getConnectedProviders] SDK error", { error: String(err) })
				return Effect.succeed({ data: { connected: [] as string[] } })
			})
		)

		const connected = result.data?.connected ?? []
		log("[getConnectedProviders] connected providers", { count: connected.length, providers: connected })
		return connected
	})

/** 
 * Fetches the IDs of all connected providers from the OpenCode SDK client.
 * 
 * @param {OpencodeClient} client - The active OpenCode SDK client object.
 * @returns {Promise<string[]>} A list of connected provider identifiers. Returns an empty array if none are connected or if an error occurs.
 */
export async function getConnectedProviders(client: OpencodeClient): Promise<string[]> {
	return runEffect(getConnectedProvidersEffect(client))
}

/**
 * Effect variant of fetchAvailableModels.
 */
export const fetchAvailableModelsEffect = (
	_client?: OpencodeClient,
	options?: { connectedProviders?: string[] | null }
): Effect.Effect<Set<string>, never> =>
	Effect.gen(function* () {
		const connectedProvidersUnknown = options?.connectedProviders === null || options?.connectedProviders === undefined

		log("[fetchAvailableModels] CALLED", {
			connectedProvidersUnknown,
			connectedProviders: options?.connectedProviders
		})

		const modelSet = new Set<string>()

		if (connectedProvidersUnknown) {
			log("[fetchAvailableModels] connected providers unknown, returning empty set for fallback resolution")
			return modelSet
		}

		const connectedProviders = options!.connectedProviders!
		const connectedSet = new Set(connectedProviders)

		const providerModelsCache = readProviderModelsCache()
		if (providerModelsCache) {
			log("[fetchAvailableModels] using provider-models cache (whitelist-filtered)")

			for (const [providerId, modelIds] of Object.entries(providerModelsCache.models)) {
				if (!connectedSet.has(providerId)) {
					continue
				}
				for (const modelId of modelIds) {
					modelSet.add(`${providerId}/${modelId}`)
				}
			}

			log("[fetchAvailableModels] parsed from provider-models cache", {
				count: modelSet.size,
				connectedProviders: connectedProviders.slice(0, 5)
			})

			return modelSet
		}

		log("[fetchAvailableModels] provider-models cache not found, falling back to models.json")
		const cacheFile = join(getOpenCodeCacheDir(), "models.json")

		const contentEffect = readJsoncFileEffect<Record<string, { id?: string; models?: Record<string, { id?: string }> }>>(cacheFile).pipe(
			Effect.catchAll((err) => {
				log("[fetchAvailableModels] error", { error: String(err) })
				return Effect.succeed(null)
			})
		)

		const data = yield* contentEffect
		if (!data) return modelSet

		const providerIds = Object.keys(data)
		log("[fetchAvailableModels] providers found in models.json", { count: providerIds.length, providers: providerIds.slice(0, 10) })

		for (const providerId of providerIds) {
			if (!connectedSet.has(providerId)) {
				continue
			}

			const provider = data[providerId]
			const models = provider?.models
			if (!models || typeof models !== "object") continue

			for (const modelKey of Object.keys(models)) {
				modelSet.add(`${providerId}/${modelKey}`)
			}
		}

		log("[fetchAvailableModels] parsed models from models.json (NO whitelist filtering)", {
			count: modelSet.size,
			connectedProviders: connectedProviders.slice(0, 5)
		})

		return modelSet
	})

/**
 * Builds a set of available model identifiers based on the user's connected providers.
 * 
 * It attempts to read from the cached `provider-models.json` first (which is a whitelist
 * of models specific to the connected providers). If not found, it falls back to parsing
 * the raw `models.json` file.
 * 
 * @param {OpencodeClient} [_client] - (Unused) The OpenCode SDK client object. Kept for backward compatibility.
 * @param {Object} [options] - Filtering options.
 * @param {string[] | null} [options.connectedProviders] - Array of specific providers to load models for.
 * @returns {Promise<Set<string>>} A set of model identifiers in the format `"providerId/modelId"`.
 */
export async function fetchAvailableModels(
	_client?: OpencodeClient,
	options?: { connectedProviders?: string[] | null }
): Promise<Set<string>> {
	return runEffect(fetchAvailableModelsEffect(_client, options))
}

/** 
 * Resets the internal model cache. 
 * Currently a no-op, retained to preserve backward compatibility with older callers.
 */
export function __resetModelCache(): void { }

/** 
 * Checks if any valid model cache file exists on disk.
 * Prioritizes `provider-models.json`, then falls back to checking `models.json`.
 * 
 * @returns {boolean} `true` if a cache file is found, `false` otherwise.
 */
export function isModelCacheAvailable(): boolean {
	if (hasProviderModelsCache()) {
		return true
	}
	const cacheFile = join(getOpenCodeCacheDir(), "models.json")
	return existsSync(cacheFile)
}
