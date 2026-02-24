/**
 * Contains constants and utilities for generating AI system directives.
 *
 * System directives are special commands injected into the conversation context
 * Format: [SYSTEM DIRECTIVE: OMO-CLI - {TYPE}]
 */

export const SYSTEM_DIRECTIVE_PREFIX = "[SYSTEM DIRECTIVE: OMO-CLI"

/**
 * Format a system directive
 * @param type The type of directive (e.g. "TODO CONTINUATION")
 * @returns Formatted directive string like "[SYSTEM DIRECTIVE: OMO-CLI - TODO CONTINUATION]"
 */
export function formatSystemDirective(type: string): string {
  return `${SYSTEM_DIRECTIVE_PREFIX} - ${type}]`
}

/**
 * Checks if a message starts with the omo-cli system directive prefix.
 * Used by keyword-detector and other hooks to skip system-generated messages.
 * @param text - The message text to check
 * @returns true if the message is a system directive
 */
export function isSystemDirective(text: string): boolean {
  return text.trimStart().startsWith(SYSTEM_DIRECTIVE_PREFIX)
}

/**
 * Checks if a message contains system-generated content that should be excluded
 * from keyword detection and mode triggering.
 * @param text - The message text to check
 * @returns true if the message contains system-reminder tags
 */
export function hasSystemReminder(text: string): boolean {
  return /<system-reminder>[\s\S]*?<\/system-reminder>/i.test(text)
}

/**
 * Removes system-reminder tag content from text.
 * This prevents automated system messages from triggering mode keywords.
 * @param text - The message text to clean
 * @returns text with system-reminder content removed
 */
export function removeSystemReminders(text: string): string {
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "").trim()
}

export const SystemDirectiveTypes = {
  TODO_CONTINUATION: "TODO CONTINUATION",
  RALPH_LOOP: "RALPH LOOP",
  BOULDER_CONTINUATION: "BOULDER CONTINUATION",
  DELEGATION_REQUIRED: "DELEGATION REQUIRED",
  SINGLE_TASK_ONLY: "SINGLE TASK ONLY",
  COMPACTION_CONTEXT: "COMPACTION CONTEXT",
  CONTEXT_WINDOW_MONITOR: "CONTEXT WINDOW MONITOR",
  PROMETHEUS_READ_ONLY: "PROMETHEUS READ-ONLY",
} as const

export type SystemDirectiveType = (typeof SystemDirectiveTypes)[keyof typeof SystemDirectiveTypes]
