// Shared logging utility for the plugin

import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const logFile = path.join(os.tmpdir(), "omo-cli.log")
const MAX_LOG_SIZE_BYTES = 100 * 1024 * 1024  // 100MB

// Dedup state: suppress identical messages within a short window
const _dedup = (() => {
  let message = ""
  let time = 0
  let count = 0
  return {
    get: () => ({ message, time, count }),
    set: (m: string, t: number) => { message = m; time = t; count = 0 },
    increment: () => { count++ },
    resetCount: () => { const c = count; count = 0; return c },
  }
})()
const DEDUP_WINDOW_MS = 2000

export function log(message: string, data?: unknown): void {
  try {
    const now = Date.now()
    const key = `${message}${data ? JSON.stringify(data) : ""}`
    const { message: lastMsg, time: lastTime, count: lastCount } = _dedup.get()

    // Dedup: suppress identical messages within 2s
    if (key === lastMsg && now - lastTime < DEDUP_WINDOW_MS) {
      _dedup.increment()
      return
    }

    // Flush dedup count if we had suppressed messages
    let flushEntry = ""
    if (lastCount > 0) {
      flushEntry = `[${new Date().toISOString()}] (repeated ${lastCount} more times)\n`
    }

    _dedup.set(key, now)

    // Rotate if too large
    try {
      const stats = fs.statSync(logFile)
      if (stats.size > MAX_LOG_SIZE_BYTES) {
        const backupFile = logFile + ".old"
        try { fs.unlinkSync(backupFile) } catch { }
        fs.renameSync(logFile, backupFile)
      }
    } catch { }

    const timestamp = new Date().toISOString()
    const logEntry = `${flushEntry}[${timestamp}] ${message} ${data ? JSON.stringify(data) : ""}\n`
    fs.appendFileSync(logFile, logEntry)
  } catch {
  }
}

export function getLogFilePath(): string {
  return logFile
}
