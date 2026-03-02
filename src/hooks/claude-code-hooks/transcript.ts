import { join } from "path"
import { mkdirSync, appendFileSync, existsSync, writeFileSync, unlinkSync } from "fs"
import { tmpdir } from "os"
import { randomUUID } from "crypto"
import type { TranscriptEntry } from "./types"
import { transformToolName } from "../../shared/tool-name"
import { getClaudeConfigDir } from "../../shared"
import { Effect } from "effect"

const TRANSCRIPT_DIR = join(getClaudeConfigDir(), "transcripts")

export function getTranscriptPath(sessionId: string): string {
  return join(TRANSCRIPT_DIR, `${sessionId}.jsonl`)
}

function ensureTranscriptDir(): void {
  if (!existsSync(TRANSCRIPT_DIR)) {
    mkdirSync(TRANSCRIPT_DIR, { recursive: true })
  }
}

export function appendTranscriptEntry(
  sessionId: string,
  entry: TranscriptEntry
): void {
  ensureTranscriptDir()
  const path = getTranscriptPath(sessionId)
  const line = JSON.stringify(entry) + "\n"
  appendFileSync(path, line)
}

export function recordToolUse(
  sessionId: string,
  toolName: string,
  toolInput: Record<string, unknown>
): void {
  appendTranscriptEntry(sessionId, {
    type: "tool_use",
    timestamp: new Date().toISOString(),
    tool_name: toolName,
    tool_input: toolInput,
  })
}

export function recordToolResult(
  sessionId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  toolOutput: Record<string, unknown>
): void {
  appendTranscriptEntry(sessionId, {
    type: "tool_result",
    timestamp: new Date().toISOString(),
    tool_name: toolName,
    tool_input: toolInput,
    tool_output: toolOutput,
  })
}

export function recordUserMessage(
  sessionId: string,
  content: string
): void {
  appendTranscriptEntry(sessionId, {
    type: "user",
    timestamp: new Date().toISOString(),
    content,
  })
}

export function recordAssistantMessage(
  sessionId: string,
  content: string
): void {
  appendTranscriptEntry(sessionId, {
    type: "assistant",
    timestamp: new Date().toISOString(),
    content,
  })
}

// ============================================================================
// Claude Code Compatible Transcript Builder (PORT FROM DISABLED)
// ============================================================================

/**
 * OpenCode API response type (loosely typed)
 */
interface OpenCodeMessagePart {
  type: string
  tool?: string
  state?: {
    status?: string
    input?: Record<string, unknown>
  }
}

interface OpenCodeMessage {
  info?: {
    role?: string
  }
  parts?: OpenCodeMessagePart[]
}

/**
 * Claude Code compatible transcript entry (from disabled file)
 */
interface DisabledTranscriptEntry {
  type: "assistant"
  message: {
    role: "assistant"
    content: Array<{
      type: "tool_use"
      name: string
      input: Record<string, unknown>
    }>
  }
}

/**
 * Build Claude Code compatible transcript from session messages
 * 
 * PORT FROM DISABLED: This calls client.session.messages() API to fetch
 * the full session history and builds a JSONL file in Claude Code format.
 * 
 * @param client OpenCode client instance
 * @param sessionId Session ID
 * @param directory Working directory
 * @param currentToolName Current tool being executed (added as last entry)
 * @param currentToolInput Current tool input
 * @returns Temp file path (caller must call deleteTempTranscript!)
 */
export async function buildTranscriptFromSession(
  client: {
    session: {
      messages: (opts: { path: { id: string }; query?: { directory: string } }) => Promise<unknown>
    }
  },
  sessionId: string,
  directory: string,
  currentToolName: string,
  currentToolInput: Record<string, unknown>
): Promise<string | null> {
  const buildCurrentEntry = (toolName: string, toolInput: Record<string, unknown>): DisabledTranscriptEntry => ({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", name: transformToolName(toolName), input: toolInput }],
    },
  })

  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const response = await client.session.messages({
          path: { id: sessionId },
          query: { directory },
        })

        const messages = (response as { "200"?: unknown[]; data?: unknown[] })["200"]
          ?? (response as { data?: unknown[] }).data
          ?? (Array.isArray(response) ? response : [])

        const entries: string[] = []

        if (Array.isArray(messages)) {
          for (const msg of messages as OpenCodeMessage[]) {
            if (msg.info?.role !== "assistant") continue
            for (const part of msg.parts || []) {
              if (part.type !== "tool" || part.state?.status !== "completed" || !part.state?.input) continue
              const entry: DisabledTranscriptEntry = {
                type: "assistant",
                message: { role: "assistant", content: [{ type: "tool_use", name: transformToolName(part.tool as string), input: part.state.input }] },
              }
              entries.push(JSON.stringify(entry))
            }
          }
        }

        entries.push(JSON.stringify(buildCurrentEntry(currentToolName, currentToolInput)))

        const tempPath = join(tmpdir(), `opencode-transcript-${sessionId}-${randomUUID()}.jsonl`)
        writeFileSync(tempPath, entries.join("\n") + "\n")
        return tempPath
      },
      catch: () => null as never
    }).pipe(
      Effect.catchAll(() =>
        // Fallback: write file with only the current tool entry
        Effect.try({
          try: () => {
            const tempPath = join(tmpdir(), `opencode-transcript-${sessionId}-${randomUUID()}.jsonl`)
            writeFileSync(tempPath, JSON.stringify(buildCurrentEntry(currentToolName, currentToolInput)) + "\n")
            return tempPath
          },
          catch: () => null as never
        }).pipe(Effect.catchAll(() => Effect.succeed(null)))
      )
    )
  )
}

/**
 * Delete temp transcript file (call in finally block)
 * 
 * PORT FROM DISABLED: Cleanup mechanism to avoid disk accumulation
 */
export function deleteTempTranscript(path: string | null): void {
  if (!path) return
  Effect.runSync(
    Effect.try({
      try: () => unlinkSync(path),
      catch: () => undefined as never
    }).pipe(Effect.catchAll(() => Effect.void))
  )
}
