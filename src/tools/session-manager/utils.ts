import type { SessionInfo, SessionMessage, SearchResult } from "./types"
import { getSessionInfo, readSessionMessages } from "./storage"

/**
 * Formats a list of session IDs into a table with metadata.
 * @param sessionIDs - Array of session IDs to format
 * @returns Formatted markdown table string
 */
export async function formatSessionList(sessionIDs: string[]): Promise<string> {
  if (sessionIDs.length === 0) {
    return "No sessions found."
  }

  const infos = (await Promise.all(sessionIDs.map((id) => getSessionInfo(id)))).filter(
    (info): info is SessionInfo => info !== null
  )

  if (infos.length === 0) {
    return "No valid sessions found."
  }

  const headers = ["Session ID", "Messages", "First", "Last", "Agents"]
  const rows = infos.map((info) => [
    info.id,
    info.message_count.toString(),
    info.first_message?.toISOString().split("T")[0] ?? "N/A",
    info.last_message?.toISOString().split("T")[0] ?? "N/A",
    info.agents_used.join(", ") || "none",
  ])

  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))

  const formatRow = (cells: string[]): string => {
    return (
      "| " +
      cells
        .map((cell, i) => cell.padEnd(colWidths[i]))
        .join(" | ")
        .trim() +
      " |"
    )
  }

  const separator = "|" + colWidths.map((w) => "-".repeat(w + 2)).join("|") + "|"

  return [formatRow(headers), separator, ...rows.map(formatRow)].join("\n")
}

/**
 * Formats session messages into a readable text output.
 * @param messages - Array of session messages to format
 * @param includeTodos - Whether to append todo list
 * @param todos - Optional todo items to include
 * @returns Formatted text showing message timeline
 */
export function formatSessionMessages(
  messages: SessionMessage[],
  includeTodos?: boolean,
  todos?: Array<{ id: string; content: string; status: string }>
): string {
  if (messages.length === 0) {
    return "No messages found in this session."
  }

  const lines: string[] = []

  for (const msg of messages) {
    const timestamp = msg.time?.created ? new Date(msg.time.created).toISOString() : "Unknown time"
    const agent = msg.agent ? ` (${msg.agent})` : ""
    lines.push(`\n[${msg.role}${agent}] ${timestamp}`)

    for (const part of msg.parts) {
      if (part.type === "text" && part.text) {
        lines.push(part.text.trim())
      } else if (part.type === "thinking" && part.thinking) {
        lines.push(`[thinking] ${part.thinking.substring(0, 200)}...`)
      } else if ((part.type === "tool_use" || part.type === "tool") && part.tool) {
        const input = part.input ? JSON.stringify(part.input).substring(0, 100) : ""
        lines.push(`[tool: ${part.tool}] ${input}`)
      } else if (part.type === "tool_result") {
        const output = part.output ? part.output.substring(0, 200) : ""
        lines.push(`[tool result] ${output}...`)
      }
    }
  }

  if (includeTodos && todos && todos.length > 0) {
    lines.push("\n\n=== Todos ===")
    for (const todo of todos) {
      const status = todo.status === "completed" ? "[x]" : todo.status === "in_progress" ? "[-]" : "[ ]"
      lines.push(`${status} [${todo.status}] ${todo.content}`)
    }
  }

  return lines.join("\n")
}

/**
 * Formats session metadata into a human-readable summary.
 * @param info - Session info object with stats
 * @returns Multi-line string with session details
 */
export function formatSessionInfo(info: SessionInfo): string {
  const lines = [
    `Session ID: ${info.id}`,
    `Messages: ${info.message_count}`,
    `Date Range: ${info.first_message?.toISOString() ?? "N/A"} to ${info.last_message?.toISOString() ?? "N/A"}`,
    `Agents Used: ${info.agents_used.join(", ") || "none"}`,
    `Has Todos: ${info.has_todos ? `Yes (${info.todos?.length ?? 0} items)` : "No"}`,
    `Has Transcript: ${info.has_transcript ? `Yes (${info.transcript_entries} entries)` : "No"}`,
  ]

  if (info.first_message && info.last_message) {
    const duration = info.last_message.getTime() - info.first_message.getTime()
    const days = Math.floor(duration / (1000 * 60 * 60 * 24))
    const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    if (days > 0 || hours > 0) {
      lines.push(`Duration: ${days} days, ${hours} hours`)
    }
  }

  return lines.join("\n")
}

/**
 * Formats search results into a readable list with excerpts.
 * @param results - Array of search results
 * @returns Formatted string with match counts and excerpts
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No matches found."
  }

  const lines: string[] = [`Found ${results.length} matches:\n`]

  for (const result of results) {
    const timestamp = result.timestamp ? new Date(result.timestamp).toISOString() : ""
    lines.push(`[${result.session_id}] ${result.message_id} (${result.role}) ${timestamp}`)
    lines.push(`  ${result.excerpt}`)
    lines.push(`  Matches: ${result.match_count}\n`)
  }

  return lines.join("\n")
}

/**
 * Filters session IDs by date range.
 * @param sessionIDs - Array of session IDs to filter
 * @param fromDate - Optional start date (ISO 8601)
 * @param toDate - Optional end date (ISO 8601)
 * @returns Filtered array of session IDs
 */
export async function filterSessionsByDate(
  sessionIDs: string[],
  fromDate?: string,
  toDate?: string
): Promise<string[]> {
  if (!fromDate && !toDate) return sessionIDs

  const from = fromDate ? new Date(fromDate) : null
  const to = toDate ? new Date(toDate) : null

  const results: string[] = []
  for (const id of sessionIDs) {
    const info = await getSessionInfo(id)
    if (!info || !info.last_message) continue

    if (from && info.last_message < from) continue
    if (to && info.last_message > to) continue

    results.push(id)
  }

  return results
}

/**
 * Searches for text content within a session's messages.
 * @param sessionID - Session ID to search in
 * @param query - Text to search for
 * @param caseSensitive - Whether to match case (default: false)
 * @param maxResults - Maximum number of results to return
 * @returns Array of search results with excerpts
 */
export async function searchInSession(
  sessionID: string,
  query: string,
  caseSensitive = false,
  maxResults?: number
): Promise<SearchResult[]> {
  const messages = await readSessionMessages(sessionID)
  const results: SearchResult[] = []

  const searchQuery = caseSensitive ? query : query.toLowerCase()

  for (const msg of messages) {
    if (maxResults && results.length >= maxResults) break

    let matchCount = 0
    const excerpts: string[] = []

    for (const part of msg.parts) {
      if (part.type === "text" && part.text) {
        const text = caseSensitive ? part.text : part.text.toLowerCase()
        const matches = text.split(searchQuery).length - 1
        if (matches > 0) {
          matchCount += matches

          const index = text.indexOf(searchQuery)
          if (index !== -1) {
            const start = Math.max(0, index - 50)
            const end = Math.min(text.length, index + searchQuery.length + 50)
            let excerpt = part.text.substring(start, end)
            if (start > 0) excerpt = "..." + excerpt
            if (end < text.length) excerpt = excerpt + "..."
            excerpts.push(excerpt)
          }
        }
      }
    }

    if (matchCount > 0) {
      results.push({
        session_id: sessionID,
        message_id: msg.id,
        role: msg.role,
        excerpt: excerpts[0] || "",
        match_count: matchCount,
        timestamp: msg.time?.created,
      })
    }
  }

  return results
}
