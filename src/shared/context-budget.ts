/**
 * Context Budget Engine — Priority-based injection allocation.
 *
 * Prevents context window overflow by tracking how much each hook injects
 * and skipping/truncating low-priority injections when budget is tight.
 *
 * Budget rule: max 40% of context window for hook injections.
 * Remaining 60% reserved for conversation + tool outputs.
 */
import { log } from "./logger"
import type { TaskType, HookName } from "./task-classifier"
import { isHookActiveForTask } from "./task-classifier"

// ─── Constants ──────────────────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4
const INJECTION_BUDGET_RATIO = 0.40
const DEFAULT_CONTEXT_LIMIT = 128_000

// ─── Types ──────────────────────────────────────────────────────────────────────

export enum InjectionPriority {
    /** Compaction hints, memory concepts — first to be cut */
    OPTIONAL = 0,
    /** README injection, usage reminders, category reminders */
    LOW = 1,
    /** Todo state, skill reminders, notepad */
    MEDIUM = 2,
    /** Rules, AGENTS.md, active plan context */
    HIGH = 3,
    /** System prompt, tool descriptions — never cut (not tracked) */
    CRITICAL = 4,
}

export interface AllocationResult {
    /** Whether the injection is allowed */
    allowed: boolean
    /** Maximum tokens to inject (may be less than requested for truncation) */
    maxTokens: number
}

interface SessionBudget {
    /** Total tokens injected across all hooks for this session */
    totalInjected: number
    /** Per-hook token tracking */
    hookInjections: Map<string, number>
    /** Current task type for activation matrix filtering */
    taskType?: TaskType
}

// ─── Token Estimation ───────────────────────────────────────────────────────────

/** Estimate token count from text length. Uses chars/4 heuristic. */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** Truncate text to fit within a token budget, preserving leading content. */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
    const maxChars = maxTokens * CHARS_PER_TOKEN
    if (text.length <= maxChars) return text
    return text.slice(0, maxChars) + "\n\n[Truncated to fit context budget]"
}

// ─── Context Budget ─────────────────────────────────────────────────────────────

export class ContextBudget {
    private contextLimit: number
    private sessions: Map<string, SessionBudget> = new Map()

    constructor(contextLimit?: number) {
        this.contextLimit = contextLimit ?? DEFAULT_CONTEXT_LIMIT
    }

    /** Update context limit (e.g., when model changes). */
    setContextLimit(limit: number): void {
        this.contextLimit = limit
        log("[context-budget] limit updated", { limit })
    }

    /** Get the current context limit. */
    getContextLimit(): number {
        return this.contextLimit
    }

    /** Set the current task type for a session (used by activation matrix). */
    setTaskType(taskType: TaskType, sessionID: string): void {
        let session = this.sessions.get(sessionID)
        if (!session) {
            session = { totalInjected: 0, hookInjections: new Map() }
            this.sessions.set(sessionID, session)
        }
        session.taskType = taskType
        log("[context-budget] task type set", { taskType, sessionID })
    }

    /** Get the current task type for a session. */
    getTaskType(sessionID: string): TaskType | undefined {
        return this.sessions.get(sessionID)?.taskType
    }

    /** Get the total injection budget (40% of context window). */
    getInjectionBudget(): number {
        return Math.floor(this.contextLimit * INJECTION_BUDGET_RATIO)
    }

    /** Get remaining injection budget for a session. */
    getRemaining(sessionID: string): number {
        const session = this.sessions.get(sessionID)
        const used = session?.totalInjected ?? 0
        return Math.max(0, this.getInjectionBudget() - used)
    }

    /** Get injection budget usage ratio (0.0 to 1.0). */
    getUsageRatio(sessionID: string): number {
        const budget = this.getInjectionBudget()
        if (budget <= 0) return 1.0
        const session = this.sessions.get(sessionID)
        return (session?.totalInjected ?? 0) / budget
    }

    /**
     * Request an allocation for a hook injection.
     *
     * Returns whether the injection is allowed and the max tokens to use.
     * LOW/OPTIONAL hooks are skipped when budget usage > 80%.
     * MEDIUM hooks get truncated allocation when budget > 60%.
     * HIGH hooks always get allocated (with truncation if needed).
     * CRITICAL hooks are never tracked or limited.
     */
    requestAllocation(
        hookName: string,
        priority: InjectionPriority,
        estimatedTokens: number,
        sessionID: string,
    ): AllocationResult {
        // CRITICAL priority: always allow, don't track
        if (priority === InjectionPriority.CRITICAL) {
            return { allowed: true, maxTokens: estimatedTokens }
        }

        // Task-aware activation: check if this hook should fire for current task
        const session = this.sessions.get(sessionID)
        if (session?.taskType && !isHookActiveForTask(hookName as HookName, session.taskType)) {
            log("[context-budget] skipped (task type mismatch)", {
                hookName, taskType: session.taskType,
            })
            return { allowed: false, maxTokens: 0 }
        }

        const remaining = this.getRemaining(sessionID)
        const usageRatio = this.getUsageRatio(sessionID)

        // OPTIONAL: skip when budget > 60% used
        if (priority === InjectionPriority.OPTIONAL && usageRatio > 0.60) {
            log("[context-budget] skipped (OPTIONAL, budget tight)", { hookName, usageRatio: usageRatio.toFixed(2) })
            return { allowed: false, maxTokens: 0 }
        }

        // LOW: skip when budget > 80% used
        if (priority === InjectionPriority.LOW && usageRatio > 0.80) {
            log("[context-budget] skipped (LOW, budget tight)", { hookName, usageRatio: usageRatio.toFixed(2) })
            return { allowed: false, maxTokens: 0 }
        }

        // No remaining budget at all
        if (remaining <= 0) {
            log("[context-budget] skipped (no budget remaining)", { hookName, priority })
            return { allowed: false, maxTokens: 0 }
        }

        // MEDIUM: truncate to 50% of remaining if budget > 60%
        if (priority === InjectionPriority.MEDIUM && usageRatio > 0.60) {
            const truncated = Math.min(estimatedTokens, Math.floor(remaining * 0.5))
            log("[context-budget] truncated (MEDIUM, budget tight)", {
                hookName,
                requested: estimatedTokens,
                allowed: truncated,
            })
            return { allowed: truncated > 0, maxTokens: truncated }
        }

        // HIGH: allocate up to remaining budget
        const maxTokens = Math.min(estimatedTokens, remaining)
        return { allowed: true, maxTokens }
    }

    /** Record that a hook actually injected tokens. */
    recordInjection(hookName: string, actualTokens: number, sessionID: string): void {
        let session = this.sessions.get(sessionID)
        if (!session) {
            session = { totalInjected: 0, hookInjections: new Map() }
            this.sessions.set(sessionID, session)
        }

        session.totalInjected += actualTokens
        const prev = session.hookInjections.get(hookName) ?? 0
        session.hookInjections.set(hookName, prev + actualTokens)
    }

    /** Reset budget for a session (e.g., after compaction). */
    resetSession(sessionID: string): void {
        this.sessions.delete(sessionID)
        log("[context-budget] session reset", { sessionID })
    }

    /** Clear all session data. */
    clearAll(): void {
        this.sessions.clear()
    }
}

// ─── Factory ────────────────────────────────────────────────────────────────────

/** Create a new ContextBudget instance. */
export function createContextBudget(contextLimit?: number): ContextBudget {
    return new ContextBudget(contextLimit)
}
