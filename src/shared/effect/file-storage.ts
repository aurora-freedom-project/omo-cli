/**
 * @module shared/effect/file-storage
 *
 * FileStorageLive — implements StorageService using node:fs.
 * Maps key strings to filesystem paths under a configurable baseDir.
 *
 * Keys use "/" separators which are mapped to path.join() for portability.
 * Parent directories are auto-created on write.
 */

import { Effect, Layer } from "effect"
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { StorageService } from "./services"
import { StorageNotFound, StorageWriteError } from "./errors"

/** Resolve a storage key to an absolute filesystem path. */
function resolvePath(baseDir: string, key: string): string {
    return resolve(baseDir, ...key.split("/"))
}

/**
 * Create a FileStorageLive Layer backed by a directory on disk.
 * @param baseDir - Root directory for all storage operations.
 */
export const FileStorageLive = (baseDir: string): Layer.Layer<StorageService> =>
    Layer.succeed(StorageService, {

        read: (key: string) =>
            Effect.try({
                try: () => {
                    const filePath = resolvePath(baseDir, key)
                    if (!existsSync(filePath)) {
                        throw new Error("NOT_FOUND")
                    }
                    return readFileSync(filePath, "utf-8")
                },
                catch: (err) => {
                    if (err instanceof Error && err.message === "NOT_FOUND") {
                        return new StorageNotFound({ key })
                    }
                    return new StorageNotFound({ key })
                },
            }),

        write: (key: string, value: string) =>
            Effect.try({
                try: () => {
                    const filePath = resolvePath(baseDir, key)
                    const dir = dirname(filePath)
                    if (!existsSync(dir)) {
                        mkdirSync(dir, { recursive: true })
                    }
                    writeFileSync(filePath, value, "utf-8")
                },
                catch: (err) => new StorageWriteError({ key, cause: err }),
            }),

        remove: (key: string) =>
            Effect.try({
                try: () => {
                    const filePath = resolvePath(baseDir, key)
                    if (existsSync(filePath)) {
                        unlinkSync(filePath)
                    }
                },
                catch: (err) => new StorageWriteError({ key, cause: err }),
            }),

        list: (prefix: string) =>
            Effect.sync(() => {
                const dir = resolvePath(baseDir, prefix)
                if (!existsSync(dir)) return [] as readonly string[]
                try {
                    return readdirSync(dir) as readonly string[]
                } catch {
                    return [] as readonly string[]
                }
            }),

        exists: (key: string) =>
            Effect.sync(() => {
                const filePath = resolvePath(baseDir, key)
                return existsSync(filePath)
            }),
    })
