/**
 * @module shared/effect/errors
 * 
 * Tagged error hierarchy for the entire omo-cli project.
 * Uses Effect's Data.TaggedError for type-safe, exhaustive error handling.
 * 
 * These errors replace untyped throw/catch patterns across the codebase.
 */

import { Data } from "effect"

// ─── Configuration Errors ───────────────────────────────────────────────────

/** Config file not found at expected path */
export class ConfigNotFound extends Data.TaggedError("ConfigNotFound")<{
    readonly path: string
}> { }

/** JSON/JSONC parsing failed */
export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
    readonly path: string
    readonly cause: unknown
}> { }

/** Zod schema validation failed */
export class ConfigValidationError extends Data.TaggedError("ConfigValidationError")<{
    readonly path: string
    readonly issues: ReadonlyArray<{ message: string; path: ReadonlyArray<string | number> }>
}> { }

// ─── File System Errors ─────────────────────────────────────────────────────

/** File not found */
export class FileNotFound extends Data.TaggedError("FileNotFound")<{
    readonly path: string
}> { }

/** File read/write error */
export class FileIOError extends Data.TaggedError("FileIOError")<{
    readonly path: string
    readonly operation: "read" | "write" | "delete" | "mkdir"
    readonly cause: unknown
}> { }

// ─── Hook Errors ────────────────────────────────────────────────────────────

/** Hook execution failed */
export class HookExecutionError extends Data.TaggedError("HookExecutionError")<{
    readonly hookName: string
    readonly event: string
    readonly cause: unknown
}> { }

/** Hook was disabled by config */
export class HookDisabledError extends Data.TaggedError("HookDisabledError")<{
    readonly hookName: string
}> { }

// ─── Tool Errors ────────────────────────────────────────────────────────────

/** Tool execution failed */
export class ToolExecutionError extends Data.TaggedError("ToolExecutionError")<{
    readonly toolName: string
    readonly cause: unknown
}> { }

/** Tool not found in registry */
export class ToolNotFound extends Data.TaggedError("ToolNotFound")<{
    readonly toolName: string
}> { }

/** Tool input validation failed */
export class ToolInputError extends Data.TaggedError("ToolInputError")<{
    readonly toolName: string
    readonly issues: ReadonlyArray<string>
}> { }

// ─── Skill Errors ───────────────────────────────────────────────────────────

/** Skill not found */
export class SkillNotFound extends Data.TaggedError("SkillNotFound")<{
    readonly skillName: string
}> { }

/** Skill loading failed */
export class SkillLoadError extends Data.TaggedError("SkillLoadError")<{
    readonly skillName: string
    readonly cause: unknown
}> { }

// ─── Agent Errors ───────────────────────────────────────────────────────────

/** Agent not found in registry */
export class AgentNotFound extends Data.TaggedError("AgentNotFound")<{
    readonly agentName: string
}> { }

/** Agent delegation failed */
export class DelegationError extends Data.TaggedError("DelegationError")<{
    readonly fromAgent: string
    readonly toAgent: string
    readonly cause: unknown
}> { }

// ─── Provider Errors (Expert Review Finding #1) ─────────────────────────────

/** LLM provider returned an error (400/429/500 etc.) */
export class ProviderError extends Data.TaggedError("ProviderError")<{
    readonly provider: string
    readonly statusCode: number
    readonly message: string
}> { }

/** Provider rate limited (429) */
export class ProviderRateLimited extends Data.TaggedError("ProviderRateLimited")<{
    readonly provider: string
    readonly retryAfterMs: number
}> { }

/** Context window exceeded */
export class ContextWindowExceeded extends Data.TaggedError("ContextWindowExceeded")<{
    readonly provider: string
    readonly maxTokens: number
    readonly requestedTokens: number
}> { }

// ─── Session Errors ─────────────────────────────────────────────────────────

/** Session not found */
export class SessionNotFound extends Data.TaggedError("SessionNotFound")<{
    readonly sessionId: string
}> { }

/** Session crashed */
export class SessionCrashed extends Data.TaggedError("SessionCrashed")<{
    readonly sessionId: string
    readonly cause: unknown
}> { }

// ─── Storage Errors (Expert Review Finding #5) ──────────────────────────────

/** Storage key not found */
export class StorageNotFound extends Data.TaggedError("StorageNotFound")<{
    readonly key: string
}> { }

/** Storage write failed */
export class StorageWriteError extends Data.TaggedError("StorageWriteError")<{
    readonly key: string
    readonly cause: unknown
}> { }

// ─── Generic Errors ─────────────────────────────────────────────────────────

/** Timeout error */
export class TimeoutError extends Data.TaggedError("TimeoutError")<{
    readonly operation: string
    readonly timeoutMs: number
}> { }

/** Unknown/unexpected error — escape hatch for gradual migration */
export class UnexpectedError extends Data.TaggedError("UnexpectedError")<{
    readonly cause: unknown
    readonly context?: string
}> { }
