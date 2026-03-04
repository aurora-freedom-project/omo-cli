/**
 * @module shared/effect/json-storage
 *
 * JsonStorage<T> — typed JSON helper over StorageService.
 * Provides load/save/remove/list with automatic JSON serialization.
 *
 * Usage:
 * ```typescript
 * const storage = yield* StorageService
 * const jsonStore = JsonStorage<MyState>(storage, "my-module")
 * const state = yield* jsonStore.load("session-123")       // Effect<MyState, StorageNotFound>
 * yield* jsonStore.save("session-123", { ... })             // Effect<void, StorageWriteError>
 * ```
 */

import { Effect, pipe } from "effect"
import type { StorageNotFound, StorageWriteError } from "./errors"

/** Shape of the StorageService operations we depend on. */
interface StorageOps {
    readonly read: (key: string) => Effect.Effect<string, StorageNotFound>
    readonly write: (key: string, value: string) => Effect.Effect<void, StorageWriteError>
    readonly remove: (key: string) => Effect.Effect<void, StorageWriteError>
    readonly list: (prefix: string) => Effect.Effect<ReadonlyArray<string>, never>
    readonly exists: (key: string) => Effect.Effect<boolean, never>
}

/**
 * Create a typed JSON storage helper scoped to a key prefix.
 *
 * @param storage - The StorageService operations.
 * @param prefix - Key prefix (e.g. "rules-injector", "cost-metering/session").
 */
export function JsonStorage<T>(storage: StorageOps, prefix: string) {
    const keyFor = (id: string) => `${prefix}/${id}.json`

    return {
        /** Load and parse a JSON entry by ID. */
        load: (id: string): Effect.Effect<T, StorageNotFound> =>
            pipe(
                storage.read(keyFor(id)),
                Effect.map((content) => JSON.parse(content) as T),
            ),

        /** Serialize and save a JSON entry by ID. */
        save: (id: string, data: T): Effect.Effect<void, StorageWriteError> =>
            storage.write(keyFor(id), JSON.stringify(data, null, 2)),

        /** Remove a JSON entry by ID. */
        remove: (id: string): Effect.Effect<void, StorageWriteError> =>
            storage.remove(keyFor(id)),

        /** List all entry filenames under the prefix directory. */
        list: (): Effect.Effect<ReadonlyArray<string>, never> =>
            storage.list(prefix),

        /** Check if an entry exists. */
        exists: (id: string): Effect.Effect<boolean, never> =>
            storage.exists(keyFor(id)),
    }
}
