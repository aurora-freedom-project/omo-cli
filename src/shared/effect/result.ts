/**
 * @module shared/effect/result
 * 
 * Effect-based wrappers for common operations.
 * These replace raw try/catch patterns with typed Effect pipelines.
 * 
 * Usage:
 *   const content = yield* readFileSafe("/path/to/file")
 *   const data = yield* parseJsonSafe(content)
 */

import { Effect } from "effect"
import { readFile, writeFile, mkdir, access } from "node:fs/promises"
import { dirname } from "node:path"
import { FileNotFound, FileIOError, UnexpectedError } from "./errors"

/**
 * Read a file safely, returning Effect instead of throwing.
 * 
 * @example
 * ```ts
 * const content = yield* readFileSafe("/path/to/file.json")
 * ```
 */
export const readFileSafe = (path: string): Effect.Effect<string, FileNotFound | FileIOError> =>
    Effect.tryPromise({
        try: () => readFile(path, "utf-8"),
        catch: (error) => {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                return new FileNotFound({ path })
            }
            return new FileIOError({ path, operation: "read", cause: error })
        }
    })

/**
 * Write a file safely, creating parent directories if needed.
 */
export const writeFileSafe = (path: string, content: string): Effect.Effect<void, FileIOError> =>
    Effect.gen(function* () {
        yield* Effect.tryPromise({
            try: () => mkdir(dirname(path), { recursive: true }),
            catch: (error) => new FileIOError({ path, operation: "mkdir", cause: error })
        })
        yield* Effect.tryPromise({
            try: () => writeFile(path, content, "utf-8"),
            catch: (error) => new FileIOError({ path, operation: "write", cause: error })
        })
    })

/**
 * Check if a file exists.
 */
export const fileExists = (path: string): Effect.Effect<boolean, never> =>
    Effect.tryPromise({
        try: () => access(path).then(() => true),
        catch: () => false as never
    }).pipe(Effect.catchAll(() => Effect.succeed(false)))

/**
 * Parse JSON safely — returns Effect with typed error.
 * 
 * @example
 * ```ts
 * const data = yield* parseJsonSafe<Config>(rawContent)
 * ```
 */
export const parseJsonSafe = <T = unknown>(raw: string): Effect.Effect<T, UnexpectedError> =>
    Effect.try({
        try: () => JSON.parse(raw) as T,
        catch: (error) => new UnexpectedError({ cause: error, context: "JSON.parse" })
    })

/**
 * Execute a shell command safely.
 */
export const execSafe = (
    command: string,
    options?: { cwd?: string; timeout?: number }
): Effect.Effect<string, UnexpectedError> =>
    Effect.tryPromise({
        try: async () => {
            const { execSync } = await import("node:child_process")
            return execSync(command, {
                cwd: options?.cwd,
                timeout: options?.timeout ?? 30_000,
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "pipe"]
            })
        },
        catch: (error) => new UnexpectedError({ cause: error, context: `exec: ${command}` })
    })

/**
 * Wrap any Promise-returning function into an Effect.
 * Useful for gradual migration of existing async code.
 * 
 * @example
 * ```ts
 * const result = yield* fromPromise(() => existingAsyncFunction(), "loadConfig")
 * ```
 */
export const fromPromise = <T>(
    fn: () => Promise<T>,
    context: string
): Effect.Effect<T, UnexpectedError> =>
    Effect.tryPromise({
        try: fn,
        catch: (error) => new UnexpectedError({ cause: error, context })
    })

/**
 * Run an Effect and return a Promise.
 * Use at module boundaries where existing code expects Promise-based API.
 * 
 * @example
 * ```ts
 * // In existing code that expects Promise
 * export async function loadConfig(path: string): Promise<Config> {
 *   return runEffect(loadConfigEffect(path))
 * }
 * ```
 */
export const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
    Effect.runPromise(
        effect.pipe(
            Effect.catchAll((error) => {
                // Log the typed error for debugging, then re-throw for Promise compatibility
                console.error("[Effect Error]", error)
                return Effect.fail(error)
            })
        )
    )
