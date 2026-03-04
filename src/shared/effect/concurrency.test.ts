/**
 * @module shared/effect/concurrency.test
 *
 * Concurrency tests for Effect-TS operations (TD-8 from expert review).
 * Tests concurrent access patterns across:
 * - StorageService (concurrent read/write)
 * - LazyResolver (concurrent initialization)
 * - Effect.try pipelines under parallel execution
 */

import { describe, test, expect } from "bun:test"
import { Effect, Layer, pipe, Fiber } from "effect"
import { InMemoryStorageLive } from "./memory-storage"
import { StorageService } from "./services"
import { JsonStorage } from "./json-storage"
import { createLazyResolver } from "../lazy-init"

// ─── StorageService Concurrency ─────────────────────────────────────────────

describe("StorageService concurrency", () => {
    const makeProgram = (layer: Layer.Layer<StorageService>) =>
        (program: Effect.Effect<unknown, unknown, StorageService>) =>
            Effect.runPromise(Effect.provide(program, layer))

    test("concurrent writes to different keys should not interfere", async () => {
        const layer = InMemoryStorageLive()
        const run = makeProgram(layer)

        const program = Effect.gen(function* () {
            const storage = yield* StorageService

            // Fire 10 concurrent writes to different keys
            const writes = Array.from({ length: 10 }, (_, i) =>
                storage.write(`key-${i}`, `value-${i}`)
            )
            yield* Effect.all(writes, { concurrency: "unbounded" })

            // Verify all values are correct
            const reads = Array.from({ length: 10 }, (_, i) =>
                pipe(
                    storage.read(`key-${i}`),
                    Effect.map((v) => ({ key: i, value: v }))
                )
            )
            const results = yield* Effect.all(reads, { concurrency: "unbounded" })
            return results
        })

        const results = await run(program)
        expect(results).toHaveLength(10)
        for (let i = 0; i < 10; i++) {
            expect(results[i]).toEqual({ key: i, value: `value-${i}` })
        }
    })

    test("concurrent writes to same key should all succeed (last-write-wins)", async () => {
        const layer = InMemoryStorageLive()
        const run = makeProgram(layer)

        const program = Effect.gen(function* () {
            const storage = yield* StorageService

            // Fire concurrent writes to the same key
            const writes = Array.from({ length: 20 }, (_, i) =>
                storage.write("shared-key", `value-${i}`)
            )
            yield* Effect.all(writes, { concurrency: "unbounded" })

            // The key should exist with one of the values
            const value = yield* storage.read("shared-key")
            return value
        })

        const result = await run(program)
        expect(result).toMatch(/^value-\d+$/)
    })

    test("read during concurrent writes should not throw", async () => {
        const layer = InMemoryStorageLive({ "existing-key": "initial" })
        const run = makeProgram(layer)

        const program = Effect.gen(function* () {
            const storage = yield* StorageService

            // Mix reads and writes concurrently
            const operations = [
                ...Array.from({ length: 5 }, (_, i) =>
                    storage.write("existing-key", `updated-${i}`)
                ),
                ...Array.from({ length: 5 }, () =>
                    pipe(
                        storage.read("existing-key"),
                        Effect.catchAll(() => Effect.succeed("not-found"))
                    )
                ),
            ]

            const results = yield* Effect.all(operations, { concurrency: "unbounded" })
            return results
        })

        // Should not throw
        const results = await run(program)
        expect(results).toHaveLength(10)
    })

    test("remove during concurrent reads should handle gracefully", async () => {
        const layer = InMemoryStorageLive({ "temp-key": "value" })
        const run = makeProgram(layer)

        const program = Effect.gen(function* () {
            const storage = yield* StorageService

            const operations = [
                storage.remove("temp-key"),
                pipe(
                    storage.read("temp-key"),
                    Effect.catchAll(() => Effect.succeed("removed"))
                ),
                pipe(
                    storage.read("temp-key"),
                    Effect.catchAll(() => Effect.succeed("removed"))
                ),
            ]

            const results = yield* Effect.all(operations, { concurrency: "unbounded" })
            return results
        })

        const results = await run(program)
        expect(results).toHaveLength(3)
    })
})

// ─── JsonStorage Concurrency ────────────────────────────────────────────────

describe("JsonStorage concurrency", () => {
    interface TestData {
        count: number
        name: string
    }

    test("concurrent JSON save/load should maintain data integrity", async () => {
        const layer = InMemoryStorageLive()

        const program = Effect.gen(function* () {
            const storage = yield* StorageService
            const jsonStore = JsonStorage<TestData>(storage, "test-module")

            // Save 10 items concurrently
            const saves = Array.from({ length: 10 }, (_, i) =>
                jsonStore.save(`item-${i}`, { count: i, name: `test-${i}` })
            )
            yield* Effect.all(saves, { concurrency: "unbounded" })

            // Load all 10 concurrently
            const loads = Array.from({ length: 10 }, (_, i) =>
                pipe(
                    jsonStore.load(`item-${i}`),
                    Effect.map((data) => ({ id: i, data }))
                )
            )
            const results = yield* Effect.all(loads, { concurrency: "unbounded" })
            return results
        })

        const results = await Effect.runPromise(Effect.provide(program, layer))
        expect(results).toHaveLength(10)
        for (let i = 0; i < 10; i++) {
            expect(results[i]).toEqual({
                id: i,
                data: { count: i, name: `test-${i}` },
            })
        }
    })
})

