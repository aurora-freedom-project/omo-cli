import { existsSync, readFileSync } from "node:fs"
import { parse, ParseError, printParseErrorCode } from "jsonc-parser"

/** Result of a safe JSONC parse operation, including any parsing errors. */
export interface JsoncParseResult<T> {
  /** Parsed data, or null if errors occurred. */
  data: T | null
  /** List of parsing errors with position info. */
  errors: Array<{ message: string; offset: number; length: number }>
}

/**
 * Parse a JSONC string (JSON with comments and trailing commas).
 * @throws {SyntaxError} If the content contains parse errors.
 */
export function parseJsonc<T = unknown>(content: string): T {
  const errors: ParseError[] = []
  const result = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as T

  if (errors.length > 0) {
    const errorMessages = errors
      .map((e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`)
      .join(", ")
    throw new SyntaxError(`JSONC parse error: ${errorMessages}`)
  }

  return result
}

/**
 * Parse a JSONC string without throwing.
 * Returns parsed data and any errors encountered.
 */
export function parseJsoncSafe<T = unknown>(content: string): JsoncParseResult<T> {
  const errors: ParseError[] = []
  const data = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as T | null

  return {
    data: errors.length > 0 ? null : data,
    errors: errors.map((e) => ({
      message: printParseErrorCode(e.error),
      offset: e.offset,
      length: e.length,
    })),
  }
}

/**
 * Read and parse a JSONC file from disk.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export function readJsoncFile<T = unknown>(filePath: string): T | null {
  return Effect.runSync(
    Effect.try({
      try: () => {
        const content = readFileSync(filePath, "utf-8")
        return parseJsonc<T>(content)
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed(null as T | null)))
  )
}

/**
 * Detect whether a config file exists as `.json` or `.jsonc`.
 * @param basePath - Path without extension (e.g., `/path/to/opencode`)
 * @returns Format detected (`json`, `jsonc`, or `none`) and the resolved path.
 */
export function detectConfigFile(basePath: string): {
  format: "json" | "jsonc" | "none"
  path: string
} {
  const jsoncPath = `${basePath}.jsonc`
  const jsonPath = `${basePath}.json`

  if (existsSync(jsoncPath)) {
    return { format: "jsonc", path: jsoncPath }
  }
  if (existsSync(jsonPath)) {
    return { format: "json", path: jsonPath }
  }
  return { format: "none", path: jsonPath }
}

// ─── Effect-TS Powered Alternatives ─────────────────────────────────────────
// These provide typed error handling via Effect<T, E> instead of throw/null.
// Existing callers continue using the original API above.

import { Effect } from "effect"
import { ConfigNotFound, ConfigParseError } from "./effect/errors"
import { readFileSafe } from "./effect/result"

/**
 * Read and parse a JSONC file with typed errors.
 * 
 * @example
 * ```ts
 * const config = yield* readJsoncFileEffect<Config>("/path/to/config.jsonc")
 * ```
 */
export const readJsoncFileEffect = <T = unknown>(filePath: string): Effect.Effect<T, ConfigNotFound | ConfigParseError> =>
  Effect.gen(function* () {
    const content = yield* readFileSafe(filePath).pipe(
      Effect.catchTag("FileNotFound", () => Effect.fail(new ConfigNotFound({ path: filePath }))),
      Effect.catchTag("FileIOError", (e) => Effect.fail(new ConfigParseError({ path: filePath, cause: e.cause })))
    )
    return yield* parseJsoncEffect<T>(content, filePath)
  })

/**
 * Parse JSONC content with typed errors.
 */
export const parseJsoncEffect = <T = unknown>(content: string, sourcePath = "<inline>"): Effect.Effect<T, ConfigParseError> =>
  Effect.try({
    try: () => parseJsonc<T>(content),
    catch: (error) => new ConfigParseError({ path: sourcePath, cause: error })
  })
