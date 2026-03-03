
import type { TmuxConfig, TmuxLayout } from "../../config/schema"
import type { SpawnPaneResult } from "./types"
import { getTmuxPath } from "../../tools/interactive-bash/utils"

let serverAvailable: boolean | null = null
let serverCheckUrl: string | null = null

/** Checks if the current process is running inside a tmux session. */
export function isInsideTmux(): boolean {
  return !!process.env.TMUX
}

/**
 * Checks if the OpenCode server is running and healthy.
 * @param serverUrl - Base URL of the server
 * @returns True if the server responds to health checks
 */
export async function isServerRunning(serverUrl: string): Promise<boolean> {
  if (serverCheckUrl === serverUrl && serverAvailable === true) {
    return true
  }

  const healthUrl = new URL("/health", serverUrl).toString()
  const timeoutMs = 3000
  const maxAttempts = 2

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(healthUrl, { signal: controller.signal }).catch(
        () => null
      )
      clearTimeout(timeout)

      if (response?.ok) {
        serverCheckUrl = serverUrl
        serverAvailable = true
        return true
      }
    } finally {
      clearTimeout(timeout)
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  return false
}

/** Resets the cached server availability state. */
export function resetServerCheck(): void {
  serverAvailable = null
  serverCheckUrl = null
}

/** Tmux pane split direction: horizontal (-h) or vertical (-v). */
export type SplitDirection = "-h" | "-v"

/** Gets the current tmux pane ID from environment. */
export function getCurrentPaneId(): string | undefined {
  return process.env.TMUX_PANE
}

/** Dimensions of a tmux pane and its parent window. */
export interface PaneDimensions {
  paneWidth: number
  windowWidth: number
}

/**
 * Gets the size dimensions of a tmux pane.
 * @param paneId - Tmux pane identifier
 * @returns Pane and window widths, or null if unavailable
 */
