import { spawn } from "bun"
import { createLazyResolver } from "../shared/lazy-init"

type Platform = "darwin" | "linux" | "win32" | "unsupported"

const _notifySend = createLazyResolver(() => findCommand("notify-send"))
const _osascript = createLazyResolver(() => findCommand("osascript"))
const _powershell = createLazyResolver(() => findCommand("powershell"))
const _afplay = createLazyResolver(() => findCommand("afplay"))
const _paplay = createLazyResolver(() => findCommand("paplay"))
const _aplay = createLazyResolver(() => findCommand("aplay"))

async function findCommand(commandName: string): Promise<string | null> {
  const isWindows = process.platform === "win32"
  const cmd = isWindows ? "where" : "which"

  try {
    const proc = spawn([cmd, commandName], {
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      return null
    }

    const stdout = await new Response(proc.stdout).text()
    const path = stdout.trim().split("\n")[0]

    if (!path) {
      return null
    }

    return path
  } catch {
    return null
  }
}

export async function getNotifySendPath(): Promise<string | null> {
  return _notifySend.get()
}

export async function getOsascriptPath(): Promise<string | null> {
  return _osascript.get()
}

export async function getPowershellPath(): Promise<string | null> {
  return _powershell.get()
}

export async function getAfplayPath(): Promise<string | null> {
  return _afplay.get()
}

export async function getPaplayPath(): Promise<string | null> {
  return _paplay.get()
}

export async function getAplayPath(): Promise<string | null> {
  return _aplay.get()
}

export function startBackgroundCheck(platform: Platform): void {
  if (platform === "darwin") {
    _osascript.startBackgroundInit()
    _afplay.startBackgroundInit()
  } else if (platform === "linux") {
    _notifySend.startBackgroundInit()
    _paplay.startBackgroundInit()
    _aplay.startBackgroundInit()
  } else if (platform === "win32") {
    _powershell.startBackgroundInit()
  }
}
