/**
 * @module shared/prompt-text
 * 
 * Shared utility for extracting text from prompt content parts.
 * Consolidates 3 duplicate definitions from hooks.
 */

/**
 * Extract text content from message parts array.
 * Filters to text-type parts and joins their text values.
 * 
 * @param parts - Array of content parts with type and optional text
 * @param separator - Join separator (default: " ")
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
