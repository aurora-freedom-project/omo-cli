import { spawn } from "child_process"

let tmuxPath: string | null = null
let initPromise: Promise<string | null> | null = null

// Exported for testing only
export function __resetCache() {
  tmuxPath = null
  initPromise = null
}

async function findTmuxPath(): Promise<string | null> {
  const isWindows = process.platform === "win32"
  const cmd = isWindows ? "where" : "which"

  return new Promise((resolve) => {
    let stdoutData = ""
    try {
      const proc = spawn(cmd, ["tmux"], {
        stdio: ["ignore", "pipe", "ignore"],
      })

      if (proc.stdout) {
        proc.stdout.on("data", (data) => {
          stdoutData += data.toString()
        })
      }

      proc.on("close", (code) => {
        if (code !== 0) {
          resolve(null)
          return
        }

        const path = stdoutData.trim().split("\n")[0]
        if (!path) {
          resolve(null)
          return
        }

        const verifyProc = spawn(path, ["-V"], {
          stdio: ["ignore", "ignore", "ignore"],
        })

        verifyProc.on("close", (verifyCode) => {
          if (verifyCode !== 0) {
            resolve(null)
            return
          }
          resolve(path)
        })

        verifyProc.on("error", () => resolve(null))
      })

      proc.on("error", () => resolve(null))
    } catch {
      resolve(null)
    }
  })
}

export async function getTmuxPath(): Promise<string | null> {
  if (tmuxPath !== null) {
    return tmuxPath
  }

  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    const path = await findTmuxPath()
    tmuxPath = path
    return path
  })()

  return initPromise
}

export function getCachedTmuxPath(): string | null {
  return tmuxPath
}

export function startBackgroundCheck(): void {
  if (!initPromise) {
    initPromise = getTmuxPath()
    initPromise.catch(() => { })
  }
}
