import { mock, describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import * as index from "./index"

// Mock dependencies
type PluginEntryInfo = { isPinned?: boolean; configPath?: string; entry?: string; pinnedVersion: string | null }
const mockGetCachedVersion = mock(() => null as string | null)
const mockGetLocalDevVersion = mock(() => null as string | null)
const mockFindPluginEntry = mock((): PluginEntryInfo | null => null)
const mockGetLatestVersion = mock(async () => null as string | null)
const mockUpdatePinnedVersion = mock(() => false)

mock.module("./checker", () => ({
  getCachedVersion: mockGetCachedVersion,
  getLocalDevVersion: mockGetLocalDevVersion,
  findPluginEntry: mockFindPluginEntry,
  getLatestVersion: mockGetLatestVersion,
  updatePinnedVersion: mockUpdatePinnedVersion,
}))

const mockInvalidatePackage = mock(() => { })
mock.module("./cache", () => ({ invalidatePackage: mockInvalidatePackage }))

const mockLog = mock(() => { })
mock.module("../../shared/logger", () => ({ log: mockLog }))

const mockGetConfigLoadErrors = mock((): Array<{ path: string; error: string }> => [])
const mockClearConfigLoadErrors = mock(() => { })
mock.module("../../shared/config-errors", () => ({
  getConfigLoadErrors: mockGetConfigLoadErrors,
  clearConfigLoadErrors: mockClearConfigLoadErrors
}))

const mockRunBunInstall = mock(async () => true)
mock.module("../../cli/config-manager", () => ({
  runBunInstall: mockRunBunInstall
}))

const mockIsModelCacheAvailable = mock(() => true)
mock.module("../../shared/model-availability", () => ({
  isModelCacheAvailable: mockIsModelCacheAvailable
}))

const mockHasConnectedProvidersCache = mock(() => true)
const mockUpdateConnectedProvidersCache = mock(async () => { })
mock.module("../../shared/connected-providers-cache", () => ({
  hasConnectedProvidersCache: mockHasConnectedProvidersCache,
  updateConnectedProvidersCache: mockUpdateConnectedProvidersCache
}))

describe("hooks/auto-update-checker/index", () => {
  beforeEach(() => {
    mockGetCachedVersion.mockClear()
    mockGetLocalDevVersion.mockClear()
    mockFindPluginEntry.mockClear()
    mockGetLatestVersion.mockClear()
    mockUpdatePinnedVersion.mockClear()
    mockInvalidatePackage.mockClear()
    mockLog.mockClear()
    mockGetConfigLoadErrors.mockClear()
    mockClearConfigLoadErrors.mockClear()
    mockRunBunInstall.mockClear()
    mockIsModelCacheAvailable.mockClear()
    mockHasConnectedProvidersCache.mockClear()
    mockUpdateConnectedProvidersCache.mockClear()
  })

  describe("isPrereleaseVersion", () => {
    test("detects hyphens", () => {
      expect(index.isPrereleaseVersion("1.0.0-beta")).toBe(true)
      expect(index.isPrereleaseVersion("1.0.0")).toBe(false)
    })
  })

  describe("isDistTag", () => {
    test("detects starting with non-digit", () => {
      expect(index.isDistTag("latest")).toBe(true)
      expect(index.isDistTag("next")).toBe(true)
      expect(index.isDistTag("1.0.0")).toBe(false)
    })
  })

  describe("isPrereleaseOrDistTag", () => {
    test("detects either", () => {
      expect(index.isPrereleaseOrDistTag(null)).toBe(false)
      expect(index.isPrereleaseOrDistTag("latest")).toBe(true)
      expect(index.isPrereleaseOrDistTag("1.0.0-beta")).toBe(true)
      expect(index.isPrereleaseOrDistTag("1.0.0")).toBe(false)
    })
  })

  describe("extractChannel", () => {
    test("extracts properly", () => {
      expect(index.extractChannel(null)).toBe("latest")
      expect(index.extractChannel("latest")).toBe("latest")
      expect(index.extractChannel("next")).toBe("next")
      expect(index.extractChannel("1.0.0-beta")).toBe("beta")
      expect(index.extractChannel("1.0.0-alpha.1")).toBe("alpha")
      expect(index.extractChannel("1.0.0-rc")).toBe("rc")
      expect(index.extractChannel("1.0.0-canary")).toBe("canary")
      expect(index.extractChannel("1.0.0-next.0")).toBe("next")
      expect(index.extractChannel("1.0.0-unknown")).toBe("latest")
      expect(index.extractChannel("1.0.0")).toBe("latest")
    })
  })

  describe("createAutoUpdateCheckerHook", () => {
    const createMockCtx = () => {
      const showToast = mock(async () => { })
      const ctx = {
        directory: "/test",
        client: {
          tui: { showToast }
        }
      }
      return ctx as unknown as PluginInput & { client: { tui: { showToast: typeof showToast } } }
    }

    const runHook = async (hook: ReturnType<typeof index.createAutoUpdateCheckerHook>, ctx: PluginInput, props?: Record<string, unknown>) => {
      hook.event({ event: { type: "session.created", properties: props } })
      await new Promise(r => setTimeout(r, 10)) // wait for background setTimeout
    }

    test("ignores non-session.created events", () => {
      const hook = index.createAutoUpdateCheckerHook(createMockCtx())
      hook.event({ event: { type: "something.else" } })
      expect(mockGetCachedVersion).not.toHaveBeenCalled()
    })

    test("ignores if already checked", async () => {
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx)
      await runHook(hook, ctx)
      expect(mockGetCachedVersion).toHaveBeenCalled()
      mockGetCachedVersion.mockClear()
      await runHook(hook, ctx)
      expect(mockGetCachedVersion).not.toHaveBeenCalled()
    })

    test("ignores child sessions", async () => {
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx)
      await runHook(hook, ctx, { info: { parentID: "abc" } })
      expect(mockGetCachedVersion).not.toHaveBeenCalled()
    })

    test("shows config load errors", async () => {
      mockGetConfigLoadErrors.mockReturnValueOnce([{ path: "a", error: "err" }])
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx)
      await runHook(hook, ctx)
      expect(mockClearConfigLoadErrors).toHaveBeenCalled()
      expect(ctx.client.tui.showToast).toHaveBeenCalled()
    })

    test("shows model cache warning if not available", async () => {
      mockIsModelCacheAvailable.mockReturnValueOnce(false)
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx)
      await runHook(hook, ctx)
      expect(ctx.client.tui.showToast).toHaveBeenCalled()
    })

    test("shows connected providers toast if missing cache", async () => {
      mockHasConnectedProvidersCache.mockReturnValueOnce(false)
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx)
      await runHook(hook, ctx)
      expect(mockUpdateConnectedProvidersCache).toHaveBeenCalled()
      expect(ctx.client.tui.showToast).toHaveBeenCalled()
    })

    test("local development mode halts update checks and shows local toast", async () => {
      mockGetLocalDevVersion.mockReturnValueOnce("1.0.0")
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx, { showStartupToast: true, isSisyphusEnabled: true })
      await runHook(hook, ctx)
      expect(mockFindPluginEntry).not.toHaveBeenCalled()
    })

    test("background check aborts if no plugin info", async () => {
      mockFindPluginEntry.mockReturnValueOnce((null as never))
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx, { showStartupToast: false })
      await runHook(hook, ctx)
      expect(mockGetLatestVersion).not.toHaveBeenCalled()
    })

    test("background check aborts if no version found", async () => {
      mockFindPluginEntry.mockReturnValueOnce(({ pinnedVersion: null }))
      mockGetCachedVersion.mockReturnValueOnce(null)
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx, { showStartupToast: false })
      await runHook(hook, ctx)
      expect(mockGetLatestVersion).not.toHaveBeenCalled()
    })

    test("background check aborts if getLatestVersion returns null", async () => {
      mockFindPluginEntry.mockReturnValueOnce(({ pinnedVersion: "1.0.0" }))
      mockGetCachedVersion.mockReturnValueOnce("1.0.0")
      mockGetLatestVersion.mockResolvedValueOnce(null)
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx, { showStartupToast: false })
      await runHook(hook, ctx)
      expect(mockInvalidatePackage).not.toHaveBeenCalled()
    })

    test("background check aborts if already latest version", async () => {
      mockFindPluginEntry.mockReturnValueOnce(({ pinnedVersion: "1.0.0" }))
      mockGetCachedVersion.mockReturnValueOnce("1.0.0")
      mockGetLatestVersion.mockResolvedValueOnce("1.0.0")
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx, { showStartupToast: false })
      await runHook(hook, ctx)
      expect(mockInvalidatePackage).not.toHaveBeenCalled()
    })

    test("background check issues notification only if autoUpdate disabled", async () => {
      mockFindPluginEntry.mockReturnValueOnce(({ pinnedVersion: "1.0.0" }))
      mockGetCachedVersion.mockReturnValueOnce("1.0.0")
      mockGetLatestVersion.mockResolvedValueOnce("1.1.0")
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx, { showStartupToast: false, autoUpdate: false })
      await runHook(hook, ctx)
      expect(ctx.client.tui.showToast).toHaveBeenCalled()
      expect(mockInvalidatePackage).not.toHaveBeenCalled()
    })

    test("background check installs update", async () => {
      mockFindPluginEntry.mockReturnValueOnce(({ isPinned: true, configPath: "foo", entry: "bar", pinnedVersion: "1.0.0" }))
      mockGetCachedVersion.mockReturnValueOnce("1.0.0")
      mockGetLatestVersion.mockResolvedValueOnce("1.1.0")
      mockUpdatePinnedVersion.mockReturnValueOnce(true)
      mockRunBunInstall.mockResolvedValueOnce(true)

      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx, { showStartupToast: false, autoUpdate: true })
      await runHook(hook, ctx)

      expect(mockUpdatePinnedVersion).toHaveBeenCalled()
      expect(mockInvalidatePackage).toHaveBeenCalled()
      expect(mockRunBunInstall).toHaveBeenCalled()
      expect(ctx.client.tui.showToast).toHaveBeenCalled()
    })

    test("background check handles pinned update failure", async () => {
      mockFindPluginEntry.mockReturnValueOnce(({ isPinned: true, configPath: "foo", entry: "bar", pinnedVersion: "1.0.0" }))
      mockGetCachedVersion.mockReturnValueOnce("1.0.0")
      mockGetLatestVersion.mockResolvedValueOnce("1.1.0")
      mockUpdatePinnedVersion.mockReturnValueOnce(false)

      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx, { showStartupToast: false, autoUpdate: true })
      await runHook(hook, ctx)

      expect(mockInvalidatePackage).not.toHaveBeenCalled()
    })

    test("background check handles runBunInstall failure", async () => {
      mockFindPluginEntry.mockReturnValueOnce(({ isPinned: false, pinnedVersion: "1.0.0" }))
      mockGetCachedVersion.mockReturnValueOnce("1.0.0")
      mockGetLatestVersion.mockResolvedValueOnce("1.1.0")
      mockRunBunInstall.mockResolvedValueOnce(false)

      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx, { showStartupToast: false, autoUpdate: true })
      await runHook(hook, ctx)

      expect(ctx.client.tui.showToast).toHaveBeenCalled()
    })

    test("background check handles runBunInstall exception", async () => {
      mockFindPluginEntry.mockReturnValueOnce(({ isPinned: false, pinnedVersion: "1.0.0" }))
      mockGetCachedVersion.mockReturnValueOnce("1.0.0")
      mockGetLatestVersion.mockResolvedValueOnce("1.1.0")
      mockRunBunInstall.mockImplementationOnce(() => Promise.reject(new Error("Crash")))

      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx, { showStartupToast: false, autoUpdate: true })
      await runHook(hook, ctx)

      expect(ctx.client.tui.showToast).toHaveBeenCalled()
    })

    test("getToastMessage evaluates with sisyphus configurations accurately during startup", async () => {
      mockFindPluginEntry.mockReturnValueOnce(({ pinnedVersion: "1.0.0" }))
      mockGetCachedVersion.mockReturnValueOnce("1.0.0")
      mockGetLatestVersion.mockResolvedValueOnce("1.1.0")
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx, { showStartupToast: true, autoUpdate: false, isSisyphusEnabled: true })
      await runHook(hook, ctx)
      expect(ctx.client.tui.showToast).toHaveBeenCalled()
    })

    test("handles top-level configuration throwing without bubbling", async () => {
      mockFindPluginEntry.mockImplementationOnce(() => { throw new Error("crash") })
      const ctx = createMockCtx()
      const hook = index.createAutoUpdateCheckerHook(ctx, { showStartupToast: false })
      await runHook(hook, ctx)
      expect(mockLog).toHaveBeenCalledWith("[auto-update-checker] Background update check failed:", expect.any(Error))
    })
  })
})
