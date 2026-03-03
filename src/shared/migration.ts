/**
 * @module shared/migration
 * 
 * Provides utilities for migrating legacy omo-cli configurations to the current version.
 * This includes migrating old agent names, hook names, and hardcoded model strings 
 * to their newer canonical category-based equivalents. It also provides an in-place
 * migrator for the user's `omo-cli.json` configuration file.
 */

import * as fs from "fs"
import { Effect } from "effect"
import { log } from "./logger"
import type { Record as Rec } from "effect"

/** 
 * Maps legacy agent names to their canonical form. 
 * Acts as the single source of truth for all agent name resolution and normalizes user input.
 */
export const AGENT_NAME_MAP: Record<string, string> = {
  // Orchestrator variants → "orchestrator"
  omo: "orchestrator",
  OmO: "orchestrator",
  Sisyphus: "orchestrator",
  sisyphus: "orchestrator",

  // Planner variants → "planner"
  "OmO-Plan": "planner",
  "omo-plan": "planner",
  "Planner-Sisyphus": "planner",
  "planner-sisyphus": "planner",
  "Prometheus (Planner)": "planner",
  prometheus: "planner",

  // Conductor variants → "conductor"
  "orchestrator-sisyphus": "conductor",
  Atlas: "conductor",
  atlas: "conductor",

  // Consultant variants → "consultant"
  "plan-consultant": "consultant",
  "Metis (Plan Consultant)": "consultant",
  metis: "consultant",

  // Reviewer variants → "reviewer"
  "Momus (Plan Reviewer)": "reviewer",
  momus: "reviewer",

  // Orchestrator-Junior → "worker"
  "Orchestrator-Junior": "worker",
  "sisyphus-junior": "worker",

  // Other legacy → new names
  oracle: "architect",
  librarian: "researcher",
  explore: "explorer",
  "multimodal-looker": "vision",

  // Already new names - passthrough
  build: "build",
  orchestrator: "orchestrator",
  planner: "planner",
  reviewer: "reviewer",
  worker: "worker",
  researcher: "researcher",
  explorer: "explorer",
  vision: "vision",
  architect: "architect",
  conductor: "conductor",
  consultant: "consultant",
}

/** 
 * Set of all officially supported built-in agent canonical names recognized by omo-cli. 
 */
export const BUILTIN_AGENT_NAMES = new Set([
  "orchestrator",
  "architect",
  "researcher",
  "explorer",
  "vision",
  "planner",
  "consultant",
  "conductor",
  "reviewer",
  "worker",
  "build",
])

/** 
 * Maps legacy hook names to their canonical form. 
 * A value of `null` indicates the hook was completely removed in newer versions.
 */
export const HOOK_NAME_MAP: Record<string, string | null> = {
  // Legacy names (backward compatibility)
  "anthropic-auto-compact": "anthropic-context-window-limit-recovery",
  "orchestrator-orchestrator": "conductor",

  // Removed hooks (v3.0.0) - will be filtered out and user warned
  "preemptive-compaction": null,
  "empty-message-sanitizer": null,
}

/**
 * @deprecated LEGACY MIGRATION ONLY
 * 
 * This map exists solely for migrating old configs that used hardcoded model strings.
 * It maps legacy model strings to semantic category names, allowing users to migrate
 * from explicit model configs to category-based configs.
 * 
 * DO NOT add new entries here. New agents should use:
 * - Category-based config (preferred): { category: "unspecified-high" }
 * - Or inherit from OpenCode's config.model
 * 
 * This map will be removed in a future major version once migration period ends.
 */
export const MODEL_TO_CATEGORY_MAP: Record<string, string> = {
  "google/gemini-3-pro": "visual-engineering",
  "google/gemini-3-flash": "writing",
  "openai/gpt-5.2": "ultrabrain",
  "anthropic/claude-haiku-4-5": "quick",
  "anthropic/claude-opus-4-5": "unspecified-high",
  "anthropic/claude-sonnet-4-5": "unspecified-low",
}

/** 
 * Migrates legacy agent name keys within an object to their canonical names using `AGENT_NAME_MAP`. 
 * 
 * @param {Record<string, unknown>} agents - An object map of agent configurations.
 * @returns {{ migrated: Record<string, unknown>; changed: boolean }} The migrated object and a boolean indicating if any changes occurred.
 */
export function migrateAgentNames(agents: Record<string, unknown>): { migrated: Record<string, unknown>; changed: boolean } {
  const migrated: Record<string, unknown> = {}
  let changed = false

  for (const [key, value] of Object.entries(agents)) {
    const newKey = AGENT_NAME_MAP[key.toLowerCase()] ?? AGENT_NAME_MAP[key] ?? key
    if (newKey !== key) {
      changed = true
    }
    migrated[newKey] = value
  }

  return { migrated, changed }
}

/** 
 * Migrates a list of legacy hook names to their canonical names using `HOOK_NAME_MAP`. 
 * Filters out hooks that have been explicitly removed.
 * 
 * @param {string[]} hooks - Array of hook names to migrate.
 * @returns {{ migrated: string[]; changed: boolean; removed: string[] }} The migrated list, deletion records, and boolean changed flag.
 */
