#!/usr/bin/env bun

import { $ } from "bun"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const PACKAGE_NAME = "omo-cli"

const PLATFORMS = [
    { name: "darwin-arm64", target: "bun-darwin-arm64" },
    { name: "darwin-x64", target: "bun-darwin-x64" },
    { name: "linux-x64", target: "bun-linux-x64" },
    { name: "linux-arm64", target: "bun-linux-arm64" },
    { name: "linux-x64-musl", target: "bun-linux-x64-musl" },
    { name: "linux-arm64-musl", target: "bun-linux-arm64-musl" },
    { name: "windows-x64", target: "bun-windows-x64" },
] as const

const onlyPlatform = process.argv[2]

console.log("=== Building platform binaries ===\n")

for (const { name, target } of PLATFORMS) {
    if (onlyPlatform && name !== onlyPlatform) continue

    const pkgDir = join("packages", name)
    const binDir = join(pkgDir, "bin")
    const ext = name.startsWith("windows") ? ".exe" : ""
    const outFile = join(binDir, `${PACKAGE_NAME}${ext}`)

    // Ensure directories exist
    if (!existsSync(binDir)) {
        mkdirSync(binDir, { recursive: true })
    }

    console.log(`Building ${name} → ${outFile}`)

    try {
        await $`bun build src/cli/index.ts --compile --minify --target=${target} --outfile=${outFile}`
        console.log(`  ✓ ${name}`)
    } catch (error: any) {
        console.error(`  ✗ ${name}: ${error.message}`)
        if (!onlyPlatform) continue // Skip failures in batch mode
        process.exit(1)
    }
}

console.log("\n=== Done ===")
