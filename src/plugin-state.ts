/** Default context window for models not in the cache. */
export const DEFAULT_CONTEXT_LIMIT = 128_000;

export interface ModelCacheState {
  modelContextLimitsCache: Map<string, number>;
  anthropicContext1MEnabled: boolean;
}

export function createModelCacheState(): ModelCacheState {
  return {
    modelContextLimitsCache: new Map<string, number>(),
    anthropicContext1MEnabled: false,
  };
}

/**
 * Get the context window limit for a model.
 * Returns cached limit, Anthropic 1M if enabled, or DEFAULT_CONTEXT_LIMIT.
 */
export function getModelLimit(
  state: ModelCacheState,
  providerID: string,
  modelID: string
): number {
  const key = `${providerID}/${modelID}`;
  const cached = state.modelContextLimitsCache.get(key);
  if (cached) return cached;

  if (
    providerID === "anthropic" &&
    state.anthropicContext1MEnabled &&
    modelID.includes("sonnet")
  ) {
    return 1_000_000;
  }
  return DEFAULT_CONTEXT_LIMIT;
}
