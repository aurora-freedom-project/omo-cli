/**
 * Legacy → new agent name mapping.
 * Used to normalize old config keys to new native-friendly names.
 */
export const AGENT_NAME_MAP: Record<string, string> = {
  sisyphus: "orchestrator",
  "sisyphus-junior": "worker",
  "OpenCode-Builder": "builder",
  prometheus: "planner",
  metis: "consultant",
  momus: "reviewer",
  oracle: "architect",
  librarian: "researcher",
  explore: "explorer",
  "multimodal-looker": "vision",
  atlas: "conductor",
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
  orchestrator: "Orchestrator",
  conductor: "Conductor",
  planner: "Planner",
  consultant: "Consultant",
  reviewer: "Reviewer",
  architect: "Architect",
  worker: "Worker",
  vision: "Vision",
  explorer: "Explorer",
  researcher: "Researcher",
  coder: "Coder",
  builder: "Builder",

  // Legacy fallbacks
  sisyphus: "Orchestrator",
  atlas: "Conductor",
  prometheus: "Planner",
  "sisyphus-junior": "Worker",
  metis: "Consultant",
  momus: "Reviewer",
  oracle: "Architect",
  librarian: "Researcher",
  explore: "Explorer",
  "multimodal-looker": "Vision",
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