// ─── LazyResolver Concurrency ───────────────────────────────────────────────

describe("LazyResolver concurrency", () => {
    test("concurrent get() calls should only resolve once", async () => {
        let resolveCount = 0

        const resolver = createLazyResolver(async () => {
            resolveCount++
            // Simulate async work
            await new Promise((r) => setTimeout(r, 50))
            return "resolved-value"
        })

        // Fire 10 concurrent get() calls
        const promises = Array.from({ length: 10 }, () => resolver.get())
        const results = await Promise.all(promises)

        // All should get the same value
        expect(results.every((r) => r === "resolved-value")).toBe(true)
        // Resolver should only be called once
        expect(resolveCount).toBe(1)
    })

    test("get() after failed resolution should return null", async () => {
        const resolver = createLazyResolver(async () => {
            throw new Error("init failed")
        })

        const result = await resolver.get()
        expect(result).toBeNull()
    })

    test("reset() allows re-resolution", async () => {
        let callCount = 0

        const resolver = createLazyResolver(async () => {
            callCount++
            return `value-${callCount}`
        })

        const first = await resolver.get()
        expect(first).toBe("value-1")

        resolver.reset()

        const second = await resolver.get()
        expect(second).toBe("value-2")
        expect(callCount).toBe(2)
    })

    test("startBackgroundInit() + get() should share the same promise", async () => {
        let resolveCount = 0

        const resolver = createLazyResolver(async () => {
            resolveCount++
            await new Promise((r) => setTimeout(r, 50))
            return "bg-value"
        })

        resolver.startBackgroundInit()
        const result = await resolver.get()

        expect(result).toBe("bg-value")
        expect(resolveCount).toBe(1)
    })

    test("multiple resolvers should not interfere with each other", async () => {
        const resolver1 = createLazyResolver(async () => {
            await new Promise((r) => setTimeout(r, 30))
            return "resolver-1"
        })

        const resolver2 = createLazyResolver(async () => {
            await new Promise((r) => setTimeout(r, 10))
            return "resolver-2"
        })

        const [result1, result2] = await Promise.all([
            resolver1.get(),
            resolver2.get(),
        ])

        expect(result1).toBe("resolver-1")
        expect(result2).toBe("resolver-2")
    })

    test("concurrent getCached() during resolution should return null then value", async () => {
        const resolver = createLazyResolver(async () => {
            await new Promise((r) => setTimeout(r, 50))
            return "cached-value"
        })

        // Before resolution
        expect(resolver.getCached()).toBeNull()

        const getPromise = resolver.get()

        // During resolution — may still be null
        const duringResolution = resolver.getCached()

        await getPromise

        // After resolution
        expect(resolver.getCached()).toBe("cached-value")
    })
})

// ─── Effect.try Pipeline Concurrency ────────────────────────────────────────

describe("Effect.try pipeline concurrency", () => {
    test("parallel Effect.try operations should not interfere", async () => {
        const operations = Array.from({ length: 20 }, (_, i) =>
            Effect.try({
                try: () => {
                    // Simulate computation
                    const result = Array.from({ length: 100 }, (_, j) => i * 100 + j)
                        .reduce((a, b) => a + b, 0)
                    return { index: i, sum: result }
                },
                catch: () => ({ index: i, sum: -1 }) as any,
            }).pipe(Effect.catchAll((e) => Effect.succeed(e)))
        )

        const results = await Effect.runPromise(
            Effect.all(operations, { concurrency: "unbounded" })
        )

        expect(results).toHaveLength(20)
        // Each should have correct computation
        for (let i = 0; i < 20; i++) {
            const expected = Array.from({ length: 100 }, (_, j) => i * 100 + j)
                .reduce((a, b) => a + b, 0)
            expect(results[i]).toEqual({ index: i, sum: expected })
        }
    })

    test("mixed success/failure Effect.try operations should isolate errors", async () => {
        const operations = Array.from({ length: 10 }, (_, i) =>
            pipe(
                Effect.try({
                    try: () => {
                        if (i % 3 === 0) throw new Error(`fail-${i}`)
                        return { index: i, ok: true }
                    },
                    catch: (e) => ({ index: i, ok: false, error: (e as Error).message }) as any,
                }),
                Effect.catchAll((err) => Effect.succeed(err))
            )
        )

        const results = await Effect.runPromise(
            Effect.all(operations, { concurrency: "unbounded" })
        )

        expect(results).toHaveLength(10)
        // Indices 0, 3, 6, 9 should fail
        for (let i = 0; i < 10; i++) {
            if (i % 3 === 0) {
                expect(results[i]).toEqual({ index: i, ok: false, error: `fail-${i}` })
            } else {
                expect(results[i]).toEqual({ index: i, ok: true })
            }
        }
    })

    test("Fiber-based concurrent execution should complete independently", async () => {
        const slow = Effect.gen(function* () {
            yield* Effect.sleep("50 millis")
            return "slow"
        })

        const fast = Effect.gen(function* () {
            yield* Effect.sleep("10 millis")
            return "fast"
        })

        const program = Effect.gen(function* () {
            const slowFiber = yield* Effect.fork(slow)
            const fastFiber = yield* Effect.fork(fast)

            const fastResult = yield* Fiber.join(fastFiber)
            const slowResult = yield* Fiber.join(slowFiber)

            return { fast: fastResult, slow: slowResult }
        })

        const result = await Effect.runPromise(program)
        expect(result).toEqual({ fast: "fast", slow: "slow" })
    })
})
