import type { CommandDefinition } from "../claude-code-command-loader/types"
import type { SkillMcpConfig } from "../skill-mcp-manager/types"

// Skill scopes:
// - agent: ~/.agents/skills/ (native OpenCode path, falls back to ~/.agent/skills/)
// - user: ~/.claude/skills/ (Claude Code user-level)
// - project: ./.claude/skills/ (Claude Code project-level)
// - opencode: ~/.config/opencode/skills/ (OpenCode user-level)
// - opencode-project: ./.opencode/skills/ (OpenCode project-level)
export type SkillScope = "builtin" | "config" | "user" | "project" | "opencode" | "opencode-project" | "agent"

export interface SkillMetadata {
  name?: string
  description?: string
  model?: string
  "argument-hint"?: string
  agent?: string
  subtask?: boolean
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  "allowed-tools"?: string | string[]
  mcp?: SkillMcpConfig
}

export interface LazyContentLoader {
  loaded: boolean
  content?: string
  load: () => Promise<string>
}

export interface LoadedSkill {
  name: string
  path?: string
  resolvedPath?: string
  definition: CommandDefinition
  scope: SkillScope
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  allowedTools?: string[]
  mcpConfig?: SkillMcpConfig
  lazyContent?: LazyContentLoader
}
