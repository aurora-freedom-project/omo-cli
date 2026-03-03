/** A message within a session (user or assistant). */
export interface SessionMessage {
  id: string
  role: "user" | "assistant"
  agent?: string
  time?: {
    created: number
    updated?: number
  }
  parts: MessagePart[]
}

/** A part of a message (text, thinking, tool call, etc.). */
export interface MessagePart {
  id: string
  type: string
  text?: string
  thinking?: string
  tool?: string
  callID?: string
  input?: Record<string, unknown>
  output?: string
  error?: string
}

/** Summary information about a session. */
export interface SessionInfo {
  id: string
  message_count: number
  first_message?: Date
  last_message?: Date
  agents_used: string[]
  has_todos: boolean
  has_transcript: boolean
  todos?: TodoItem[]
  transcript_entries?: number
}

/** A todo item tracked within a session. */
export interface TodoItem {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority?: string
}

/** A search result from querying session messages. */
export interface SearchResult {
  session_id: string
  message_id: string
  role: string
  excerpt: string
  match_count: number
  timestamp?: number
}

/** Metadata for a session (ID, project, timestamps, summary). */
export interface SessionMetadata {
  id: string
  version?: string
  projectID: string
  directory: string
  title?: string
  parentID?: string
  time: {
    created: number
    updated: number
  }
  summary?: {
    additions: number
    deletions: number
    files: number
  }
}

/** Arguments for listing sessions. */
export interface SessionListArgs {
  limit?: number
  offset?: number
  from_date?: string
  to_date?: string
  project_path?: string
}

/** Arguments for reading a session's messages. */
export interface SessionReadArgs {
  session_id: string
  include_todos?: boolean
  include_transcript?: boolean
  limit?: number
}

/** Arguments for searching within sessions. */
export interface SessionSearchArgs {
  query: string
  session_id?: string
  case_sensitive?: boolean
  limit?: number
}

/** Arguments for getting session info. */
export interface SessionInfoArgs {
  session_id: string
}

/** Arguments for deleting a session. */
export interface SessionDeleteArgs {
  session_id: string
  confirm: boolean
}
