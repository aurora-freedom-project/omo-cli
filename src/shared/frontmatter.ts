import yaml from "js-yaml"
import { Effect } from "effect"

export interface FrontmatterResult<T = Record<string, unknown>> {
  data: T
  body: string
  hadFrontmatter: boolean
  parseError: boolean
}

export function parseFrontmatter<T = Record<string, unknown>>(
  content: string
): FrontmatterResult<T> {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { data: {} as T, body: content, hadFrontmatter: false, parseError: false }
  }

  const yamlContent = match[1]
  const body = match[2]

  try {
    // Use JSON_SCHEMA for security - prevents code execution via YAML tags
    const parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA })
    const data = (parsed ?? {}) as T
    return { data, body, hadFrontmatter: true, parseError: false }
  } catch {
    return { data: {} as T, body, hadFrontmatter: true, parseError: true }
  }
}

/**
 * Parses markdown with YAML frontmatter, returning an Effect.
 * Errors during YAML parsing are captured in the `parseError` flag, not as an Effect failure,
 * ensuring the content body is always recoverable.
 */
export const parseFrontmatterEffect = <T = Record<string, unknown>>(
  content: string
): Effect.Effect<FrontmatterResult<T>, never> =>
  Effect.sync(() => parseFrontmatter<T>(content))
