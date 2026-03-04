/**
 * @module shared/types/hook-types
 * 
 * Hook-related type definitions that live in the Shared Kernel.
 * These types are consumed by both shared/ and hooks/ modules.
 * 
 * Previously located in hooks/claude-code-hooks/types.ts,
 * extracted here to break circular dependency: shared/ → hooks/.
 */

/**
 * Hook event types supported by the Claude Code hook system.
 */
export type ClaudeHookEvent =
    | "PreToolUse"
    | "PostToolUse"
    | "UserPromptSubmit"
    | "Stop"
    | "PreCompact"

/**
 * Hook command definition.
 */
export interface HookCommand {
    type: "command"
    command: string
}

/**
 * Hook matcher — maps tool patterns to hook commands.
 */
export interface HookMatcher {
    matcher: string
    hooks: HookCommand[]
}

/**
 * Configuration for Claude Code hooks.
 */
export interface ClaudeHooksConfig {
    PreToolUse?: HookMatcher[]
    PostToolUse?: HookMatcher[]
    UserPromptSubmit?: HookMatcher[]
    Stop?: HookMatcher[]
    PreCompact?: HookMatcher[]
}

/**
 * Plugin-level configuration for hook behavior.
 */
export interface PluginConfig {
    disabledHooks?: boolean | ClaudeHookEvent[]
    keywordDetectorDisabled?: boolean
}
