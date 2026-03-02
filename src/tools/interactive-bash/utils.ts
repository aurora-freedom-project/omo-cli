import { spawn } from "child_process"
import { createLazyResolver } from "../../shared/lazy-init"

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

const _resolver = createLazyResolver(findTmuxPath)

export async function getTmuxPath(): Promise<string | null> {
  return _resolver.get()
}

export function getCachedTmuxPath(): string | null {
  return _resolver.getCached()
}

export function startBackgroundCheck(): void {
  _resolver.startBackgroundInit()
}

// Exported for testing only
export function __resetCache() {
  _resolver.reset()
}
