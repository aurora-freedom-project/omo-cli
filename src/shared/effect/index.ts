/**
 * @module shared/effect
 * 
 * Core Effect-TS infrastructure for omo-cli.
 * Re-exports error types, result utilities, and service definitions.
 * 
 * Usage:
 *   import { readFileSafe, ConfigNotFound, StorageService } from "../shared/effect"
 */

// ─── Error Types ────────────────────────────────────────────────────────────
export {
    // Config
    ConfigNotFound,
    ConfigParseError,
    ConfigValidationError,
    // File System
    FileNotFound,
    FileIOError,
    // Hooks
    HookExecutionError,
    HookDisabledError,
    // Tools
    ToolExecutionError,
    ToolNotFound,
    ToolInputError,
    // Skills
    SkillNotFound,
    SkillLoadError,
    // Agents
    AgentNotFound,
    DelegationError,
    // Providers
    ProviderError,
    ProviderRateLimited,
    ContextWindowExceeded,
    // Sessions
    SessionNotFound,
    SessionCrashed,
    // Storage
    StorageNotFound,
    StorageWriteError,
    // Generic
    TimeoutError,
    UnexpectedError,
} from "./errors"

// ─── Result Utilities ───────────────────────────────────────────────────────
export {
    readFileSafe,
    writeFileSafe,
    fileExists,
    parseJsonSafe,
    execSafe,
    fromPromise,
    runEffect,
} from "./result"

// ─── Service Definitions ────────────────────────────────────────────────────
export {
    HookRegistry,
    StorageService,
    MessageStorageService,
    ConfigService,
    LoggerService,
    FileSystemService,
} from "./services"

// ─── Storage Implementations ────────────────────────────────────────────────
export { FileStorageLive } from "./file-storage"
export { InMemoryStorageLive } from "./memory-storage"
export { JsonStorage } from "./json-storage"

// ─── Service Types ──────────────────────────────────────────────────────────
export type { HookEvent, HookResult, InjectedMessage } from "./services"

// ─── Re-export Effect core for convenience ──────────────────────────────────
export { Effect, pipe, Context, Layer, Data, Match, Ref } from "effect"
