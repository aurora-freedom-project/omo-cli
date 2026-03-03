import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Effect } from "effect"
import { getOpenCodeStorageDir } from "../../shared/data-path"

const OPENCODE_STORAGE = getOpenCodeStorageDir()
const MESSAGE_STORAGE = join(OPENCODE_STORAGE, "message")
const PART_STORAGE = join(OPENCODE_STORAGE, "part")

const TRUNCATION_MESSAGE =
  "[TOOL RESULT TRUNCATED - Context limit exceeded. Original output was too large and has been truncated to recover the session. Please re-run this tool if you need the full output.]"

interface StoredToolPart {
  id: string
  sessionID: string
  messageID: string
  type: "tool"
  callID: string
  tool: string
  state: {
    status: "pending" | "running" | "completed" | "error"
    input: Record<string, unknown>
    output?: string
    error?: string
    time?: {
      start: number
      end?: number
      compacted?: number
    }
  }
  truncated?: boolean
  originalSize?: number
}

/** Information about a tool result found during size analysis. */
export interface ToolResultInfo {
  partPath: string
  partId: string
  messageID: string
  toolName: string
  outputSize: number
}

function getMessageDir(sessionID: string): string {
  if (!existsSync(MESSAGE_STORAGE)) return ""

  const directPath = join(MESSAGE_STORAGE, sessionID)
  if (existsSync(directPath)) {
    return directPath
  }

  for (const dir of readdirSync(MESSAGE_STORAGE)) {
    const sessionPath = join(MESSAGE_STORAGE, dir, sessionID)
    if (existsSync(sessionPath)) {
      return sessionPath
    }
  }

  return ""
}

function getMessageIds(sessionID: string): string[] {
  const messageDir = getMessageDir(sessionID)
  if (!messageDir || !existsSync(messageDir)) return []

  const messageIds: string[] = []
  for (const file of readdirSync(messageDir)) {
    if (!file.endsWith(".json")) continue
    const messageId = file.replace(".json", "")
    messageIds.push(messageId)
  }

  return messageIds
}

/** Finds all non-truncated tool results sorted by output size (largest first). */
export function findToolResultsBySize(sessionID: string): ToolResultInfo[] {
  const messageIds = getMessageIds(sessionID)
  const results: ToolResultInfo[] = []

  for (const messageID of messageIds) {
    const partDir = join(PART_STORAGE, messageID)
    if (!existsSync(partDir)) continue

    for (const file of readdirSync(partDir)) {
      if (!file.endsWith(".json")) continue
      const partItem = Effect.runSync(
        Effect.try({
          try: () => {
            const partPath = join(partDir, file)
            const content = readFileSync(partPath, "utf-8")
            const part = JSON.parse(content) as StoredToolPart

            if (part.type === "tool" && part.state?.output && !part.truncated) {
              return {
                partPath,
                partId: part.id,
                messageID,
                toolName: part.tool,
                outputSize: part.state.output.length,
              } as ToolResultInfo
            }
            return null
          },
          catch: () => "skip" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed(null)))
      )
      if (partItem) results.push(partItem)
    }
  }

  return results.sort((a, b) => b.outputSize - a.outputSize)
}

/** Finds the single largest non-truncated tool result for a session. */
export function findLargestToolResult(sessionID: string): ToolResultInfo | null {
  const results = findToolResultsBySize(sessionID)
  return results.length > 0 ? results[0] : null
}

/** Truncates a tool result output to a placeholder message. */
export function truncateToolResult(partPath: string): {
  success: boolean
  toolName?: string
  originalSize?: number
} {
  return Effect.runSync(
    Effect.try({
      try: () => {
        const content = readFileSync(partPath, "utf-8")
        const part = JSON.parse(content) as StoredToolPart

        if (!part.state?.output) {
          return { success: false as const }
        }

        const originalSize = part.state.output.length
        const toolName = part.tool

        part.truncated = true
        part.originalSize = originalSize
        part.state.output = TRUNCATION_MESSAGE

        if (!part.state.time) {
          part.state.time = { start: Date.now() }
        }
        part.state.time.compacted = Date.now()

        writeFileSync(partPath, JSON.stringify(part, null, 2))

        return { success: true as const, toolName, originalSize }
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed({ success: false as const })))
  )
}

/** Gets the total size of all non-truncated tool outputs for a session. */
export function getTotalToolOutputSize(sessionID: string): number {
  const results = findToolResultsBySize(sessionID)
  return results.reduce((sum, r) => sum + r.outputSize, 0)
}

/** Counts how many tool results have been truncated in a session. */
export function countTruncatedResults(sessionID: string): number {
  const messageIds = getMessageIds(sessionID)
  let count = 0

  for (const messageID of messageIds) {
    const partDir = join(PART_STORAGE, messageID)
    if (!existsSync(partDir)) continue

    for (const file of readdirSync(partDir)) {
      if (!file.endsWith(".json")) continue
      const isTruncated = Effect.runSync(
        Effect.try({
          try: () => {
            const content = readFileSync(join(partDir, file), "utf-8")
            const part = JSON.parse(content)
            return part.truncated === true
          },
          catch: () => "skip" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
      )
      if (isTruncated) count++
    }
  }

  return count
}

/** Result of an aggressive truncation operation. */
export interface AggressiveTruncateResult {
  success: boolean
  sufficient: boolean
  truncatedCount: number
  totalBytesRemoved: number
  targetBytesToRemove: number
  truncatedTools: Array<{ toolName: string; originalSize: number }>
}

/**
 * Truncates tool results until token count drops below target.
 * @param sessionID - Session to truncate
 * @param currentTokens - Current token count
 * @param maxTokens - Maximum allowed tokens
 * @param targetRatio - Target ratio of max tokens (default: 0.8)
 * @param charsPerToken - Characters per token estimate (default: 4)
 */
export function truncateUntilTargetTokens(
  sessionID: string,
  currentTokens: number,
  maxTokens: number,
  targetRatio: number = 0.8,
  charsPerToken: number = 4
): AggressiveTruncateResult {
  const targetTokens = Math.floor(maxTokens * targetRatio)
  const tokensToReduce = currentTokens - targetTokens
  const charsToReduce = tokensToReduce * charsPerToken

  if (tokensToReduce <= 0) {
    return {
      success: true,
      sufficient: true,
      truncatedCount: 0,
      totalBytesRemoved: 0,
      targetBytesToRemove: 0,
      truncatedTools: [],
    }
  }

  const results = findToolResultsBySize(sessionID)

  if (results.length === 0) {
    return {
      success: false,
      sufficient: false,
      truncatedCount: 0,
      totalBytesRemoved: 0,
      targetBytesToRemove: charsToReduce,
      truncatedTools: [],
    }
  }

  let totalRemoved = 0
  let truncatedCount = 0
  const truncatedTools: Array<{ toolName: string; originalSize: number }> = []

  for (const result of results) {
    const truncateResult = truncateToolResult(result.partPath)
    if (truncateResult.success) {
      truncatedCount++
      const removedSize = truncateResult.originalSize ?? result.outputSize
      totalRemoved += removedSize
      truncatedTools.push({
        toolName: truncateResult.toolName ?? result.toolName,
        originalSize: removedSize,
      })

      if (totalRemoved >= charsToReduce) {
        break
      }
    }
  }

  const sufficient = totalRemoved >= charsToReduce

  return {
    success: truncatedCount > 0,
    sufficient,
    truncatedCount,
    totalBytesRemoved: totalRemoved,
    targetBytesToRemove: charsToReduce,
    truncatedTools,
  }
}
