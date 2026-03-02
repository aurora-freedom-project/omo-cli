import { lstatSync, readlinkSync } from "fs"
import { promises as fs } from "fs"
import { resolve } from "path"
import { Effect } from "effect"

/**
 * Effect that checks if a path is a symbolic link.
 * Returns false on ENOENT or other fs errors.
 */
export const isSymbolicLinkEffect = (filePath: string): Effect.Effect<boolean, never> =>
  Effect.try({
    try: () => lstatSync(filePath, { throwIfNoEntry: false })?.isSymbolicLink() ?? false,
    catch: () => false as never
  }).pipe(Effect.catchAll(() => Effect.succeed(false)))

export function isMarkdownFile(entry: { name: string; isFile: () => boolean }): boolean {
  return !entry.name.startsWith(".") && entry.name.endsWith(".md") && entry.isFile()
}

export function isSymbolicLink(filePath: string): boolean {
  return Effect.runSync(isSymbolicLinkEffect(filePath))
}

/**
 * Effect that resolves a symbolic link to its target path.
 * Returns the original path if it's not a symlink or an error occurs.
 */
export const resolveSymlinkEffect = (filePath: string): Effect.Effect<string, never> =>
  Effect.try({
    try: () => {
      const stats = lstatSync(filePath, { throwIfNoEntry: false })
      if (stats?.isSymbolicLink()) {
        return resolve(filePath, "..", readlinkSync(filePath))
      }
      return filePath
    },
    catch: () => filePath as never
  }).pipe(Effect.catchAll(() => Effect.succeed(filePath)))

export function resolveSymlink(filePath: string): string {
  return Effect.runSync(resolveSymlinkEffect(filePath))
}

/**
 * Async Effect that resolves a symbolic link to its target path.
 * Returns the original path if it's not a symlink or an error occurs.
 */
export const resolveSymlinkAsyncEffect = (filePath: string): Effect.Effect<string, never> =>
  Effect.tryPromise({
    try: async () => {
      const stats = await fs.lstat(filePath)
      if (stats.isSymbolicLink()) {
        const linkTarget = await fs.readlink(filePath)
        return resolve(filePath, "..", linkTarget)
      }
      return filePath
    },
    catch: () => filePath as never
  }).pipe(Effect.catchAll(() => Effect.succeed(filePath)))

export async function resolveSymlinkAsync(filePath: string): Promise<string> {
  return Effect.runPromise(resolveSymlinkAsyncEffect(filePath))
}
