// Shared logging utility for the plugin

import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const logFile = path.join(os.tmpdir(), "omo-cli.log")

// ─── Runtime Configuration ──────────────────────────────────────────────────
// Controlled via omo-cli.json → "logging.file_logging" and "logging.max_log_size_mb".
// Defaults: file_logging = false, max_log_size_mb = 10.
// Call configureLogger() from plugin init to apply config values.

let _fileLoggingEnabled = false
let _maxLogSizeBytes = 10 * 1024 * 1024  // 10MB default

/** Configure logger at runtime from omo-cli.json values. */
export function configureLogger(options: {
  fileLogging?: boolean
  maxLogSizeMb?: number
}): void {
  if (options.fileLogging !== undefined) _fileLoggingEnabled = options.fileLogging
  if (options.maxLogSizeMb !== undefined) _maxLogSizeBytes = options.maxLogSizeMb * 1024 * 1024
}

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
  if (!_fileLoggingEnabled) return

  try {
    const now = Date.now()
    const key = `${message}${data ? JSON.stringify(data) : ""}`
    const { message: lastMsg, time: lastTime, count: lastCount } = _dedup.get()

    if (key === lastMsg && now - lastTime < DEDUP_WINDOW_MS) {
      _dedup.increment()
      return
    }

    let flushEntry = ""
    if (lastCount > 0) {
      flushEntry = `[${new Date().toISOString()}] (repeated ${lastCount} more times)\n`
    }

    _dedup.set(key, now)

    try {
      const stats = fs.statSync(logFile)
      if (stats.size > _maxLogSizeBytes) {
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
