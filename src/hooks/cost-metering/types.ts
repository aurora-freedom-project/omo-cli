export interface UsageRecord {
    timestamp: number
    sessionID: string
    agent?: string
    providerID: string
    modelID: string
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    estimatedCostUsd: number
}

export interface SessionCostState {
    sessionID: string
    totalInputTokens: number
    totalOutputTokens: number
    totalReasoningTokens: number
    totalCacheReadTokens: number
    totalCostUsd: number
    recordCount: number
    lastCountedMessageIndex: number
    firstRecordAt: number
    lastRecordAt: number
}
