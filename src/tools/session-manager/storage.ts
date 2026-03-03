import { existsSync, readdirSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { Effect } from "effect"
import { MESSAGE_STORAGE, PART_STORAGE, SESSION_STORAGE, TODO_DIR, TRANSCRIPT_DIR } from "./constants"
import type { SessionMessage, SessionInfo, TodoItem, SessionMetadata } from "./types"

/** Options for filtering main sessions. */
export interface GetMainSessionsOptions {
  directory?: string
}

/**
 * Retrieves all main (non-child) sessions with metadata.
 * Reads session JSON files and filters out sub-sessions.
 * @param options - Options including optional directory filter
 * @returns Array of session metadata sorted by creation time
 */
export async function getMainSessions(options: GetMainSessionsOptions): Promise<SessionMetadata[]> {
  if (!existsSync(SESSION_STORAGE)) return []

  const sessions: SessionMetadata[] = []

  return await Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const projectDirs = await readdir(SESSION_STORAGE, { withFileTypes: true })
        for (const projectDir of projectDirs) {
          if (!projectDir.isDirectory()) continue

          const projectPath = join(SESSION_STORAGE, projectDir.name)
          const sessionFiles = await readdir(projectPath)

          for (const file of sessionFiles) {
            if (!file.endsWith(".json")) continue

            const meta = await Effect.runPromise(
              Effect.tryPromise({
                try: async () => {
                  const content = await readFile(join(projectPath, file), "utf-8")
                  return JSON.parse(content) as SessionMetadata
                },
                catch: () => null as never
              }).pipe(Effect.catchAll(() => Effect.succeed(null)))
            )
            if (!meta) continue
            if (meta.parentID) continue
            if (options.directory && meta.directory !== options.directory) continue
            sessions.push(meta)
          }
        }
        return sessions.sort((a, b) => b.time.updated - a.time.updated)
      },
      catch: () => [] as SessionMetadata[] as never
    }).pipe(Effect.catchAll(() => Effect.succeed([] as SessionMetadata[])))
  )
}

/**
 * Retrieves all session IDs from storage.
 * Recursively scans message and session directories.
 * @returns Array of unique session ID strings
 */
export async function getAllSessions(): Promise<string[]> {
  if (!existsSync(MESSAGE_STORAGE)) return []

  const sessions: string[] = []

  async function scanDirectory(dir: string): Promise<void> {
    await Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const entries = await readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const sessionPath = join(dir, entry.name)
              const files = await readdir(sessionPath)
              if (files.some((f) => f.endsWith(".json"))) {
                sessions.push(entry.name)
              } else {
                await scanDirectory(sessionPath)
              }
            }
          }
        },
        catch: () => undefined as never
      }).pipe(Effect.catchAll(() => Effect.void))
    )
  }

  await scanDirectory(MESSAGE_STORAGE)
  return [...new Set(sessions)]
}

/**
 * Finds the message directory for a given session.
 * Checks both message storage and session storage paths.
 * @param sessionID - The session ID to look up
 * @returns Path to the session's message directory
 */
export function getMessageDir(sessionID: string): string {
  if (!existsSync(MESSAGE_STORAGE)) return ""

  const directPath = join(MESSAGE_STORAGE, sessionID)
  if (existsSync(directPath)) {
    return directPath
  }

  return Effect.runSync(
    Effect.try({
      try: () => {
        for (const dir of readdirSync(MESSAGE_STORAGE)) {
          const sessionPath = join(MESSAGE_STORAGE, dir, sessionID)
          if (existsSync(sessionPath)) {
            return sessionPath
          }
        }
        return ""
      },
      catch: () => "" as never
    }).pipe(Effect.catchAll(() => Effect.succeed("")))
  )

  return ""
}

/** Checks if a session exists in storage by its ID. */
export function sessionExists(sessionID: string): boolean {
  return getMessageDir(sessionID) !== ""
}

/**
 * Reads all messages for a session, sorted chronologically.
 * Parses message JSON files and their associated parts.
 * @param sessionID - The session ID to read
 * @returns Array of session messages with parts populated
 */
export async function readSessionMessages(sessionID: string): Promise<SessionMessage[]> {
  const messageDir = getMessageDir(sessionID)
  if (!messageDir || !existsSync(messageDir)) return []

  const messages: SessionMessage[] = []
  return await Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const files = await readdir(messageDir)
        for (const file of files) {
          if (!file.endsWith(".json")) continue
          const msg = await Effect.runPromise(
            Effect.tryPromise({
              try: async () => {
                const content = await readFile(join(messageDir, file), "utf-8")
                const meta = JSON.parse(content)
                const parts = await readParts(meta.id)
                return {
                  id: meta.id,
                  role: meta.role,
                  agent: meta.agent,
                  time: meta.time,
                  parts,
                } as SessionMessage
              },
              catch: () => null as never
            }).pipe(Effect.catchAll(() => Effect.succeed(null)))
          )
          if (msg) messages.push(msg)
        }
        return messages.sort((a, b) => {
          const aTime = a.time?.created ?? 0
          const bTime = b.time?.created ?? 0
          if (aTime !== bTime) return aTime - bTime
          return a.id.localeCompare(b.id)
        })
      },
      catch: () => [] as SessionMessage[] as never
    }).pipe(Effect.catchAll(() => Effect.succeed([] as SessionMessage[])))
  )
}

