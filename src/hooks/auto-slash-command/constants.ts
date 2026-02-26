export const HOOK_NAME = "auto-slash-command" as const

export const AUTO_SLASH_COMMAND_TAG_OPEN = "<auto-slash-command>"
export const AUTO_SLASH_COMMAND_TAG_CLOSE = "</auto-slash-command>"

export const SLASH_COMMAND_PATTERN = /^\/([a-zA-Z][\w:.-]*)\s*(.*)/

/**
 * Prefix-to-skill mapping. Commands starting with these prefixes
 * are routed to the corresponding builtin skill.
 */
export const PREFIX_SKILL_MAP: Record<string, string> = {
  "opsx:": "openspec-workflow",
}

export const EXCLUDED_COMMANDS = new Set([
  "ralph-loop",
  "cancel-ralph",
  "ulw-loop",
])
