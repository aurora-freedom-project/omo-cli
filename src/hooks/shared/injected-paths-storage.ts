/**
 * Shared factory for injected-paths storage.
 * Used by directory-readme-injector and directory-agents-injector hooks,
 * which have identical load/save/clear logic but different storage directories.
 *
 * Migrated to use StorageService (FileStorageLive) under the hood.
 */

import { Effect } from "effect"
import { FileStorageLive } from "../../shared/effect/file-storage"
import { JsonStorage } from "../../shared/effect/json-storage"
import { StorageService } from "../../shared/effect/services"

export interface InjectedPathsData {
    sessionID: string;
    injectedPaths: string[];
    updatedAt: number;
}

export interface InjectedPathsStorage {
    load(sessionID: string): Set<string>;
    save(sessionID: string, paths: Set<string>): void;
    clear(sessionID: string): void;
}

/**
 * Creates a storage adapter for injected paths backed by JSON files.
 *
 * @param storageDir - Base directory for session-specific JSON files
 * @returns Load, save, and clear functions scoped to the given directory
 *
 * @example
 * ```ts
 * const storage = createInjectedPathsStorage("/path/to/storage")
 * const paths = storage.load(sessionID)
 * paths.add("/new/path")
 * storage.save(sessionID, paths)
 * ```
 */
export function createInjectedPathsStorage(storageDir: string): InjectedPathsStorage {
    const storageLayer = FileStorageLive(storageDir)

    function run<A>(effect: Effect.Effect<A, unknown, StorageService>): A | null {
        return Effect.runSync(
            Effect.provide(
                Effect.catchAll(effect, () => Effect.succeed(null as A | null)),
                storageLayer
            )
        )
    }

    function runVoid(effect: Effect.Effect<void, unknown, StorageService>): void {
        Effect.runSync(
            Effect.provide(
                Effect.catchAll(effect, () => Effect.succeed(undefined as void)),
                storageLayer
            )
        )
    }

    return {
        load(sessionID: string): Set<string> {
            const data = run(Effect.gen(function* () {
                const storage = yield* StorageService
                const store = JsonStorage<InjectedPathsData>(storage, ".")
                return yield* store.load(sessionID)
            }))

            if (!data) return new Set()
            return new Set(data.injectedPaths)
        },

        save(sessionID: string, paths: Set<string>): void {
            const data: InjectedPathsData = {
                sessionID,
                injectedPaths: [...paths],
                updatedAt: Date.now(),
            }

            runVoid(Effect.gen(function* () {
                const storage = yield* StorageService
                const store = JsonStorage<InjectedPathsData>(storage, ".")
                yield* store.save(sessionID, data)
            }))
        },

        clear(sessionID: string): void {
            runVoid(Effect.gen(function* () {
                const storage = yield* StorageService
                const store = JsonStorage<InjectedPathsData>(storage, ".")
                yield* store.remove(sessionID)
            }))
        },
    }
}