/**
 * Reads part data for a specific message.
 * @param messageID - The message ID to read parts for
 * @returns Array of part objects with id, type, and additional fields
 */
export async function readParts(messageID: string): Promise<Array<{ id: string; type: string;[key: string]: unknown }>> {
  const partDir = join(PART_STORAGE, messageID)
  if (!existsSync(partDir)) return []

  const parts: Array<{ id: string; type: string;[key: string]: unknown }> = []
  return await Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const files = await readdir(partDir)
        for (const file of files) {
          if (!file.endsWith(".json")) continue
          const part = await Effect.runPromise(
            Effect.tryPromise({
              try: async () => {
                const content = await readFile(join(partDir, file), "utf-8")
                return JSON.parse(content) as { id: string; type: string;[key: string]: unknown }
              },
              catch: () => null as never
            }).pipe(Effect.catchAll(() => Effect.succeed(null)))
          )
          if (part) parts.push(part)
        }
        return parts.sort((a, b) => a.id.localeCompare(b.id))
      },
      catch: () => [] as Array<{ id: string; type: string;[key: string]: unknown }> as never
    }).pipe(Effect.catchAll(() => Effect.succeed([] as Array<{ id: string; type: string;[key: string]: unknown }>)))
  )
}

/**
 * Reads todo items associated with a session.
 * @param sessionID - The session ID to read todos for
 * @returns Array of TodoItem objects
 */
export async function readSessionTodos(sessionID: string): Promise<TodoItem[]> {
  if (!existsSync(TODO_DIR)) return []

  return await Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const allFiles = await readdir(TODO_DIR)
        const todoFiles = allFiles.filter((f) => f.includes(sessionID) && f.endsWith(".json"))

        for (const file of todoFiles) {
          const items = await Effect.runPromise(
            Effect.tryPromise({
              try: async () => {
                const content = await readFile(join(TODO_DIR, file), "utf-8")
                const data = JSON.parse(content)
                if (Array.isArray(data)) {
                  return data.map((item) => ({
                    id: item.id || "",
                    content: item.content || "",
                    status: item.status || "pending",
                    priority: item.priority,
                  })) as TodoItem[]
                }
                return null
              },
              catch: () => null as never
            }).pipe(Effect.catchAll(() => Effect.succeed(null)))
          )
          if (items) return items
        }
        return [] as TodoItem[]
      },
      catch: () => [] as TodoItem[] as never
    }).pipe(Effect.catchAll(() => Effect.succeed([] as TodoItem[])))
  )
}

/**
 * Reads the transcript entry count for a session.
 * @param sessionID - The session ID to check
 * @returns Number of transcript entries
 */
export async function readSessionTranscript(sessionID: string): Promise<number> {
  if (!existsSync(TRANSCRIPT_DIR)) return 0

  const transcriptFile = join(TRANSCRIPT_DIR, `${sessionID}.jsonl`)
  if (!existsSync(transcriptFile)) return 0

  return await Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const content = await readFile(transcriptFile, "utf-8")
        return content.trim().split("\n").filter(Boolean).length
      },
      catch: () => 0 as never
    }).pipe(Effect.catchAll(() => Effect.succeed(0)))
  )
}

/**
 * Retrieves detailed session information including message stats and data sources.
 * @param sessionID - The session ID to inspect
 * @returns SessionInfo object or null if not found
 */
export async function getSessionInfo(sessionID: string): Promise<SessionInfo | null> {
  const messages = await readSessionMessages(sessionID)
  if (messages.length === 0) return null

  const agentsUsed = new Set<string>()
  let firstMessage: Date | undefined
  let lastMessage: Date | undefined

  for (const msg of messages) {
    if (msg.agent) agentsUsed.add(msg.agent)
    if (msg.time?.created) {
      const date = new Date(msg.time.created)
      if (!firstMessage || date < firstMessage) firstMessage = date
      if (!lastMessage || date > lastMessage) lastMessage = date
    }
  }

  const todos = await readSessionTodos(sessionID)
  const transcriptEntries = await readSessionTranscript(sessionID)

  return {
    id: sessionID,
    message_count: messages.length,
    first_message: firstMessage,
    last_message: lastMessage,
    agents_used: Array.from(agentsUsed),
    has_todos: todos.length > 0,
    has_transcript: transcriptEntries > 0,
    todos,
    transcript_entries: transcriptEntries,
  }
}
