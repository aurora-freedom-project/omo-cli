import { spawn, spawnSync } from "child_process"
import { release } from "os"
import { promisify } from "util"

const WINDOWS_BUILD_WITH_TAR = 17134

function getWindowsBuildNumber(): number | null {
  if (process.platform !== "win32") return null

  const parts = release().split(".")
  if (parts.length >= 3) {
    const build = parseInt(parts[2], 10)
    if (!isNaN(build)) return build
  }
  return null
}

function isPwshAvailable(): boolean {
  if (process.platform !== "win32") return false
  const result = spawnSync("where", ["pwsh"], { stdio: ["ignore", "pipe", "pipe"] })
  return result.status === 0
}

function escapePowerShellPath(path: string): string {
  return path.replace(/'/g, "''")
}

type WindowsZipExtractor = "tar" | "pwsh" | "powershell"

function getWindowsZipExtractor(): WindowsZipExtractor {
  const buildNumber = getWindowsBuildNumber()

  if (buildNumber !== null && buildNumber >= WINDOWS_BUILD_WITH_TAR) {
    return "tar"
  }

  if (isPwshAvailable()) {
    return "pwsh"
  }

  return "powershell"
}

export async function extractZip(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let proc

    if (process.platform === "win32") {
      const extractor = getWindowsZipExtractor()

      switch (extractor) {
        case "tar":
          proc = spawn("tar", ["-xf", archivePath, "-C", destDir], {
            stdio: ["ignore", "ignore", "pipe"],
          })
          break
        case "pwsh":
          proc = spawn("pwsh", ["-Command", `Expand-Archive -Path '${escapePowerShellPath(archivePath)}' -DestinationPath '${escapePowerShellPath(destDir)}' -Force`], {
            stdio: ["ignore", "ignore", "pipe"],
          })
          break
        case "powershell":
        default:
          proc = spawn("powershell", ["-Command", `Expand-Archive -Path '${escapePowerShellPath(archivePath)}' -DestinationPath '${escapePowerShellPath(destDir)}' -Force`], {
            stdio: ["ignore", "ignore", "pipe"],
          })
          break
      }
    } else {
      proc = spawn("unzip", ["-o", archivePath, "-d", destDir], {
        stdio: ["ignore", "ignore", "pipe"],
      })
    }

    let stderrData = ""
    if (proc.stderr) {
      proc.stderr.on("data", (data) => {
        stderrData += data.toString()
      })
    }

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`zip extraction failed (exit ${code}): ${stderrData}`))
      } else {
        resolve()
      }
    })

    proc.on("error", (err) => {
      reject(new Error(`zip extraction child process error: ${err.message}`))
    })
  })
}
