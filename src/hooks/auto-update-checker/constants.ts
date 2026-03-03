import * as path from "node:path"
import * as os from "node:os"
import * as fs from "node:fs"
import { getOpenCodeConfigDir } from "../../shared"

/** NPM package name for auto-update checks. */
export const PACKAGE_NAME = "omo-cli"
/** URL to fetch latest version info from npm registry. */
export const NPM_REGISTRY_URL = `https://registry.npmjs.org/-/package/${PACKAGE_NAME}/dist-tags`
/** Timeout for npm registry fetch requests (ms). */
export const NPM_FETCH_TIMEOUT = 5000

function getCacheDir(): string {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? os.homedir(), "opencode")
  }
  return path.join(os.homedir(), ".cache", "opencode")
}

/** Directory for caching update check data. */
export const CACHE_DIR = getCacheDir()
/** Path to the cached latest version file. */
export const VERSION_FILE = path.join(CACHE_DIR, "version")
/** Path to the installed package.json for version comparison. */
export const INSTALLED_PACKAGE_JSON = path.join(
  CACHE_DIR,
  "node_modules",
  PACKAGE_NAME,
  "package.json"
)

/** Gets the Windows APPDATA directory for config storage. */
export function getWindowsAppdataDir(): string | null {
  if (process.platform !== "win32") return null
  return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming")
}

/** User-level configuration directory for OpenCode. */
export const USER_CONFIG_DIR = getOpenCodeConfigDir({ binary: "opencode" })
/** Path to the user's opencode.json config file. */
export const USER_OPENCODE_CONFIG = path.join(USER_CONFIG_DIR, "opencode.json")
/** Path to the user's opencode.jsonc config file. */
export const USER_OPENCODE_CONFIG_JSONC = path.join(USER_CONFIG_DIR, "opencode.jsonc")
