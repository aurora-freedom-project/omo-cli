/**
 * Parses a comma-separated tools string into a boolean record.
 * Used by both agent-loader and plugin-loader to configure tool availability.
 *
 * @example parseToolsConfig("Read,Write,Bash") → { read: true, write: true, bash: true }
 */
export function parseToolsConfig(toolsStr?: string): Record<string, boolean> | undefined {
    if (!toolsStr) return undefined

    const tools = toolsStr.split(",").map((t) => t.trim()).filter(Boolean)
    if (tools.length === 0) return undefined

    const result: Record<string, boolean> = {}
    for (const tool of tools) {
        result[tool.toLowerCase()] = true
    }
    return result
}
