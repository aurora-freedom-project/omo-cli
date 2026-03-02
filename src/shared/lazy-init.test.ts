/**
 * @module shared/lazy-init.test
 *
 * Unit tests for createLazyResolver — the shared lazy initialization utility.
 */

import { describe, test, expect } from "bun:test"
import { createLazyResolver } from "./lazy-init"
import type { LazyResolver } from "./lazy-init"

describe("createLazyResolver", () => {
    test("should return resolved value on get()", async () => {
        const resolver = createLazyResolver(async () => "/usr/bin/foo")
        const result = await resolver.get()
        expect(result).toBe("/usr/bin/foo")
    })

    test("should cache value after first get()", async () => {
        let callCount = 0
        const resolver = createLazyResolver(async () => {
            callCount++
            return `value-${callCount}`
        })

        const first = await resolver.get()
        const second = await resolver.get()
        expect(first).toBe("value-1")
        expect(second).toBe("value-1") // cached, not "value-2"
        expect(callCount).toBe(1)
    })

    test("should return null on resolver failure", async () => {
        const resolver = createLazyResolver(async () => {
            throw new Error("resolution failed")
        })

        const result = await resolver.get()
        expect(result).toBeNull()
    })

    test("getCached() returns null before init", () => {
        const resolver = createLazyResolver(async () => "value")
        expect(resolver.getCached()).toBeNull()
    })

    test("getCached() returns value after init", async () => {
        const resolver = createLazyResolver(async () => "cached-val")
        await resolver.get()
        expect(resolver.getCached()).toBe("cached-val")
    })

    test("startBackgroundInit() triggers resolution", async () => {
        let resolved = false
        const resolver = createLazyResolver(async () => {
            await new Promise((r) => setTimeout(r, 20))
            resolved = true
            return "bg-value"
        })

        resolver.startBackgroundInit()
        expect(resolved).toBe(false) // async with delay, not yet

        // Wait for it to complete
        const result = await resolver.get()
        expect(result).toBe("bg-value")
        expect(resolved).toBe(true)
    })

    test("startBackgroundInit() is idempotent", async () => {
        let callCount = 0
        const resolver = createLazyResolver(async () => {
            callCount++
            return "value"
        })

        resolver.startBackgroundInit()
        resolver.startBackgroundInit() // should not trigger again
        resolver.startBackgroundInit()

        await resolver.get()
        expect(callCount).toBe(1)
    })

    test("reset() clears cached value and allows re-resolution", async () => {
        let callCount = 0
        const resolver = createLazyResolver(async () => {
            callCount++
            return `value-${callCount}`
        })

        const first = await resolver.get()
        expect(first).toBe("value-1")

        resolver.reset()
        expect(resolver.getCached()).toBeNull()

        const second = await resolver.get()
        expect(second).toBe("value-2")
        expect(callCount).toBe(2)
    })

    test("should return null when resolver returns null", async () => {
        const resolver = createLazyResolver(async () => null)
        const result = await resolver.get()
        expect(result).toBeNull()
    })

    test("concurrent get() calls share the same promise", async () => {
        let callCount = 0
        const resolver = createLazyResolver(async () => {
            callCount++
            await new Promise((r) => setTimeout(r, 20))
            return "shared"
        })

        const promises = Array.from({ length: 5 }, () => resolver.get())
        const results = await Promise.all(promises)

        expect(results.every((r) => r === "shared")).toBe(true)
        expect(callCount).toBe(1)
    })

    test("type interface is properly exported", () => {
        // Compile-time check: LazyResolver<T> interface
        const _typeCheck: LazyResolver<string> = createLazyResolver(async () => "test")
        expect(_typeCheck.get).toBeFunction()
        expect(_typeCheck.getCached).toBeFunction()
        expect(_typeCheck.startBackgroundInit).toBeFunction()
        expect(_typeCheck.reset).toBeFunction()
    })
})
