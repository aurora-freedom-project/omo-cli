import { join } from "node:path"
import { getOpenCodeStorageDir } from "../../shared/data-path"

/** Root storage directory for OpenCode recovery data. */
export const OPENCODE_STORAGE = getOpenCodeStorageDir()
/** Directory for session message recovery files. */
export const MESSAGE_STORAGE = join(OPENCODE_STORAGE, "message")
/** Directory for session part recovery files. */
export const PART_STORAGE = join(OPENCODE_STORAGE, "part")

/** Part types classified as thinking/reasoning (excluded from recovery). */
export const THINKING_TYPES = new Set(["thinking", "redacted_thinking", "reasoning"])
/** Part types classified as metadata (step markers). */
export const META_TYPES = new Set(["step-start", "step-finish"])
/** Part types classified as user-visible content. */
export const CONTENT_TYPES = new Set(["text", "tool", "tool_use", "tool_result"])
