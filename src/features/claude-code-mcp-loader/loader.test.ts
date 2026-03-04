import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test"

const mockExistsSync = mock(() => false)
const mockReadFileSync = mock(() => "")

mock.module("fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync
}))

const mockJoin = mock((...args: string[]) => args.join("/"))
mock.module("path", () => ({ join: mockJoin }))

const mockGetClaudeConfigDir = mock(() => "/test/claude/config")
mock.module("../../shared", () => ({ getClaudeConfigDir: mockGetClaudeConfigDir }))

const mockLog = mock(() => { })
mock.module("../../shared/logger", () => ({ log: mockLog }))

const mockTransformMcpServer = mock((name, config) => ({ ...config, transformed: true }))
mock.module("./transformer", () => ({ transformMcpServer: mockTransformMcpServer }))

import * as loader from "./loader"

describe("features/claude-code-mcp-loader/loader", () => {
  let bunFileSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    mockExistsSync.mockClear()
    mockReadFileSync.mockClear()
    mockJoin.mockClear()
    mockGetClaudeConfigDir.mockClear()
    mockLog.mockClear()
    mockTransformMcpServer.mockClear()

    bunFileSpy = spyOn(Bun, "file").mockImplementation(((path: string) => ({
      text: async () => ""
    })) as any)
  })

  afterEach(() => {
    bunFileSpy.mockRestore()
  })

  describe("getSystemMcpServerNames", () => {
    test("returns empty set if no configs exist", () => {
      mockExistsSync.mockReturnValue(false)
      expect(loader.getSystemMcpServerNames().size).toBe(0)
    })

    test("parses files and collects non-disabled server names", () => {
      const configObj = { mcpServers: { "srv1": {}, "srv2": { disabled: true }, "srv3": {} } }
      // return true for first file, false for others to limit parsing
      mockExistsSync.mockImplementation(((path: string) => path.includes("claude")) as any)
      mockReadFileSync.mockReturnValue(JSON.stringify(configObj))

      const names = loader.getSystemMcpServerNames()
      expect(names.size).toBe(2)
      expect(names.has("srv1")).toBe(true)
      expect(names.has("srv3")).toBe(true)
    })

    test("ignores malformed json gracefully", () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue("invalid")

      const names = loader.getSystemMcpServerNames()
      expect(names.size).toBe(0)
    })

    test("ignores config if mcpServers is null", () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({}))

      const names = loader.getSystemMcpServerNames()
      expect(names.size).toBe(0)
    })
  })

  describe("loadMcpConfigs", () => {
    test("loads configs correctly across multiple scopes overlapping names", async () => {
      const userConfig = { mcpServers: { srv1: { a: 1 }, srv2: { b: 2 } } }
      const projConfig = { mcpServers: { srv1: { disabled: true } } }

      mockExistsSync.mockImplementation(((p: string) => true) as any)

      bunFileSpy.mockImplementation((path: string) => ({
        text: async () => {
          if (path.includes(".claude/.mcp.json")) return "{}"
          if (path.includes("claude/config")) return JSON.stringify(userConfig) // user
          return JSON.stringify(projConfig) // project
        }
      }) as any)

      const res = await loader.loadMcpConfigs()

      // Expected: srv1 loaded from user, then disabled in project.
      // srv2 loaded from user.
      expect(res.servers.srv1).toBeUndefined()
      expect(res.servers.srv2).toBeDefined()
      expect(res.loadedServers.length).toBe(1)
      expect(res.loadedServers[0].name).toBe("srv2")
      expect(res.loadedServers[0].scope).toBe("user")
    })

    test("overrides previously loaded server fully replacing rather than merging", async () => {
      const userConfig = { mcpServers: { srv1: { a: 1 } } }
      const projConfig = { mcpServers: { srv1: { b: 1 } } }

      mockExistsSync.mockReturnValue(true)
      bunFileSpy.mockImplementation((path: string) => ({
        text: async () => {
          if (path.includes(".claude/.mcp.json")) return "{}"
          if (path.includes("claude/config")) return JSON.stringify(userConfig) // user
          return JSON.stringify(projConfig) // project
        }
      }) as any)

      const res = await loader.loadMcpConfigs()
      expect(res.loadedServers.length).toBe(1)
      expect(res.loadedServers[0].name).toBe("srv1")
      expect(res.loadedServers[0].scope).toBe("project")
    })

    test("handles transform throwing gracefully", async () => {
      mockExistsSync.mockImplementation(((p: string) => p === "/test/claude/config/.mcp.json") as any) // STRICTLY ONE MATCH
      const userConfig = { mcpServers: { srv1: { a: 1 } } }

      bunFileSpy.mockImplementation((path: string) => ({
        text: async () => JSON.stringify(userConfig)
      }) as any)

      mockTransformMcpServer.mockImplementationOnce(() => { throw new Error("crash") })

      const res = await loader.loadMcpConfigs()
      expect(res.loadedServers.length).toBe(0)
      expect(mockLog).toHaveBeenCalledWith('Failed to transform MCP server "srv1"', expect.any(Error))
    })

    test("handles loadMcpConfigFile missing file securely", async () => {
      mockExistsSync.mockReturnValue(false)
      const res = await loader.loadMcpConfigs()
      expect(res.loadedServers.length).toBe(0)
    })

    test("handles loadMcpConfigFile throwing due to bad json", async () => {
      mockExistsSync.mockReturnValue(true)
      bunFileSpy.mockImplementation(((path: string) => ({
        text: async () => "invalid json"
      })) as any)

      const res = await loader.loadMcpConfigs()
      expect(res.loadedServers.length).toBe(0)
      expect(mockLog).toHaveBeenCalled()
    })
  })

  describe("formatLoadedServersForToast", () => {
    test("returns empty string if length 0", () => {
      expect(loader.formatLoadedServersForToast([])).toBe("")
    })

    test("formats loaded servers neatly", () => {
      const servers: Record<string, unknown>[] = [
        { name: "srvA", scope: "user" },
        { name: "srvB", scope: "project" }
      ]
      expect(loader.formatLoadedServersForToast((servers as any))).toBe("srvA (user), srvB (project)")
    })
  })
})
