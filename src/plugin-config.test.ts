import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"

const mockExistsSync = mock((_path: string) => false)
const mockReadFileSync = mock((_path: string, _enc?: string) => "")
mock.module("fs", () => ({ existsSync: mockExistsSync, readFileSync: mockReadFileSync }))

const mockSafeParse = mock(() => ({ success: true, data: {} }))
mock.module("./config", () => ({
  OmoCliConfigSchema: { safeParse: mockSafeParse }
}))

const mockLog = mock(() => { })
const mockDeepMerge = mock((a: Record<string, unknown>, b: Record<string, unknown>) => ({ ...a, ...b }))
const mockGetOpenCodeConfigDir = mock(() => "/user/.config")
const mockAddConfigLoadError = mock(() => { })
const mockParseJsonc = mock(() => ({}))
const mockDetectConfigFile = mock(() => ({ format: "none", path: "" }))
const mockMigrateConfigFile = mock(() => { })

mock.module("./shared", () => ({
  log: mockLog,
  deepMerge: mockDeepMerge,
  getOpenCodeConfigDir: mockGetOpenCodeConfigDir,
  addConfigLoadError: mockAddConfigLoadError,
  parseJsonc: mockParseJsonc,
  detectConfigFile: mockDetectConfigFile,
  migrateConfigFile: mockMigrateConfigFile
}))

import { loadConfigFromPath, mergeConfigs, loadPluginConfig } from "./plugin-config"

describe("plugin-config", () => {
  beforeEach(() => {
    mockExistsSync.mockClear()
    mockReadFileSync.mockClear()
    mockSafeParse.mockClear()
    mockLog.mockClear()
    mockDeepMerge.mockClear()
    mockGetOpenCodeConfigDir.mockClear()
    mockAddConfigLoadError.mockClear()
    mockParseJsonc.mockClear()
    mockDetectConfigFile.mockClear()
    mockMigrateConfigFile.mockClear()
  })

  describe("loadConfigFromPath", () => {
    test("returns null if file does not exist", () => {
      mockExistsSync.mockReturnValueOnce(false)
      const res = loadConfigFromPath("/fake/path.json", {})
      expect(res).toBeNull()
    })

    test("returns null and logs error if fs throws", () => {
      mockExistsSync.mockImplementationOnce(() => { throw new Error("FS Error") })
      const res = loadConfigFromPath("/fake/path.json", {})
      expect(res).toBeNull()
      expect(mockAddConfigLoadError).toHaveBeenCalledWith({ path: "/fake/path.json", error: "FS Error" })
    })

    test("returns null and adds error if zod validation fails", () => {
      mockExistsSync.mockReturnValueOnce(true)
      mockReadFileSync.mockReturnValueOnce("{}")
      mockParseJsonc.mockReturnValueOnce({})
      mockSafeParse.mockReturnValueOnce({
        success: false,
        error: { issues: [{ path: ["agents"], message: "Invalid type" }] }
      } as never)

      const res = loadConfigFromPath("/fake/path.json", {})
      expect(res).toBeNull()
      expect(mockAddConfigLoadError).toHaveBeenCalledWith({ path: "/fake/path.json", error: "Validation error: agents: Invalid type" })
    })

    test("returns valid config on success", () => {
      mockExistsSync.mockReturnValueOnce(true)
      mockReadFileSync.mockReturnValueOnce("{}")
      mockParseJsonc.mockReturnValueOnce({ agents: {} })
      mockSafeParse.mockReturnValueOnce({ success: true, data: { agents: {} } } as never)

      const res = loadConfigFromPath("/fake/path.json", {})
      expect(res).toEqual({ agents: {} })
      expect(mockMigrateConfigFile).toHaveBeenCalled()
    })
  })

  describe("mergeConfigs", () => {
    test("merges base and overrides with deduplication", () => {
      const base = {
        disabled_agents: ["a", "b"],
        disabled_mcps: ["x"],
        disabled_hooks: ["hook1"],
        disabled_commands: [],
        disabled_skills: ["skill1"]
      } as never

      const override = {
        disabled_agents: ["b", "c"],
        disabled_mcps: ["x", "y"],
        disabled_hooks: ["hook2"],
        disabled_commands: ["cmd1"],
        disabled_skills: ["skill1", "skill2"]
      } as never

      const res = mergeConfigs(base, override)

      expect((res as Record<string, unknown>).disabled_agents).toEqual(["a", "b", "c"])
      expect((res as Record<string, unknown>).disabled_mcps).toEqual(["x", "y"])
      expect((res as Record<string, unknown>).disabled_hooks).toEqual(["hook1", "hook2"])
      expect((res as Record<string, unknown>).disabled_commands).toEqual(["cmd1"])
      expect((res as Record<string, unknown>).disabled_skills).toEqual(["skill1", "skill2"])
    })
  })

  describe("loadPluginConfig", () => {
    test("loads configs falling back to json extension when format is none", () => {
      mockGetOpenCodeConfigDir.mockReturnValueOnce("/user/config")
      mockDetectConfigFile.mockReturnValue({ format: "none", path: "" })

      mockExistsSync.mockReturnValue(true) // pretend all exist
      mockReadFileSync.mockReturnValue("{}")
      mockParseJsonc.mockReturnValue({})
      mockSafeParse.mockReturnValue({ success: true, data: {} } as never)

      const res = loadPluginConfig("/proj/dir", {})
      expect(res).toEqual({
        agents: {},
        categories: {},
        claude_code: {},
        disabled_agents: [],
        disabled_commands: [],
        disabled_hooks: [],
        disabled_mcps: [],
        disabled_skills: []
      })
      // Called 2 times
      expect(mockDetectConfigFile).toHaveBeenCalledTimes(2)
    })

    test("loads configs using detected paths and merges them", () => {
      mockGetOpenCodeConfigDir.mockReturnValueOnce("/user/config")
      mockDetectConfigFile.mockReturnValueOnce({ format: "jsonc", path: "/user/config/omo-cli.jsonc" })
      mockDetectConfigFile.mockReturnValueOnce({ format: "json", path: "/proj/dir/.opencode/omo-cli.json" })

      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue("{}")
      mockParseJsonc.mockReturnValue({})
      mockSafeParse.mockReturnValue({ success: true, data: { merged: true } } as never)

      const res = loadPluginConfig("/proj/dir", {})
      expect(res).toEqual({
        agents: {},
        categories: {},
        claude_code: {},
        disabled_agents: [],
        disabled_commands: [],
        disabled_hooks: [],
        disabled_mcps: [],
        disabled_skills: [],
        merged: true
      } as never)
    })

    test("does not merge if project config doesn't exist", () => {
      mockGetOpenCodeConfigDir.mockReturnValueOnce("/user/config")
      mockDetectConfigFile.mockReturnValueOnce({ format: "jsonc", path: "/user/config/omo-cli.jsonc" })
      mockDetectConfigFile.mockReturnValueOnce({ format: "json", path: "/proj/dir/.opencode/omo-cli.json" })

      // First exists (user), second fails (proj)
      mockExistsSync.mockImplementation((path: string) => {
        if (String(path).includes("proj")) return false
        return true
      })

      mockReadFileSync.mockReturnValue("{}")
      mockParseJsonc.mockReturnValue({})
      mockSafeParse.mockReturnValue({ success: true, data: { userOnly: true } } as never)

      const res = loadPluginConfig("/proj/dir", {})
      expect(res).toEqual({ userOnly: true } as never)
    })
  })
})