export function migrateHookNames(hooks: string[]): { migrated: string[]; changed: boolean; removed: string[] } {
  const migrated: string[] = []
  const removed: string[] = []
  let changed = false

  for (const hook of hooks) {
    const mapping = HOOK_NAME_MAP[hook]

    if (mapping === null) {
      removed.push(hook)
      changed = true
      continue
    }

    const newHook = mapping ?? hook
    if (newHook !== hook) {
      changed = true
    }
    migrated.push(newHook)
  }

  return { migrated, changed, removed }
}

/** 
 * Migrates a legacy agent configuration using hardcoded model strings into a category-based configuration.
 * 
 * @param {Record<string, unknown>} config - The raw agent configuration block.
 * @returns {{ migrated: Record<string, unknown>; changed: boolean }} The updated config block and flag indicating if migrated.
 */
export function migrateAgentConfigToCategory(config: Record<string, unknown>): {
  migrated: Record<string, unknown>
  changed: boolean
} {
  const { model, ...rest } = config
  if (typeof model !== "string") {
    return { migrated: config, changed: false }
  }

  const category = MODEL_TO_CATEGORY_MAP[model]
  if (!category) {
    return { migrated: config, changed: false }
  }

  return {
    migrated: { category, ...rest },
    changed: true,
  }
}

/** 
 * Checks if an agent configuration perfectly matches the default values for its category.
 * If so, the config is redundant and can be omitted.
 * 
 * @param {Record<string, unknown>} config - The custom agent configuration.
 * @param {string} category - The category to compare defaults against.
 * @returns {boolean} `true` if the config can safely be deleted, `false` otherwise.
 */
export function shouldDeleteAgentConfig(
  config: Record<string, unknown>,
  category: string
): boolean {
  // Dynamic import to avoid circular dep with tools/
  const { DEFAULT_CATEGORIES } = require("../tools/delegate-task/constants")
  const defaults = DEFAULT_CATEGORIES[category] as Record<string, unknown> | undefined
  if (!defaults) return false

  const keys = Object.keys(config).filter((k) => k !== "category")
  if (keys.length === 0) return true

  for (const key of keys) {
    if (config[key] !== defaults[key]) {
      return false
    }
  }
  return true
}

/** 
 * Reads a user's config file, migrates it in-place using all available migrators,
 * and creates a backup of the original file if changes were written.
 * 
 * @param {string} configPath - The absolute filesystem path to the `omo-cli.json` or similar config file.
 * @param {Record<string, unknown>} rawConfig - The parsed JSON configuration object.
 * @returns {boolean} `true` if the file was modified and written back, `false` otherwise.
 */
export function migrateConfigFile(configPath: string, rawConfig: Record<string, unknown>): boolean {
  let needsWrite = false

  if (rawConfig.agents && typeof rawConfig.agents === "object") {
    const { migrated, changed } = migrateAgentNames(rawConfig.agents as Record<string, unknown>)
    if (changed) {
      rawConfig.agents = migrated
      needsWrite = true
    }
  }

  if (rawConfig.omo_agent) {
    rawConfig.orchestrator_agent = rawConfig.omo_agent
    delete rawConfig.omo_agent
    needsWrite = true
  }

  if (rawConfig.disabled_agents && Array.isArray(rawConfig.disabled_agents)) {
    const migrated: string[] = []
    let changed = false
    for (const agent of rawConfig.disabled_agents as string[]) {
      const newAgent = AGENT_NAME_MAP[agent.toLowerCase()] ?? AGENT_NAME_MAP[agent] ?? agent
      if (newAgent !== agent) {
        changed = true
      }
      migrated.push(newAgent)
    }
    if (changed) {
      rawConfig.disabled_agents = migrated
      needsWrite = true
    }
  }

  if (rawConfig.disabled_hooks && Array.isArray(rawConfig.disabled_hooks)) {
    const { migrated, changed, removed } = migrateHookNames(rawConfig.disabled_hooks as string[])
    if (changed) {
      rawConfig.disabled_hooks = migrated
      needsWrite = true
    }
    if (removed.length > 0) {
      log(`Removed obsolete hooks from disabled_hooks: ${removed.join(", ")} (these hooks no longer exist in v3.0.0)`)
    }
  }

  if (needsWrite) {
    Effect.runSync(
      Effect.try({
        try: () => {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
          const backupPath = `${configPath}.bak.${timestamp}`
          fs.copyFileSync(configPath, backupPath)

          fs.writeFileSync(configPath, JSON.stringify(rawConfig, null, 2) + "\n", "utf-8")
          log(`Migrated config file: ${configPath} (backup: ${backupPath})`)
        },
        catch: (err) => err,
      }).pipe(Effect.catchAll((err) => {
        log(`Failed to write migrated config to ${configPath}:`, err)
        return Effect.void
      }))
    )
  }

  return needsWrite
}
