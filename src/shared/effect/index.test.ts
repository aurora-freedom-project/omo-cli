import { describe, it, expect } from "bun:test"
import { Effect, pipe } from "effect"
import {
    readFileSafe,
    writeFileSafe,
    parseJsonSafe,
    fileExists,
    fromPromise,
    runEffect,
} from "./result"
import {
    FileNotFound,
    FileIOError,
    ConfigNotFound,
    ConfigParseError,
    UnexpectedError,
    ProviderError,
    ProviderRateLimited,
    StorageNotFound,
    StorageWriteError,
} from "./errors"
import {
    HookRegistry,
    StorageService,
    ConfigService,
} from "./services"
import { join } from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

describe("Effect Core", () => {
    describe("errors", () => {
        it("creates tagged errors with correct _tag", () => {
            const err = new FileNotFound({ path: "/foo" })
            expect(err._tag).toBe("FileNotFound")
            expect(err.path).toBe("/foo")
        })

        it("creates ProviderError with status code", () => {
            const err = new ProviderError({ provider: "anthropic", statusCode: 429, message: "Rate limited" })
            expect(err._tag).toBe("ProviderError")
            expect(err.statusCode).toBe(429)
            expect(err.provider).toBe("anthropic")
        })

        it("creates ProviderRateLimited with retry info", () => {
            const err = new ProviderRateLimited({ provider: "openai", retryAfterMs: 5000 })
            expect(err._tag).toBe("ProviderRateLimited")
            expect(err.retryAfterMs).toBe(5000)
        })

        it("creates StorageNotFound", () => {
            const err = new StorageNotFound({ key: "session:123" })
            expect(err._tag).toBe("StorageNotFound")
            expect(err.key).toBe("session:123")
        })
    })

    describe("readFileSafe", () => {
        it("reads existing file successfully", async () => {
            const result = await Effect.runPromise(readFileSafe(join(__dirname, "errors.ts")))
            expect(result).toContain("TaggedError")
        })

        it("returns FileNotFound for missing file", async () => {
            const result = await Effect.runPromise(
                readFileSafe("/nonexistent/file.txt").pipe(
                    Effect.catchTag("FileNotFound", (err) => Effect.succeed(`NOT_FOUND:${err.path}`))
                )
            )
            expect(result).toBe("NOT_FOUND:/nonexistent/file.txt")
        })
    })

    describe("writeFileSafe", () => {
        let tmpDir: string

        it("writes file and creates parent dirs", async () => {
            tmpDir = await mkdtemp(join(tmpdir(), "effect-test-"))
            const filePath = join(tmpDir, "sub", "test.txt")

            await Effect.runPromise(writeFileSafe(filePath, "hello effect"))

            const content = await Effect.runPromise(readFileSafe(filePath))
            expect(content).toBe("hello effect")

            await rm(tmpDir, { recursive: true })
        })
    })

    describe("parseJsonSafe", () => {
        it("parses valid JSON", async () => {
            const result = await Effect.runPromise(parseJsonSafe<{ name: string }>('{"name":"test"}'))
            expect(result.name).toBe("test")
        })

        it("returns UnexpectedError for invalid JSON", async () => {
            const result = await Effect.runPromise(
                parseJsonSafe("not json").pipe(
                    Effect.catchTag("UnexpectedError", (err) => Effect.succeed(`ERR:${err.context}`))
                )
            )
            expect(result).toBe("ERR:JSON.parse")
        })
    })

    describe("fileExists", () => {
        it("returns true for existing file", async () => {
            const result = await Effect.runPromise(fileExists(join(__dirname, "errors.ts")))
            expect(result).toBe(true)
        })

        it("returns false for nonexistent file", async () => {
            const result = await Effect.runPromise(fileExists("/nonexistent"))
            expect(result).toBe(false)
        })
    })

    describe("fromPromise", () => {
        it("wraps successful promise", async () => {
            const result = await Effect.runPromise(
                fromPromise(() => Promise.resolve(42), "test")
            )
            expect(result).toBe(42)
        })

        it("wraps failing promise with context", async () => {
            const result = await Effect.runPromise(
                fromPromise(() => Promise.reject(new Error("boom")), "loadData").pipe(
                    Effect.catchTag("UnexpectedError", (err) => Effect.succeed(`ERR:${err.context}`))
                )
            )
            expect(result).toBe("ERR:loadData")
        })
    })

    describe("pipe composition", () => {
        it("composes operations in a pipeline", async () => {
            const readAndParse = (path: string) => pipe(
                readFileSafe(path),
                Effect.map((content) => content.length),
                Effect.catchTag("FileNotFound", () => Effect.succeed(0)),
                Effect.catchTag("FileIOError", () => Effect.succeed(-1)),
            )

            const result = await Effect.runPromise(readAndParse(join(__dirname, "errors.ts")))
            expect(result).toBeGreaterThan(100)

            const missing = await Effect.runPromise(readAndParse("/nonexistent"))
            expect(missing).toBe(0)
        })
    })

    describe("Effect.gen generator syntax", () => {
        it("works with yield*", async () => {
            const program = Effect.gen(function* () {
                const content = yield* readFileSafe(join(__dirname, "errors.ts"))
                const lines = content.split("\n").length
                return lines
            })

            const result = await Effect.runPromise(program)
            expect(result).toBeGreaterThan(10)
        })
    })

    describe("services (Context.Tag)", () => {
        it("HookRegistry tag is defined", () => {
            expect(HookRegistry).toBeDefined()
        })

        it("StorageService tag is defined", () => {
            expect(StorageService).toBeDefined()
        })

        it("ConfigService tag is defined", () => {
            expect(ConfigService).toBeDefined()
        })
    })
})
