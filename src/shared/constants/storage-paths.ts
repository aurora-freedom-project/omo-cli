/**
 * @module shared/constants/storage-paths
 * 
 * Storage path constants shared across modules.
 * Extracted from features/hook-message-injector/constants.ts to break circular dependency.
 */

import { join } from "node:path"
import { getOpenCodeStorageDir } from "../data-path"

export const OPENCODE_STORAGE = getOpenCodeStorageDir()
export const MESSAGE_STORAGE = join(OPENCODE_STORAGE, "message")
export const PART_STORAGE = join(OPENCODE_STORAGE, "part")
