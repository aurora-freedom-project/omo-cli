import {
  SLASH_COMMAND_PATTERN,
  EXCLUDED_COMMANDS,
} from "./constants"
import type { ParsedSlashCommand } from "./types"
import { removeFencedCodeBlocks, extractPromptText } from "../../shared/prompt-text"

export { extractPromptText }

/** Re-export removeFencedCodeBlocks as removeCodeBlocks for backward compat. */
export function removeCodeBlocks(text: string): string {
  return removeFencedCodeBlocks(text)
}

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const trimmed = text.trim()

  if (!trimmed.startsWith("/")) {
    return null
  }

  const match = trimmed.match(SLASH_COMMAND_PATTERN)
  if (!match) {
    return null
  }

  const [raw, command, args] = match
  return {
    command: command.toLowerCase(),
    args: args.trim(),
    raw,
  }
}

export function isExcludedCommand(command: string): boolean {
  return EXCLUDED_COMMANDS.has(command.toLowerCase())
}

export function detectSlashCommand(text: string): ParsedSlashCommand | null {
  const textWithoutCodeBlocks = removeCodeBlocks(text)
  const trimmed = textWithoutCodeBlocks.trim()

  if (!trimmed.startsWith("/")) {
    return null
  }

  const parsed = parseSlashCommand(trimmed)

  if (!parsed) {
    return null
  }

  if (isExcludedCommand(parsed.command)) {
    return null
  }

  return parsed
}

