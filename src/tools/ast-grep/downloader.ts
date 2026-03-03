import { existsSync, mkdirSync, chmodSync, unlinkSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { Effect } from "effect"
import { extractZip } from "../../shared"
import { getOmoOpenCodeCacheDir } from "../../shared/data-path"

const REPO = "ast-grep/ast-grep"

// IMPORTANT: Update this when bumping @ast-grep/cli in package.json
// This is only used as fallback when @ast-grep/cli package.json cannot be read
const DEFAULT_VERSION = "0.40.0"

function getAstGrepVersion(): string {
  return Effect.runSync(
    Effect.try({
      try: () => {
        const require = createRequire(import.meta.url)
        const pkg = require("@ast-grep/cli/package.json")
        return pkg.version as string
      },
      catch: () => DEFAULT_VERSION as never
    }).pipe(Effect.catchAll(() => Effect.succeed(DEFAULT_VERSION)))
  )
}

interface PlatformInfo {
  arch: string
  os: string
}

const PLATFORM_MAP: Record<string, PlatformInfo> = {
  "darwin-arm64": { arch: "aarch64", os: "apple-darwin" },
  "darwin-x64": { arch: "x86_64", os: "apple-darwin" },
  "linux-arm64": { arch: "aarch64", os: "unknown-linux-gnu" },
  "linux-x64": { arch: "x86_64", os: "unknown-linux-gnu" },
  "win32-x64": { arch: "x86_64", os: "pc-windows-msvc" },
  "win32-arm64": { arch: "aarch64", os: "pc-windows-msvc" },
  "win32-ia32": { arch: "i686", os: "pc-windows-msvc" },
}

/** @deprecated Use `getOmoOpenCodeCacheDir` from `shared/data-path.ts` directly */
export const getCacheDir = getOmoOpenCodeCacheDir

export function getBinaryName(): string {
  return process.platform === "win32" ? "sg.exe" : "sg"
}

export function getCachedBinaryPath(): string | null {
  const binaryPath = join(getCacheDir(), getBinaryName())
  return existsSync(binaryPath) ? binaryPath : null
}



export async function downloadAstGrep(version: string = DEFAULT_VERSION): Promise<string | null> {
  const platformKey = `${process.platform}-${process.arch}`
  const platformInfo = PLATFORM_MAP[platformKey]

  if (!platformInfo) {
    console.error(`[omo-cli] Unsupported platform for ast-grep: ${platformKey}`)
    return null
  }

  const cacheDir = getCacheDir()
  const binaryName = getBinaryName()
  const binaryPath = join(cacheDir, binaryName)

  if (existsSync(binaryPath)) {
    return binaryPath
  }

  const { arch, os } = platformInfo
  const assetName = `app-${arch}-${os}.zip`
  const downloadUrl = `https://github.com/${REPO}/releases/download/${version}/${assetName}`

  console.log(`[omo-cli] Downloading ast-grep binary...`)

  try {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
    }

    const response = await fetch(downloadUrl, { redirect: "follow" })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const archivePath = join(cacheDir, assetName)
    const arrayBuffer = await response.arrayBuffer()
    await Bun.write(archivePath, arrayBuffer)

    await extractZip(archivePath, cacheDir)

    if (existsSync(archivePath)) {
      unlinkSync(archivePath)
    }

    if (process.platform !== "win32" && existsSync(binaryPath)) {
      chmodSync(binaryPath, 0o755)
    }

    console.log(`[omo-cli] ast-grep binary ready.`)

    return binaryPath
  } catch (err) {
    console.error(
      `[omo-cli] Failed to download ast-grep: ${err instanceof Error ? err.message : err}`
    )
    return null
  }
}

export async function ensureAstGrepBinary(): Promise<string | null> {
  const cachedPath = getCachedBinaryPath()
  if (cachedPath) {
    return cachedPath
  }

  const version = getAstGrepVersion()
  return downloadAstGrep(version)
}
