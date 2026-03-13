/**
 * @module shared/prompt-text
 *
 * Shared utilities for extracting and cleaning prompt text.
 * Consolidates code previously duplicated across 4+ hook detectors.
 */

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g
const INLINE_CODE_PATTERN = /`[^`]+`/g

/**
 * Strips fenced code blocks AND inline code from text.
 * Used before keyword detection to avoid matching code content.
 */
export function removeCodeBlocks(text: string): string {
    return text.replace(CODE_BLOCK_PATTERN, "").replace(INLINE_CODE_PATTERN, "")
}

/**
 * Strips only fenced code blocks (not inline code) from text.
 * Used by auto-slash-command where inline code stripping isn't needed.
 */
export function removeFencedCodeBlocks(text: string): string {
    return text.replace(CODE_BLOCK_PATTERN, "")
}

/**
 * Extract text content from message parts array.
 * Filters to text-type parts and joins their text values.
 *
 * @param parts - Array of content parts with type and optional text
 * @param separator - Join separator (default: " ").
 *   - think-mode uses "" (empty) for tight concatenation
 *   - keyword-detector / auto-slash-command use " " for word boundary detection
 */
export function extractPromptText(
    parts: ReadonlyArray<{ type: string; text?: string }>,
    separator = " "
): string {
    if (!parts || !Array.isArray(parts)) return ""
    return parts
        .filter((p) => p.type === "text")
        .map((p) => p.text || "")
        .join(separator)
}
