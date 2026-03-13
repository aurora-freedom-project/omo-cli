/**
 * @module config/hot-reload
 *
 * Config hot-reload with last-known-good fallback.
 * Inspired by Symphony SPEC §5: "If reload fails, keep running with last known good workflow."
 *
 * Watches omo-cli.json for changes and re-parses on modification.
 * If parsing fails, keeps the last valid config and logs the error.
 */

import { existsSync, watchFile, unwatchFile, readFileSync } from "node:fs"
import { OmoCliConfigSchema, type OmoCliConfig } from "./schema"
import { log } from "../shared"

export interface ConfigWatcherState {
    currentConfig: OmoCliConfig
    configPath: string
    isWatching: boolean
    lastError: string | null
    reloadCount: number
}

let _watcherState: ConfigWatcherState | null = null

/**
 * Start watching omo-cli.json for changes.
 * On change: re-parse → if valid, update config; if invalid, keep last-known-good.
 */
export function startConfigWatcher(
    configPath: string,
    initialConfig: OmoCliConfig,
    onReload?: (newConfig: OmoCliConfig) => void,
): ConfigWatcherState {
    if (_watcherState?.isWatching) {
        stopConfigWatcher()
    }

    const state: ConfigWatcherState = {
        currentConfig: initialConfig,
        configPath,
        isWatching: true,
        lastError: null,
        reloadCount: 0,
    }

    if (!existsSync(configPath)) {
        log("[config-hot-reload] Config file not found, skipping watcher", { configPath })
        state.isWatching = false
        _watcherState = state
        return state
    }

    watchFile(configPath, { interval: 2000 }, () => {
        if (!state.isWatching) return

        try {
            const raw = readFileSync(configPath, "utf-8")
            const parsed = JSON.parse(raw)
            const validated = OmoCliConfigSchema.parse(parsed)

            state.currentConfig = validated
            state.lastError = null
            state.reloadCount++

            log("[config-hot-reload] Config reloaded successfully", {
                path: configPath,
                reloadCount: state.reloadCount,
            })

            onReload?.(validated)
        } catch (error) {
            // Last-known-good fallback: keep current config, log error
            const message = error instanceof Error ? error.message : String(error)
            state.lastError = message

            log("[config-hot-reload] Reload failed, keeping last-known-good config", {
                path: configPath,
                error: message,
                reloadCount: state.reloadCount,
            })
        }
    })

    _watcherState = state
    log("[config-hot-reload] Watcher started", { configPath })
    return state
}

/** Stop watching config file. */
export function stopConfigWatcher(): void {
    if (_watcherState?.isWatching && _watcherState.configPath) {
        unwatchFile(_watcherState.configPath)
        _watcherState.isWatching = false
        log("[config-hot-reload] Watcher stopped")
    }
}

/** Get current watcher state. */
export function getConfigWatcherState(): ConfigWatcherState | null {
    return _watcherState
}

/** Reset for testing. */
export function __resetConfigWatcher(): void {
    stopConfigWatcher()
    _watcherState = null
}
