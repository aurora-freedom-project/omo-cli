import { describe, expect, test, mock, beforeEach, afterEach, spyOn } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { install } from "./install"
import * as configManager from "./config-manager"
import * as dockerManager from "./memory/docker-manager"
import * as childProcess from "node:child_process"
import type { InstallArgs } from "./types"

describe("install CLI - binary check behavior", () => {
  // Mock console methods to capture output
  const mockConsoleLog = mock(() => { })
  const mockConsoleError = mock(() => { })

  let tempDir: string
  let originalEnv: string | undefined
  let isOpenCodeInstalledSpy: ReturnType<typeof spyOn>
  let getOpenCodeVersionSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    // #given temporary config directory
    tempDir = join(tmpdir(), `omo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tempDir, { recursive: true })

    originalEnv = process.env.OPENCODE_CONFIG_DIR
    process.env.OPENCODE_CONFIG_DIR = tempDir

    // Reset config context
    configManager.resetConfigContext()
    configManager.initConfigContext("opencode", null)

    // Capture console output
    console.log = mockConsoleLog
    mockConsoleLog.mockClear()

    // Mock Docker manager to avoid interactive prompts
    spyOn(dockerManager, "detectExistingSurrealDB").mockResolvedValue([])

    // Mock spawn to avoid running sync-skills which takes >5s
    const mockChild = {
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (event === "close") cb(0) // immediately return success
        return mockChild
      }
    }
    spyOn(childProcess, "spawn").mockReturnValue(mockChild as never)
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.OPENCODE_CONFIG_DIR = originalEnv
    } else {
      delete process.env.OPENCODE_CONFIG_DIR
    }

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }

    isOpenCodeInstalledSpy?.mockRestore()
    getOpenCodeVersionSpy?.mockRestore()
  })

  test("non-TUI mode: should show warning but continue when OpenCode binary not found", async () => {
    // #given OpenCode binary is NOT installed
    isOpenCodeInstalledSpy = spyOn(configManager, "isOpenCodeInstalled").mockResolvedValue(false)
    getOpenCodeVersionSpy = spyOn(configManager, "getOpenCodeVersion").mockResolvedValue(null)

    const args: InstallArgs = {
      tui: false,
      profile: "mike",
    }

    // #when running install
    const exitCode = await install(args)

    // #then should return success (0), not failure (1)
    expect(exitCode).toBe(0)

    // #then should have printed a warning (not error)
    const allCalls = mockConsoleLog.mock.calls.flat().join("\n")
    expect(allCalls).toContain("[!]") // warning symbol
    expect(allCalls).toContain("OpenCode")
  })

  test("non-TUI mode: should create opencode.json with plugin even when binary not found", async () => {
    // #given OpenCode binary is NOT installed
    isOpenCodeInstalledSpy = spyOn(configManager, "isOpenCodeInstalled").mockResolvedValue(false)
    getOpenCodeVersionSpy = spyOn(configManager, "getOpenCodeVersion").mockResolvedValue(null)

    // #given mock npm fetch
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ latest: "3.0.0" }),
      } as Response)
    ) as unknown as typeof fetch

    const args: InstallArgs = {
      tui: false,
      profile: "mike",
    }

    // #when running install
    const exitCode = await install(args)

    // #then should create opencode.json
    const configPath = join(tempDir, "opencode.json")
    expect(existsSync(configPath)).toBe(true)

    // #then opencode.json should have plugin entry
    const config = JSON.parse(readFileSync(configPath, "utf-8"))
    expect(config.plugin).toBeDefined()
    expect(config.plugin.some((p: string) => p.includes("omo-cli"))).toBe(true)

    // #then exit code should be 0 (success)
    expect(exitCode).toBe(0)
  })

  test("non-TUI mode: should still succeed and complete all steps when binary exists", async () => {
    // #given OpenCode binary IS installed
    isOpenCodeInstalledSpy = spyOn(configManager, "isOpenCodeInstalled").mockResolvedValue(true)
    getOpenCodeVersionSpy = spyOn(configManager, "getOpenCodeVersion").mockResolvedValue("1.0.200")

    // #given mock npm fetch
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ latest: "3.0.0" }),
      } as Response)
    ) as unknown as typeof fetch

    const args: InstallArgs = {
      tui: false,
      profile: "mike",
    }

    // #when running install
    const exitCode = await install(args)

    // #then should return success
    expect(exitCode).toBe(0)

    // #then should have printed success (OK symbol)
    const allCalls = mockConsoleLog.mock.calls.flat().join("\n")
    expect(allCalls).toContain("[OK]")
    expect(allCalls).toContain("OpenCode 1.0.200")
  })
})
