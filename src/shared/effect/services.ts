/**
 * @module shared/effect/services
 * 
 * Core service definitions using Effect's Context.Tag pattern.
 * These define interfaces (contracts) for cross-boundary communication,
 * eliminating circular dependencies between modules.
 * 
 * Bounded Contexts consume these via dependency injection (yield* ServiceTag),
 * not direct imports from other contexts.
 */

import { Context, Effect } from "effect"
import type {
    HookExecutionError, HookDisabledError,
    StorageNotFound, StorageWriteError,
    FileNotFound, FileIOError,
    UnexpectedError
} from "./errors"

// ─── Hook Registry Service ──────────────────────────────────────────────────
// Replaces: shared/ → hooks/ circular dependency
// hooks/ provides the Live implementation
// other modules consume via Context.Tag

export interface HookEvent {
    readonly type: "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "Stop" | "Compaction" | "SessionEvent"
    readonly data: Record<string, unknown>
}

export interface HookResult {
    readonly hookName: string
    readonly action: "allow" | "deny" | "ask" | "skip"
    readonly message?: string
}

/** 
 * Hook Registry — contract for hook execution.
 * Live implementation provided by hooks/ module.
 */
export class HookRegistry extends Context.Tag("HookRegistry")<
    HookRegistry,
    {
        readonly execute: (event: HookEvent) => Effect.Effect<ReadonlyArray<HookResult>, HookExecutionError>
        readonly isDisabled: (hookName: string) => Effect.Effect<boolean, never>
    }
>() { }

// ─── Storage Service (Expert Review Finding #5) ─────────────────────────────
// Replaces: 12 separate storage.ts files with one unified interface
// Each module provides its own Layer implementation

/**
 * Generic key-value storage service.
 * Implementations: FileStorage, MemoryStorage (testing), SurrealDB, etc.
 */
export class StorageService extends Context.Tag("StorageService")<
    StorageService,
    {
        readonly read: (key: string) => Effect.Effect<string, StorageNotFound>
        readonly write: (key: string, value: string) => Effect.Effect<void, StorageWriteError>
        readonly remove: (key: string) => Effect.Effect<void, StorageWriteError>
        readonly list: (prefix: string) => Effect.Effect<ReadonlyArray<string>, never>
        readonly exists: (key: string) => Effect.Effect<boolean, never>
    }
>() { }

// ─── Message Storage Service ────────────────────────────────────────────────
// Replaces: shared/ → features/hook-message-injector circular dependency

export interface InjectedMessage {
    readonly content: string
    readonly source: string
    readonly timestamp: number
}

/**
 * Message storage for hook message injection.
 * Live implementation provided by features/hook-message-injector.
 */
export class MessageStorageService extends Context.Tag("MessageStorageService")<
    MessageStorageService,
    {
        readonly inject: (sessionId: string, message: InjectedMessage) => Effect.Effect<void, StorageWriteError>
        readonly get: (sessionId: string) => Effect.Effect<ReadonlyArray<InjectedMessage>, StorageNotFound>
        readonly clear: (sessionId: string) => Effect.Effect<void, never>
    }
>() { }

// ─── Config Service ─────────────────────────────────────────────────────────

/**
 * Configuration service — provides access to merged runtime config.
 */
export class ConfigService extends Context.Tag("ConfigService")<
    ConfigService,
    {
        readonly get: <T>(key: string) => Effect.Effect<T, UnexpectedError>
        readonly getAll: () => Effect.Effect<Record<string, unknown>, never>
        readonly isHookDisabled: (hookName: string) => Effect.Effect<boolean, never>
        readonly getAgentModel: (agentName: string) => Effect.Effect<string, UnexpectedError>
    }
>() { }

// ─── Logger Service ─────────────────────────────────────────────────────────

/**
 * Structured logger service.
 */
export class LoggerService extends Context.Tag("LoggerService")<
    LoggerService,
    {
        readonly info: (message: string, meta?: Record<string, unknown>) => Effect.Effect<void, never>
        readonly warn: (message: string, meta?: Record<string, unknown>) => Effect.Effect<void, never>
        readonly error: (message: string, meta?: Record<string, unknown>) => Effect.Effect<void, never>
        readonly debug: (message: string, meta?: Record<string, unknown>) => Effect.Effect<void, never>
    }
>() { }

// ─── File System Service (replaces direct fs imports) ───────────────────────

/**
 * File system abstraction for testability.
 */
export class FileSystemService extends Context.Tag("FileSystemService")<
    FileSystemService,
    {
        readonly readFile: (path: string) => Effect.Effect<string, FileNotFound | FileIOError>
        readonly writeFile: (path: string, content: string) => Effect.Effect<void, FileIOError>
        readonly exists: (path: string) => Effect.Effect<boolean, never>
        readonly listDir: (path: string) => Effect.Effect<ReadonlyArray<string>, FileIOError>
    }
>() { }

// ─── Re-export all from this module ─────────────────────────────────────────

export { Effect, Context } from "effect"
