/**
 * AgentQL MCP — Web data extraction query language.
 *
 * Source: https://github.com/tinyfish-io (AgentQL 1.3k★)
 * Feature #26 from the 27-feature integration plan.
 *
 * Provides natural-language web scraping via `extract-web-data` tool.
 * Requires AGENTQL_API_KEY environment variable.
 */

export const agentql = {
  type: "remote" as const,
  url: "https://mcp.agentql.com/v1/mcp",
  enabled: true,
  headers: process.env.AGENTQL_API_KEY
    ? { Authorization: `Bearer ${process.env.AGENTQL_API_KEY}` }
    : undefined,
  // AgentQL uses API key auth, not OAuth
  oauth: false as const,
}
