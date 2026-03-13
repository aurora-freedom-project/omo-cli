/**
 * Lightweight task classifier for context-aware hook injection.
 * Uses keyword matching — no LLM call needed.
 */

export type TaskType = "coding" | "research" | "review" | "chat"

/** Hook names that map to task-aware activation */
export type HookName =
    | "rules-injector"
    | "directory-agents-injector"
    | "directory-readme-injector"
    | "agent-usage-reminder"
    | "category-skill-reminder"
    | "compaction-context-injector"

/**
 * Task-to-hook activation matrix.
 * true = hook should inject for this task type.
 */
const ACTIVATION_MATRIX: Record<TaskType, Record<HookName, boolean>> = {
    coding: {
        "rules-injector": true,
        "directory-agents-injector": true,
        "directory-readme-injector": false,
        "agent-usage-reminder": true,
        "category-skill-reminder": true,
        "compaction-context-injector": true,
    },
    research: {
        "rules-injector": false,
        "directory-agents-injector": false,
        "directory-readme-injector": true,
        "agent-usage-reminder": false,
        "category-skill-reminder": true,
        "compaction-context-injector": true,
    },
    review: {
        "rules-injector": true,
        "directory-agents-injector": false,
        "directory-readme-injector": false,
        "agent-usage-reminder": false,
        "category-skill-reminder": false,
        "compaction-context-injector": true,
    },
    chat: {
        "rules-injector": false,
        "directory-agents-injector": false,
        "directory-readme-injector": false,
        "agent-usage-reminder": false,
        "category-skill-reminder": false,
        "compaction-context-injector": false,
    },
}

// Regex patterns for task classification
const CODING_PATTERN = /\b(fix|bug|implement|add|create|refactor|update|modify|edit|write|build|migrate|install|setup|configure|deploy|delete|remove|rename|move|sửa|thêm|tạo|xóa|viết)\b/i
const REVIEW_PATTERN = /\b(review|check|audit|verify|validate|lint|inspect|compare|diff|kiểm tra|đánh giá)\b/i
const RESEARCH_PATTERN = /\b(what|how|why|explain|find|search|look up|investigate|analyze|understand|describe|tìm|giải thích|tại sao|như thế nào|phân tích)\b/i
const CHAT_PATTERN = /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|cảm ơn|chào|vâng)\s*[.!?]?$/i

/**
 * Classify user prompt into a task type.
 * Used by ContextBudget to decide which hooks should be active.
 */
export function classifyTask(prompt: string): TaskType {
    const trimmed = prompt.trim()

    // Short messages are likely chat
    if (trimmed.length < 20 && CHAT_PATTERN.test(trimmed)) {
        return "chat"
    }

    // Check patterns in priority order
    if (REVIEW_PATTERN.test(trimmed)) return "review"
    if (CODING_PATTERN.test(trimmed)) return "coding"
    if (RESEARCH_PATTERN.test(trimmed)) return "research"

    // Default to coding — most common in a coding IDE
    return "coding"
}

/**
 * Check if a hook should be active for the given task type.
 */
export function isHookActiveForTask(hookName: HookName, taskType: TaskType): boolean {
    return ACTIVATION_MATRIX[taskType]?.[hookName] ?? true
}
