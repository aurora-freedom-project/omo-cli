import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test"

const mockExited = mock(() => Promise.resolve(0))
const mockStdoutText = mock(() => Promise.resolve(""))
const mockStderrText = mock(() => Promise.resolve(""))

const mockGetTmuxPath = mock(async () => "/usr/bin/tmux")
mock.module("../../tools/interactive-bash/utils", () => ({ getTmuxPath: mockGetTmuxPath }))

const mockLog = mock(() => { })
mock.module("../logger", () => ({ log: mockLog }))

import * as tmux from "./tmux-utils"

describe("shared/tmux/tmux-utils", () => {
  let originalEnv: NodeJS.ProcessEnv
  let globalFetchSpy: ReturnType<typeof spyOn>
  let spawnSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    mockExited.mockClear()
    mockStdoutText.mockClear()
    mockStderrText.mockClear()
    mockGetTmuxPath.mockClear()
    mockLog.mockClear()

    tmux.resetServerCheck()

    originalEnv = { ...process.env }

    globalFetchSpy = spyOn(globalThis, "fetch").mockImplementation(async () => ({ ok: true }) as any)

    spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => ({
      exited: mockExited(),
      stdout: "mock_stdout",
      stderr: "mock_stderr"
    }) as any)

    // Mock Response to handle our mocked stream
    spyOn(globalThis, "Response").mockImplementation((body: unknown) => ({
      text: body === "mock_stdout" ? mockStdoutText : mockStderrText
    }) as any)
  })

  afterEach(() => {
    process.env = originalEnv
    globalFetchSpy.mockRestore()
    spawnSpy.mockRestore()
    mock.restore() // bun:test built-in
  })

  describe("isInsideTmux", () => {
    test("returns false if TMUX empty", () => {
      delete process.env.TMUX
      expect(tmux.isInsideTmux()).toBe(false)
    })

    test("returns true if TMUX exists", () => {
      process.env.TMUX = "test"
      expect(tmux.isInsideTmux()).toBe(true)
    })
  })

  describe("isServerRunning", () => {
    test("resolves true from fetch block", async () => {
      const res = await tmux.isServerRunning("http://localhost:1234")
      expect(res).toBe(true)
      expect(globalFetchSpy).toHaveBeenCalled()

      // Should cache true response
      globalFetchSpy.mockClear()
      const res2 = await tmux.isServerRunning("http://localhost:1234")
      expect(res2).toBe(true)
      expect(globalFetchSpy).not.toHaveBeenCalled()
    })

    test("resolves false returning health check fail up to 2 attempts max", async () => {
      globalFetchSpy.mockImplementation(async () => { throw new Error("conn refused") })
      const res = await tmux.isServerRunning("http://localhost:9999")
      expect(res).toBe(false)
      expect(globalFetchSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe("getCurrentPaneId", () => {
    test("returns pane id", () => {
      process.env.TMUX_PANE = "%1"
      expect(tmux.getCurrentPaneId()).toBe("%1")
    })
  })

  describe("getPaneDimensions", () => {
    test("returns null if no tmux path", async () => {
      mockGetTmuxPath.mockResolvedValueOnce(null as never)
      const res = await tmux.getPaneDimensions("%1")
      expect(res).toBeNull()
    })

    test("returns null if exit code != 0", async () => {
      mockExited.mockResolvedValueOnce(1)
      const res = await tmux.getPaneDimensions("%1")
      expect(res).toBeNull()
    })

    test("returns obj dimension if parsed successfully", async () => {
      mockExited.mockResolvedValueOnce(0)
      mockStdoutText.mockResolvedValueOnce("80,100")
      const res = await tmux.getPaneDimensions("%1")
      expect(res).toEqual({ paneWidth: 80, windowWidth: 100 })
    })

    test("returns null if parsed dimension arrays contain NaNs", async () => {
      mockExited.mockResolvedValueOnce(0)
      mockStdoutText.mockResolvedValueOnce("bad,data")
      const res = await tmux.getPaneDimensions("%1")
      expect(res).toBeNull()
    })
  })

  describe("spawnTmuxPane", () => {
    test("skips if config not enabled", async () => {
      const res = await tmux.spawnTmuxPane("s1", "desc", { enabled: false } as never, "http://localhost:1234")
      expect(res.success).toBe(false)
    })

    test("skips if not inside tmux", async () => {
      delete process.env.TMUX
      const res = await tmux.spawnTmuxPane("s1", "desc", { enabled: true } as never, "http://localhost:1234")
      expect(res.success).toBe(false)
    })

    test("skips if server not running", async () => {
      process.env.TMUX = "1"
      globalFetchSpy.mockImplementation(async () => ({ ok: false }))
      const res = await tmux.spawnTmuxPane("s1", "desc", { enabled: true } as never, "http://localhost:1234")
      expect(res.success).toBe(false)
    })

    test("skips if tmux not found", async () => {
      process.env.TMUX = "1"
      await tmux.isServerRunning("http://localhost:1234")
      mockGetTmuxPath.mockResolvedValueOnce(null as never)
      const res = await tmux.spawnTmuxPane("s1", "desc", { enabled: true } as never, "http://localhost:1234")
      expect(res.success).toBe(false)
    })

    test("returns false if exitcode != 0", async () => {
      process.env.TMUX = "1"
      await tmux.isServerRunning("http://localhost:1234")

      mockExited.mockResolvedValueOnce(1)
      mockStdoutText.mockResolvedValueOnce("")

      const res = await tmux.spawnTmuxPane("s1", "desc", { enabled: true } as never, "http://localhost:1234")
      expect(res.success).toBe(false)
    })

    test("spawns properly when all steps pass assigning title pane bounds", async () => {
      process.env.TMUX = "1"
      await tmux.isServerRunning("http://localhost:1234")

      mockExited.mockResolvedValue(0)
      mockStdoutText.mockResolvedValueOnce("%2")

      const res = await tmux.spawnTmuxPane("s1", "verylongdescriptionherexyz", { enabled: true } as never, "http://localhost:1234", "%0")
      expect(res.success).toBe(true)
      expect(res.paneId).toBe("%2")
      expect(spawnSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe("closeTmuxPane", () => {
    test("returns false skip not in tmux", async () => {
      delete process.env.TMUX
      const res = await tmux.closeTmuxPane("%1")
      expect(res).toBe(false)
    })

    test("returns false skip tmux not found", async () => {
      process.env.TMUX = "1"
      mockGetTmuxPath.mockResolvedValueOnce(null as never)
      const res = await tmux.closeTmuxPane("%1")
      expect(res).toBe(false)
    })

    test("resolves bool matching exit code checks string inputs", async () => {
      process.env.TMUX = "1"
      mockExited.mockResolvedValueOnce(0)

      const res = await tmux.closeTmuxPane("%1")
      expect(res).toBe(true)

      mockExited.mockResolvedValueOnce(1)
      mockStderrText.mockResolvedValueOnce("error check var")
      const res2 = await tmux.closeTmuxPane("%1")
      expect(res2).toBe(false)
    })
  })

  describe("replaceTmuxPane", () => {
    test("skips enabled", async () => {
      const res = await tmux.replaceTmuxPane("%1", "s1", "d", { enabled: false } as never, "h")
      expect(res.success).toBe(false)
    })

    test("skips outside tmux", async () => {
      delete process.env.TMUX
      const res = await tmux.replaceTmuxPane("%1", "s1", "d", { enabled: true } as never, "h")
      expect(res.success).toBe(false)
    })

    test("skips if no binary path found mapped limit", async () => {
      process.env.TMUX = "1"
      mockGetTmuxPath.mockResolvedValueOnce(null as never)
      const res = await tmux.replaceTmuxPane("%1", "s1", "d", { enabled: true } as never, "h")
      expect(res.success).toBe(false)
    })

    test("fails if exit code indicates errors binding err stdout strings", async () => {
      process.env.TMUX = "1"
      mockExited.mockResolvedValueOnce(1)
      mockStderrText.mockResolvedValueOnce("err block")
      const res = await tmux.replaceTmuxPane("%1", "s1", "d", { enabled: true } as never, "h")
      expect(res.success).toBe(false)
    })

    test("spawns map to specific id and returns", async () => {
      process.env.TMUX = "1"
      mockExited.mockResolvedValue(0)
      const res = await tmux.replaceTmuxPane("%1", "s1", "d", { enabled: true } as never, "h")
      expect(res.success).toBe(true)
      expect(res.paneId).toBe("%1")
    })
  })

  describe("applyLayout", () => {
    test("applies layout dimensions resolving strings mapped directly", async () => {
      mockExited.mockResolvedValue(0)
      await tmux.applyLayout("/usr/tmux", "main-horizontal", 50)
      expect(spawnSpy).toHaveBeenCalledTimes(2) // select-layout + set-window-option
    })
    test("applies normal layout dimension limits without main string maps", async () => {
      mockExited.mockResolvedValue(0)
      await tmux.applyLayout("/usr/tmux", "tiled", 50)
      expect(spawnSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe("enforceMainPaneWidth", () => {
    test("early returns if no binary limits matched", async () => {
      mockGetTmuxPath.mockResolvedValueOnce(null as never)
      await tmux.enforceMainPaneWidth("%1", 100)
      expect(spawnSpy).not.toHaveBeenCalled()
    })

    test("calculates math correctly resolving resize mapped limits bounds", async () => {
      await tmux.enforceMainPaneWidth("%1", 101)
      expect(spawnSpy).toHaveBeenCalledWith(["/usr/bin/tmux", "resize-pane", "-t", "%1", "-x", "50"], expect.anything())
    })
  })
})
