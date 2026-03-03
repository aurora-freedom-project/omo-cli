import type { LoadedSkill } from "../../features/opencode-skill-loader/types"
import type { SkillMcpManager } from "../../features/skill-mcp-manager"
import type { GitMasterConfig } from "../../config/schema"

/** Arguments for searching skills by query. */
export interface SkillSearchArgs {
  mode: "search"
  query: string
}

/** Arguments for loading a specific skill by name. */
export interface SkillLoadArgs {
  mode: "load"
  name: string
}

/** Discriminated union for skill tool arguments (search or load). */
export type SkillArgs = SkillSearchArgs | SkillLoadArgs

/** Brief information about a skill for search results. */
export interface SkillInfo {
  name: string
  description: string
  location?: string
  score?: number
}

/** Options for the skill tool execution (pre-loaded skills, MCP manager). */
export interface SkillLoadOptions {
  /** Pre-loaded skills to use as the BM25 search index */
  skills?: LoadedSkill[]
  /** MCP manager for querying skill-embedded MCP servers */
  mcpManager?: SkillMcpManager
  /** Session ID getter for MCP client identification */
  getSessionID?: () => string
  /** Git master configuration for watermark/co-author settings */
  gitMasterConfig?: GitMasterConfig
}
