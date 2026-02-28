import type { PluginInput } from "@opencode-ai/plugin"
import type { CostMeteringConfig } from "../../config"
import type { SessionCostState } from "./types"
import { HOOK_NAME } from "./constants"
import { createPricingEngine } from "./pricing"
import {
    loadSessionCost,
    saveSessionCost,
    clearSessionCost,
    loadDailyTotal,
    saveDailyTotal,
    loadMonthlyTotal,
    saveMonthlyTotal,
    cleanupOldTotals,
    getTodayDate,
    getCurrentMonth,
} from "./storage"
import { log } from "../../shared/logger"

interface AssistantMessageInfo {
    role: "assistant"
    providerID?: string
    modelID?: string
    model?: { providerID: string; modelID: string }
    agent?: string
    tokens?: {
        input: number
        output: number
        reasoning: number
        cache: { read: number; write: number }
    }
}

interface MessageWrapper {
    info: { role: string } & Partial<AssistantMessageInfo>
}

function extractModelID(info: Partial<AssistantMessageInfo>): string {
    // Handle both flat and nested formats
    return info.model?.modelID ?? info.modelID ?? "unknown"
}

function extractProviderID(info: Partial<AssistantMessageInfo>): string {
    return info.model?.providerID ?? info.providerID ?? "unknown"
}

function formatUsd(amount: number): string {
    if (amount < 0.01) return `$${amount.toFixed(4)}`
    return `$${amount.toFixed(2)}`
}

export function createCostMeteringHook(
    ctx: PluginInput,
    config?: CostMeteringConfig
) {
    const pricingEngine = createPricingEngine({
        model_pricing: config?.model_pricing as Record<string, { input: number; output: number }> | undefined,
        default_pricing: config?.default_pricing as { input: number; output: number } | undefined,
    })

    const showIdleSummary = config?.show_idle_summary ?? true
    const dailyBudget = config?.daily_budget_usd
    const monthlyBudget = config?.monthly_budget_usd

    // In-memory session state cache
    const sessionStates = new Map<string, SessionCostState>()
    let cleanupDone = false

    function getOrLoadState(sessionID: string): SessionCostState {
        let state = sessionStates.get(sessionID)
        if (!state) {
            state = loadSessionCost(sessionID) ?? {
                sessionID,
                totalInputTokens: 0,
                totalOutputTokens: 0,
                totalReasoningTokens: 0,
                totalCacheReadTokens: 0,
                totalCostUsd: 0,
                recordCount: 0,
                lastCountedMessageIndex: -1,
                firstRecordAt: 0,
                lastRecordAt: 0,
            }
            sessionStates.set(sessionID, state)
        }
        return state
    }

    // ─── tool.execute.after: PRIMARY – track cost per assistant turn ───

    const toolExecuteAfter = async (
        input: { tool: string; sessionID: string; callID: string },
        _output: { title: string; output: string; metadata: unknown }
    ) => {
        const { sessionID } = input

        try {
            const response = await ctx.client.session.messages({
                path: { id: sessionID },
            })

            const messages = (response.data ?? response) as MessageWrapper[]
            const state = getOrLoadState(sessionID)

            // Process only NEW assistant messages (deduplication)
            let newCostThisTurn = 0
            for (let i = state.lastCountedMessageIndex + 1; i < messages.length; i++) {
                const msg = messages[i]
                if (msg.info.role !== "assistant") continue
                if (!msg.info.tokens) continue

                const info = msg.info as AssistantMessageInfo
                const modelID = extractModelID(info)
                const tokens = info.tokens!

                const inputTokens = tokens.input ?? 0
                const outputTokens = tokens.output ?? 0
                const reasoningTokens = tokens.reasoning ?? 0
                const cacheReadTokens = tokens.cache?.read ?? 0

                const cost = pricingEngine.estimateCost(modelID, inputTokens, outputTokens, reasoningTokens)

                state.totalInputTokens += inputTokens
                state.totalOutputTokens += outputTokens
                state.totalReasoningTokens += reasoningTokens
                state.totalCacheReadTokens += cacheReadTokens
                state.totalCostUsd += cost
                state.recordCount++
                state.lastCountedMessageIndex = i
                if (state.firstRecordAt === 0) state.firstRecordAt = Date.now()
                state.lastRecordAt = Date.now()

                newCostThisTurn += cost

                log(`[${HOOK_NAME}] Recorded`, {
                    sessionID,
                    modelID,
                    providerID: extractProviderID(info),
                    inputTokens,
                    outputTokens,
                    reasoningTokens,
                    cost: formatUsd(cost),
                    sessionTotal: formatUsd(state.totalCostUsd),
                })
            }

            if (newCostThisTurn > 0) {
                saveSessionCost(state)

                // Update daily total
                const today = getTodayDate()
                const dailyTotal = loadDailyTotal(today) + newCostThisTurn
                saveDailyTotal(today, dailyTotal)

                // Update monthly total
                const month = getCurrentMonth()
                const monthlyTotal = loadMonthlyTotal(month) + newCostThisTurn
                saveMonthlyTotal(month, monthlyTotal)
            }
        } catch {
            // Graceful degradation — do not disrupt tool execution
        }
    }

    // ─── event: SECONDARY – show summary toast + budget warnings ───

    const eventHandler = async ({ event }: { event: { type: string; properties?: unknown } }) => {
        const props = event.properties as Record<string, unknown> | undefined

        // Run cleanup once per plugin lifecycle
        if (!cleanupDone && (event.type === "session.created" || event.type === "session.idle")) {
            cleanupDone = true
            try { cleanupOldTotals() } catch { /* ignore */ }
        }

        if (event.type === "session.idle" && showIdleSummary) {
            const sessionID = props?.sessionID as string | undefined
            if (!sessionID) return

            const state = sessionStates.get(sessionID)
            if (!state || state.recordCount === 0) return

            const today = getTodayDate()
            const month = getCurrentMonth()
            const dailyTotal = loadDailyTotal(today)
            const monthlyTotal = loadMonthlyTotal(month)

            const summary = `💰 Session: ${formatUsd(state.totalCostUsd)} | Today: ${formatUsd(dailyTotal)} | Month: ${formatUsd(monthlyTotal)}`

            await ctx.client.tui.showToast({
                body: {
                    title: "Cost Metering",
                    message: summary,
                    variant: "info" as const,
                    duration: 4000,
                },
            }).catch(() => { })

            // Budget warnings
            if (dailyBudget && dailyTotal > dailyBudget) {
                await ctx.client.tui.showToast({
                    body: {
                        title: "⚠️ Daily Budget Exceeded",
                        message: `Spent ${formatUsd(dailyTotal)} of ${formatUsd(dailyBudget)} daily budget`,
                        variant: "warning" as const,
                        duration: 6000,
                    },
                }).catch(() => { })
            }

            if (monthlyBudget && monthlyTotal > monthlyBudget) {
                await ctx.client.tui.showToast({
                    body: {
                        title: "⚠️ Monthly Budget Exceeded",
                        message: `Spent ${formatUsd(monthlyTotal)} of ${formatUsd(monthlyBudget)} monthly budget`,
                        variant: "warning" as const,
                        duration: 6000,
                    },
                }).catch(() => { })
            }
        }

        if (event.type === "session.deleted") {
            const sessionInfo = props?.info as { id?: string } | undefined
            if (sessionInfo?.id) {
                sessionStates.delete(sessionInfo.id)
                clearSessionCost(sessionInfo.id)
            }
        }
    }

    return {
        "tool.execute.after": toolExecuteAfter,
        event: eventHandler,
    }
}