export async function getPaneDimensions(paneId: string): Promise<PaneDimensions | null> {
  const tmux = await getTmuxPath()
  if (!tmux) return null

  const proc = Bun.spawn([tmux, "display", "-p", "-t", paneId, "#{pane_width},#{window_width}"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()

  if (exitCode !== 0) return null

  const [paneWidth, windowWidth] = stdout.trim().split(",").map(Number)
  if (isNaN(paneWidth) || isNaN(windowWidth)) return null

  return { paneWidth, windowWidth }
}

/**
 * Spawns a new tmux pane for a sub-agent session.
 * @param sessionId - OpenCode session ID
 * @param description - Human-readable description for the pane
 * @param config - Tmux configuration
 * @param serverUrl - OpenCode server URL
 * @param targetPaneId - Optional pane to split from
 * @param splitDirection - Split direction (default: horizontal)
 * @returns Result with success status and pane ID
 */
export async function spawnTmuxPane(
  sessionId: string,
  description: string,
  config: TmuxConfig,
  serverUrl: string,
  targetPaneId?: string,
  splitDirection: SplitDirection = "-h"
): Promise<SpawnPaneResult> {
  const { log } = await import("../logger")

  log("[spawnTmuxPane] called", { sessionId, description, serverUrl, configEnabled: config.enabled, targetPaneId, splitDirection })

  if (!config.enabled) {
    log("[spawnTmuxPane] SKIP: config.enabled is false")
    return { success: false }
  }
  if (!isInsideTmux()) {
    log("[spawnTmuxPane] SKIP: not inside tmux", { TMUX: process.env.TMUX })
    return { success: false }
  }

  const serverRunning = await isServerRunning(serverUrl)
  if (!serverRunning) {
    log("[spawnTmuxPane] SKIP: server not running", { serverUrl })
    return { success: false }
  }

  const tmux = await getTmuxPath()
  if (!tmux) {
    log("[spawnTmuxPane] SKIP: tmux not found")
    return { success: false }
  }

  log("[spawnTmuxPane] all checks passed, spawning...")

  const opencodeCmd = `opencode attach ${serverUrl} --session ${sessionId}`

  const args = [
    "split-window",
    splitDirection,
    "-d",
    "-P",
    "-F",
    "#{pane_id}",
    ...(targetPaneId ? ["-t", targetPaneId] : []),
    opencodeCmd,
  ]

  const proc = Bun.spawn([tmux, ...args], { stdout: "pipe", stderr: "pipe" })
  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const paneId = stdout.trim()

  if (exitCode !== 0 || !paneId) {
    return { success: false }
  }

  const title = `omo-subagent-${description.slice(0, 20)}`
  Bun.spawn([tmux, "select-pane", "-t", paneId, "-T", title], {
    stdout: "ignore",
    stderr: "ignore",
  })

  return { success: true, paneId }
}

/**
 * Closes a tmux pane.
 * @param paneId - Tmux pane identifier to close
 * @returns True if the pane was successfully closed
 */
export async function closeTmuxPane(paneId: string): Promise<boolean> {
  const { log } = await import("../logger")

  if (!isInsideTmux()) {
    log("[closeTmuxPane] SKIP: not inside tmux")
    return false
  }

  const tmux = await getTmuxPath()
  if (!tmux) {
    log("[closeTmuxPane] SKIP: tmux not found")
    return false
  }

  log("[closeTmuxPane] killing pane", { paneId })

  const proc = Bun.spawn([tmux, "kill-pane", "-t", paneId], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await proc.exited
  const stderr = await new Response(proc.stderr).text()

  if (exitCode !== 0) {
    log("[closeTmuxPane] FAILED", { paneId, exitCode, stderr: stderr.trim() })
  } else {
    log("[closeTmuxPane] SUCCESS", { paneId })
  }

  return exitCode === 0
}

/**
 * Replaces the content of an existing tmux pane with a new session.
 * @param paneId - Tmux pane to replace
 * @param sessionId - New OpenCode session ID
 * @param description - Human-readable description
 * @param config - Tmux configuration
 * @param serverUrl - OpenCode server URL
 * @returns Result with success status and pane ID
 */
export async function replaceTmuxPane(
  paneId: string,
  sessionId: string,
  description: string,
  config: TmuxConfig,
  serverUrl: string
): Promise<SpawnPaneResult> {
  const { log } = await import("../logger")

  log("[replaceTmuxPane] called", { paneId, sessionId, description })

  if (!config.enabled) {
    return { success: false }
  }
  if (!isInsideTmux()) {
    return { success: false }
  }

  const tmux = await getTmuxPath()
  if (!tmux) {
    return { success: false }
  }

  const opencodeCmd = `opencode attach ${serverUrl} --session ${sessionId}`

  const proc = Bun.spawn([tmux, "respawn-pane", "-k", "-t", paneId, opencodeCmd], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    log("[replaceTmuxPane] FAILED", { paneId, exitCode, stderr: stderr.trim() })
    return { success: false }
  }

  const title = `omo-subagent-${description.slice(0, 20)}`
  Bun.spawn([tmux, "select-pane", "-t", paneId, "-T", title], {
    stdout: "ignore",
    stderr: "ignore",
  })

  log("[replaceTmuxPane] SUCCESS", { paneId, sessionId })
  return { success: true, paneId }
}

/**
 * Applies a tmux window layout with optional main pane sizing.
 * @param tmux - Path to tmux binary
 * @param layout - Layout to apply (even-horizontal, main-vertical, etc.)
 * @param mainPaneSize - Percentage size for main pane
 */
export async function applyLayout(
  tmux: string,
  layout: TmuxLayout,
  mainPaneSize: number
): Promise<void> {
  const layoutProc = Bun.spawn([tmux, "select-layout", layout], { stdout: "ignore", stderr: "ignore" })
  await layoutProc.exited

  if (layout.startsWith("main-")) {
    const dimension =
      layout === "main-horizontal" ? "main-pane-height" : "main-pane-width"
    const sizeProc = Bun.spawn([tmux, "set-window-option", dimension, `${mainPaneSize}%`], {
      stdout: "ignore",
      stderr: "ignore",
    })
    await sizeProc.exited
  }
}

/**
 * Enforces a 50/50 split width for the main tmux pane.
 * @param mainPaneId - Tmux pane to resize
 * @param windowWidth - Total window width
 */
export async function enforceMainPaneWidth(
  mainPaneId: string,
  windowWidth: number
): Promise<void> {
  const { log } = await import("../logger")
  const tmux = await getTmuxPath()
  if (!tmux) return

  const DIVIDER_WIDTH = 1
  const mainWidth = Math.floor((windowWidth - DIVIDER_WIDTH) / 2)

  const proc = Bun.spawn([tmux, "resize-pane", "-t", mainPaneId, "-x", String(mainWidth)], {
    stdout: "ignore",
    stderr: "ignore",
  })
  await proc.exited

  log("[enforceMainPaneWidth] main pane resized", { mainPaneId, mainWidth, windowWidth })
}
