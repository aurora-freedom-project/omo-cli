import { describe, test, expect, mock, spyOn, afterEach, beforeEach } from "bun:test"
import * as fs from "fs"
import * as path from "path"

let mockFiles: Record<string, string> = {}
let mockedExistsState: Record<string, boolean> = {}

mock.module("fs", () => ({
  existsSync: mock((p: string) => {
    if (p in mockedExistsState) return mockedExistsState[p]
    if (p in mockFiles) return true
    return false
  }),
  readFileSync: mock((p: string, encoding: string) => {
    if (p in mockFiles) {
      return mockFiles[p]
    }
    throw new Error("ENOENT")
  })
}))

// Mock node platform
mock.module("os", () => ({
  homedir: () => "/mock/home",
  platform: () => "linux",
}))

import {
  findServerForExtension,
  getLanguageId,
  isServerInstalled,
  getAllServers,
  getConfigPaths_
} from "./config"

describe("lsp/config", () => {
  let mockCwd: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockFiles = {}
    mockedExistsState = {}
    mockCwd = spyOn(process, "cwd").mockReturnValue("/mock/project")
    Object.defineProperty(process, "platform", { value: "linux", configurable: true })
    process.env.PATH = "/bin:/usr/bin"
    delete process.env.PATHEXT
  })

  afterEach(() => {
    mock.restore()
  })

  describe("getConfigPaths_", () => {
    test("returns merged location mapping to standard open code schema paths", () => {
      const paths = getConfigPaths_()
      expect(paths.project.endsWith(".opencode/omo-cli.json")).toBe(true)
      expect(paths.user.endsWith("omo-cli.json")).toBe(true)
      expect(paths.opencode.endsWith("opencode.json")).toBe(true)
    })
  })

  describe("getLanguageId", () => {
    test("returns standard mappings for extensions", () => {
      expect(getLanguageId(".ts")).toBe("typescript")
      expect(getLanguageId(".py")).toBe("python")
      expect(getLanguageId(".unknownext")).toBe("plaintext")
    })
  })

  describe("findServerForExtension", () => {
    test("ignores unconfigured extensions without defaulting to null failures", () => {
      const res = findServerForExtension("unknownext")
      expect(res.status).toBe("not_configured")
      expect((res as Record<string, unknown>).availableServers).toBeDefined()
    })

    test("loads valid user configurations overrides and returns them found when installed", () => {
      // Setup project config with a mock TS server
      const paths = getConfigPaths_()
      mockFiles[paths.project] = JSON.stringify({
        lsp: {
          "custom-ts": {
            command: ["my-tsserver"],
            extensions: ["ts", "tsx"],
            priority: 50
          }
        }
      })
      // Mock server executable existing on path
      mockedExistsState["/bin/my-tsserver"] = true

      const res = findServerForExtension("ts")
      expect(res.status).toBe("found")
      if (res.status === "found") {
        expect(res.server.id).toBe("custom-ts")
      }
    })

    test("prioritizes sources over raw priorities", () => {
      const paths = getConfigPaths_()
      // Project config
      mockFiles[paths.project] = JSON.stringify({
        lsp: {
          "proj-server": { command: ["cmd"], extensions: ["js"], priority: 1 }
        }
      })
      // User config
      mockFiles[paths.user] = JSON.stringify({
        lsp: {
          "user-server": { command: ["cmd2"], extensions: ["js"], priority: 100 } // Higher priority, lower tier
        }
      })

      mockedExistsState["/bin/cmd"] = true
      mockedExistsState["/bin/cmd2"] = true

      const res = findServerForExtension("js")
      expect(res.status).toBe("found")
      if (res.status === "found") {
        expect(res.server.id).toBe("proj-server")
      }
    })

    test("returns not_installed when server is configured but binary is missing", () => {
      const paths = getConfigPaths_()
      mockFiles[paths.project] = JSON.stringify({
        lsp: {
          "custom-ts": {
            command: ["missing-bin"], // doesn't exist
            extensions: ["ts"]
          }
        }
      })

      const res = findServerForExtension("ts")
      expect(res.status).toBe("not_installed")
      if (res.status === "not_installed") {
        expect(res.installHint).toContain("missing-bin")
      }
    })

    test("avoids disabled servers effectively across multiple configuration layers", () => {
      const paths = getConfigPaths_()
      mockFiles[paths.project] = JSON.stringify({
        lsp: {
          "typescript-language-server": { disabled: true }
        }
      })

      mockedExistsState["/bin/typescript-language-server"] = true

      const res = findServerForExtension("ts")
      expect(res.status).toBe("not_configured")
    })

    test("ignores corrupted config JSON logic gracefully", () => {
      const paths = getConfigPaths_()
      mockFiles[paths.project] = "{ corrupted_json"

      const res = findServerForExtension("unknownext")
      expect(res.status).toBe("not_configured")
    })
  })

  describe("isServerInstalled", () => {
    test("returns false for zero length arrays", () => {
      expect(isServerInstalled([])).toBe(false)
    })

    test("handles absolute path checks", () => {
      mockedExistsState["/usr/local/bin/abs-server"] = true
      expect(isServerInstalled(["/usr/local/bin/abs-server"])).toBe(true)
      expect(isServerInstalled(["/usr/local/bin/fake"])).toBe(false) // Not exist
    })

    test("resolves through basic $PATH matching on standard posix shells", () => {
      mockedExistsState["/usr/bin/my-tool"] = true
      expect(isServerInstalled(["my-tool"])).toBe(true)
    })

    test("resolves node/bun aliases identically without explicit path mapping requirement", () => {
      expect(isServerInstalled(["bun"])).toBe(true)
      expect(isServerInstalled(["node"])).toBe(true)
    })

    test("simulates windows EXT logic mapping with PATH/Path mapping checks", () => {
      process.env.PATHEXT = ".EXE;.CMD"
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true
      })
      process.env.Path = "C:\\Windows\\system32;D:\\bin" // capitalized fallbacks
      delete process.env.PATH

      // Check for lowercase fallback matching iteration loop testing execution states
      mockedExistsState[path.join("D:\\bin", "my-tool.EXE")] = true

      expect(isServerInstalled(["my-tool"])).toBe(true)
    })

    test("simulates windows without PATHEXT defaulting safely", () => {
      delete process.env.PATHEXT
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true
      })
      process.env.Path = "D:\\bin"
      delete process.env.PATH

      mockedExistsState[path.join("D:\\bin", "my-tool.exe")] = true

      expect(isServerInstalled(["my-tool"])).toBe(true)
    })

    test("returns false when fully missing anywhere", () => {
      expect(isServerInstalled(["completely-missing"])).toBe(false)
    })
  })

  describe("getAllServers", () => {
    test("merges configured and builtin servers noting their disabled/status flags", () => {
      const paths = getConfigPaths_()
      // Make user specify an extra new module
      mockFiles[paths.project] = JSON.stringify({
        lsp: {
          "my-new-tool": {
            command: ["exist-bin"], extensions: ["sql"]
          },
          "typescript-language-server": { disabled: true }
        }
      })
      mockedExistsState["/bin/exist-bin"] = true

      const all = getAllServers()

      // The custom one should be present and installed
      const custom = all.find(x => x.id === "my-new-tool")
      expect(custom).toBeDefined()
      expect(custom!.installed).toBe(true)
      expect(custom!.disabled).toBe(false)

      // The builtin override should be marked disabled
      const builtinTs = all.find(x => x.id === "typescript-language-server")
      expect(builtinTs).toBeDefined()
      expect(builtinTs!.disabled).toBe(true)
    })
  })
})
