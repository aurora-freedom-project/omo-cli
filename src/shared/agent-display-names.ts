/**
 * Legacy → new agent name mapping.
 * Used to normalize old config keys to new native-friendly names.
 */
export const AGENT_NAME_MAP: Record<string, string> = {
  sisyphus: "orchestrator",
  "sisyphus-junior": "worker",
  "OpenCode-Builder": "builder",
  prometheus: "coder",
  metis: "planner",
  momus: "reviewer",
  oracle: "advisor",
  librarian: "researcher",
  explore: "explorer",
  "multimodal-looker": "vision",
  atlas: "navigator",
}

/** Reverse map: new name → legacy name (for backwards compat lookups) */
export const AGENT_NAME_REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(AGENT_NAME_MAP).map(([old, newName]) => [newName, old])
)

/**
 * Normalize agent name: if legacy, return new name. Otherwise return as-is.
 */
export function normalizeAgentName(name: string): string {
  return AGENT_NAME_MAP[name] ?? name
}

/**
 * Agent config keys to display names mapping.
 * Uses new native-friendly names as primary keys.
 */
export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  // New names
  orchestrator: "Orchestrator (Ultraworker)",
  navigator: "Navigator (Plan Execution)",
  coder: "Coder (Deep Implementation)",
  worker: "Worker (Task Executor)",
  planner: "Planner (Analysis & Strategy)",
  reviewer: "Reviewer (Code Quality)",
  advisor: "Advisor (Architecture)",
  researcher: "Researcher (Documentation & Search)",
  explorer: "Explorer (Fast Read-only Scan)",
  vision: "Vision (Multimodal Analysis)",
  builder: "Builder (Default Build Agent)",
  // Legacy fallbacks
  sisyphus: "Orchestrator (Ultraworker)",
  atlas: "Navigator (Plan Execution)",
  prometheus: "Coder (Deep Implementation)",
  "sisyphus-junior": "Worker (Task Executor)",
  metis: "Planner (Analysis & Strategy)",
  momus: "Reviewer (Code Quality)",
  oracle: "Advisor (Architecture)",
  librarian: "Researcher (Documentation & Search)",
  explore: "Explorer (Fast Read-only Scan)",
  "multimodal-looker": "Vision (Multimodal Analysis)",
}

/**
 * Get display name for an agent config key.
 * Uses case-insensitive lookup for backward compatibility.
 * Returns original key if not found.
 */
export function getAgentDisplayName(configKey: string): string {
  // Normalize legacy name first
  const normalized = normalizeAgentName(configKey)

  // Try exact match
  const exactMatch = AGENT_DISPLAY_NAMES[normalized]
  if (exactMatch !== undefined) return exactMatch

  // Fall back to case-insensitive search
  const lowerKey = normalized.toLowerCase()
  for (const [k, v] of Object.entries(AGENT_DISPLAY_NAMES)) {
    if (k.toLowerCase() === lowerKey) return v
  }

  // Unknown agent: return original key
  return configKey
}