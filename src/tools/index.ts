import {
  lsp_goto_definition,
  lsp_find_references,
  lsp_symbols,
  lsp_diagnostics,
  lsp_prepare_rename,
  lsp_rename,
  lspManager,
} from "./lsp"

export { lspManager }

import {
  ast_grep_search,
  ast_grep_replace,
} from "./ast-grep"

export { createSlashcommandTool, discoverCommandsSync } from "./slashcommand"

import {
  session_list,
  session_read,
  session_search,
  session_info,
} from "./session-manager"

export { sessionExists } from "./session-manager/storage"

export { interactive_bash, startBackgroundCheck as startTmuxCheck } from "./interactive-bash"
export { createSkillTool } from "./skill"
export { createSkillMcpTool } from "./skill-mcp"

import {
  createBackgroundOutput,
  createBackgroundCancel,
} from "./background-task"

import {
  pattern_scan,
  input_guard_test,
  createPromptTest,
  vulnerability_triage,
  fingerprint_stats,
} from "./security"

import {
  dns_resolve,
  port_check,
  tls_inspect,
  web_crawl,
} from "./network"

import { createSandboxExec, type SandboxConfig } from "./sandbox"
import { createFactExtractor } from "./fact-extractor"
import { createGitWorktreeTools } from "./git-worktree"

import type { PluginInput, ToolDefinition } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../features/background-agent"

type OpencodeClient = PluginInput["client"]

export { createCallOmoAgent } from "./call-omo-agent"
export { createLookAt } from "./look-at"
export { createDelegateTask } from "./delegate-task"

export function createBackgroundTools(manager: BackgroundManager, client: OpencodeClient): Record<string, ToolDefinition> {
  return {
    background_output: createBackgroundOutput(manager, client),
    background_cancel: createBackgroundCancel(manager, client),
  }
}

/** Create security tools that require runtime configuration. */
export function createSecurityTools(ollamaUrl?: string): Record<string, ToolDefinition> {
  return {
    prompt_test: createPromptTest(ollamaUrl),
    fact_extract: createFactExtractor(ollamaUrl),
  }
}

/** Create network security tools. */
export function createNetworkTools(): Record<string, ToolDefinition> {
  return { dns_resolve, port_check, tls_inspect, web_crawl }
}

/** Create sandbox execution tool. */
export function createSandboxTools(config?: Partial<SandboxConfig>): Record<string, ToolDefinition> {
  return { sandbox_exec: createSandboxExec(config) }
}

/** Create git worktree isolation tools. */
export { createGitWorktreeTools }

export const builtinTools: Record<string, ToolDefinition> = {
  lsp_goto_definition,
  lsp_find_references,
  lsp_symbols,
  lsp_diagnostics,
  lsp_prepare_rename,
  lsp_rename,
  ast_grep_search,
  ast_grep_replace,
  session_list,
  session_read,
  session_search,
  session_info,
  // Security tools (ported from Omni, enhanced with Vuln Fingerprint DB)
  pattern_scan,
  input_guard_test,
  vulnerability_triage,
  fingerprint_stats,
  // Network security tools (ported from Omni)
  dns_resolve,
  port_check,
  tls_inspect,
  web_crawl,
}

