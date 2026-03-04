/**
 * Tests for FileStorageLive, InMemoryStorageLive, and JsonStorage.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Effect, pipe } from "effect"
import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { FileStorageLive } from "./file-storage"
import { InMemoryStorageLive } from "./memory-storage"
import { JsonStorage } from "./json-storage"
import { StorageService } from "./services"

const TEST_DIR = join(tmpdir(), `storage-test-${Date.now()}`)

describe("FileStorageLive", () => {
    beforeEach(() => {
        mkdirSync(TEST_DIR, { recursive: true })
    })

    afterEach(() => {
        try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch { /* cleanup */ }
    })

    const run = <A, E>(effect: Effect.Effect<A, E, StorageService>) =>
        Effect.runPromise(Effect.provide(effect, FileStorageLive(TEST_DIR)))

    test("write and read a file", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            yield* storage.write("test.txt", "hello world")
            const content = yield* storage.read("test.txt")
            expect(content).toBe("hello world")
        }))
    })

    test("write creates parent directories", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            yield* storage.write("deep/nested/file.txt", "nested content")
            const content = yield* storage.read("deep/nested/file.txt")
            expect(content).toBe("nested content")
        }))
    })

    test("read returns StorageNotFound for missing key", async () => {
        const result = await Effect.runPromiseExit(
            Effect.provide(
                Effect.gen(function* () {
                    const storage = yield* StorageService
                    return yield* storage.read("nonexistent.txt")
                }),
                FileStorageLive(TEST_DIR)
            )
        )
        expect(result._tag).toBe("Failure")
    })

    test("exists returns true for existing files", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            yield* storage.write("check.txt", "data")
            const yes = yield* storage.exists("check.txt")
            const no = yield* storage.exists("nope.txt")
            expect(yes).toBe(true)
            expect(no).toBe(false)
        }))
    })

    test("remove deletes a file", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            yield* storage.write("removeme.txt", "bye")
            yield* storage.remove("removeme.txt")
            const exists = yield* storage.exists("removeme.txt")
            expect(exists).toBe(false)
        }))
    })

    test("remove is idempotent for missing files", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            yield* storage.remove("already-gone.txt") // should not throw
        }))
    })

    test("list returns filenames in a directory", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            yield* storage.write("mydir/a.json", "{}")
            yield* storage.write("mydir/b.json", "{}")
            yield* storage.write("mydir/sub/c.json", "{}") // nested — should NOT appear
            const files = yield* storage.list("mydir")
            expect(files).toContain("a.json")
            expect(files).toContain("b.json")
            // sub is a directory, not a file — implementation may or may not include it
        }))
    })

    test("list returns empty for nonexistent prefix", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            const files = yield* storage.list("nope")
            expect(files).toEqual([])
        }))
    })
})

describe("InMemoryStorageLive", () => {
    const run = <A, E>(effect: Effect.Effect<A, E, StorageService>, initial?: Record<string, string>) =>
        Effect.runPromise(Effect.provide(effect, InMemoryStorageLive(initial)))

    test("write and read", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            yield* storage.write("key", "value")
            const content = yield* storage.read("key")
            expect(content).toBe("value")
        }))
    })

    test("initial data is readable", async () => {
        await run(
            Effect.gen(function* () {
                const storage = yield* StorageService
                const content = yield* storage.read("pre/loaded.json")
                expect(content).toBe('{"x":1}')
            }),
            { "pre/loaded.json": '{"x":1}' }
        )
    })

    test("read fails for missing key", async () => {
        const result = await Effect.runPromiseExit(
            Effect.provide(
                Effect.gen(function* () {
                    const storage = yield* StorageService
                    return yield* storage.read("missing")
                }),
                InMemoryStorageLive()
            )
        )
        expect(result._tag).toBe("Failure")
    })

    test("remove and exists", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            yield* storage.write("temp", "data")
            expect(yield* storage.exists("temp")).toBe(true)
            yield* storage.remove("temp")
            expect(yield* storage.exists("temp")).toBe(false)
        }))
    })

    test("list returns direct children under prefix", async () => {
        await run(
            Effect.gen(function* () {
                const storage = yield* StorageService
                const files = yield* storage.list("dir")
                expect(files).toContain("a.json")
                expect(files).toContain("b.json")
            }),
            { "dir/a.json": "{}", "dir/b.json": "{}", "dir/sub/c.json": "{}" }
        )
    })
})

describe("JsonStorage", () => {
    interface TestState {
        sessionID: string
        count: number
    }

    const run = <A, E>(effect: Effect.Effect<A, E, StorageService>) =>
        Effect.runPromise(Effect.provide(effect, InMemoryStorageLive()))

    test("save and load typed data", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            const store = JsonStorage<TestState>(storage, "test-module")

            yield* store.save("session-1", { sessionID: "session-1", count: 42 })
            const loaded = yield* store.load("session-1")

            expect(loaded.sessionID).toBe("session-1")
            expect(loaded.count).toBe(42)
        }))
    })

    test("load fails for missing entry", async () => {
        const result = await Effect.runPromiseExit(
            Effect.provide(
                Effect.gen(function* () {
                    const storage = yield* StorageService
                    const store = JsonStorage<TestState>(storage, "test-module")
                    return yield* store.load("nonexistent")
                }),
                InMemoryStorageLive()
            )
        )
        expect(result._tag).toBe("Failure")
    })

    test("remove deletes an entry", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            const store = JsonStorage<TestState>(storage, "test-module")

            yield* store.save("to-remove", { sessionID: "to-remove", count: 0 })
            yield* store.remove("to-remove")
            const exists = yield* store.exists("to-remove")
            expect(exists).toBe(false)
        }))
    })

    test("exists returns true for saved entries", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            const store = JsonStorage<TestState>(storage, "test-module")

            yield* store.save("check", { sessionID: "check", count: 1 })
            expect(yield* store.exists("check")).toBe(true)
            expect(yield* store.exists("nope")).toBe(false)
        }))
    })

    test("list returns entry filenames", async () => {
        await run(Effect.gen(function* () {
            const storage = yield* StorageService
            const store = JsonStorage<TestState>(storage, "entries")

            yield* store.save("a", { sessionID: "a", count: 1 })
            yield* store.save("b", { sessionID: "b", count: 2 })

            const files = yield* store.list()
            expect(files).toContain("a.json")
            expect(files).toContain("b.json")
        }))
    })

    test("works with FileStorageLive", async () => {
        mkdirSync(TEST_DIR, { recursive: true })
        try {
            await Effect.runPromise(
                Effect.provide(
                    Effect.gen(function* () {
                        const storage = yield* StorageService
                        const store = JsonStorage<TestState>(storage, "fs-test")

                        yield* store.save("sess", { sessionID: "sess", count: 99 })
                        const loaded = yield* store.load("sess")
                        expect(loaded.count).toBe(99)
                    }),
                    FileStorageLive(TEST_DIR)
                )
            )
        } finally {
            try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch { /* cleanup */ }
        }
    })
})
