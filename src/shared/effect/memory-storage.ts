/**
 * @module shared/effect/memory-storage
 *
 * InMemoryStorageLive — implements StorageService using an in-memory Map.
 * Designed for unit tests — fast, isolated, no filesystem side effects.
 */

import { Effect, Layer } from "effect"
import { StorageService } from "./services"
import { StorageNotFound, StorageWriteError } from "./errors"

/**
 * Create an InMemoryStorageLive Layer backed by a Map.
 * Optionally accepts initial data for test setup.
 */
export const InMemoryStorageLive = (
    initial?: Record<string, string>
): Layer.Layer<StorageService> => {
    const store = new Map<string, string>(
        initial ? Object.entries(initial) : undefined
    )

    return Layer.succeed(StorageService, {
        read: (key: string) =>
            Effect.suspend(() => {
                const value = store.get(key)
                if (value === undefined) {
                    return Effect.fail(new StorageNotFound({ key }))
                }
                return Effect.succeed(value)
            }),

        write: (key: string, value: string) =>
            Effect.sync(() => {
                store.set(key, value)
            }),

        remove: (key: string) =>
            Effect.sync(() => {
                store.delete(key)
            }),

        list: (prefix: string) =>
            Effect.sync(() => {
                const results: string[] = []
                for (const key of store.keys()) {
                    if (key.startsWith(prefix + "/") || key.startsWith(prefix + "\\")) {
                        // Extract the filename portion after the prefix
                        const rest = key.slice(prefix.length + 1)
                        // Only include direct children (no nested /)
                        if (!rest.includes("/") && !rest.includes("\\")) {
                            results.push(rest)
                        }
                    }
                }
                return results as readonly string[]
            }),

        exists: (key: string) =>
            Effect.sync(() => store.has(key)),
    })
}
