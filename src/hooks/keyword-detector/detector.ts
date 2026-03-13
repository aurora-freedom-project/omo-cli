import { KEYWORD_DETECTORS } from "./constants"
import { removeCodeBlocks, extractPromptText } from "../../shared/prompt-text"

export { removeCodeBlocks, extractPromptText }

export interface DetectedKeyword {
  type: "ultrawork" | "search" | "analyze"
  message: string
}

/**
 * Resolves message to string, handling both static strings and dynamic functions.
 */
function resolveMessage(
  message: string | ((agentName?: string) => string),
  agentName?: string
): string {
  return typeof message === "function" ? message(agentName) : message
}

export function detectKeywords(text: string, agentName?: string): string[] {
  const textWithoutCode = removeCodeBlocks(text)
  return KEYWORD_DETECTORS.filter(({ pattern }) =>
    pattern.test(textWithoutCode)
  ).map(({ message }) => resolveMessage(message, agentName))
}

export function detectKeywordsWithType(text: string, agentName?: string): DetectedKeyword[] {
  const textWithoutCode = removeCodeBlocks(text)
  const types: Array<"ultrawork" | "search" | "analyze"> = ["ultrawork", "search", "analyze"]
  return KEYWORD_DETECTORS.map(({ pattern, message }, index) => ({
    matches: pattern.test(textWithoutCode),
    type: types[index],
    message: resolveMessage(message, agentName),
  }))
    .filter((result) => result.matches)
    .map(({ type, message }) => ({ type, message }))
}

