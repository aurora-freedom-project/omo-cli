import type { OpencodeClient } from "@opencode-ai/sdk"

/** Options for running an OpenCode session programmatically. */
export interface RunOptions {
  message: string
  agent?: string
  directory?: string
  timeout?: number
}

/** Runtime context for a running OpenCode session. */
export interface RunContext {
  client: OpencodeClient
  sessionID: string
  directory: string
  abortController: AbortController
}

/** A todo item tracked within a session. */
export interface Todo {
  id: string
  content: string
  status: string
  priority: string
}

/** Current status of a running session. */
export interface SessionStatus {
  type: "idle" | "busy" | "retry"
}

/** Reference to a child (sub-agent) session. */
export interface ChildSession {
  id: string
}

/** Payload for an OpenCode event. */
export interface EventPayload {
  type: string
  properties?: Record<string, unknown>
}

/** Properties for session idle events. */
export interface SessionIdleProps {
  sessionID?: string
}

/** Properties for session status change events. */
export interface SessionStatusProps {
  sessionID?: string
  status?: { type?: string }
}

/** Properties for message updated events. */
export interface MessageUpdatedProps {
  info?: { sessionID?: string; role?: string }
  content?: string
}

/** Properties for message part updated events (streaming). */
export interface MessagePartUpdatedProps {
  info?: { sessionID?: string; role?: string }
  part?: {
    type?: string
    text?: string
    name?: string
    input?: unknown
  }
}

/** Properties for tool execution start events. */
export interface ToolExecuteProps {
  sessionID?: string
  name?: string
  input?: Record<string, unknown>
}

/** Properties for tool result events. */
export interface ToolResultProps {
  sessionID?: string
  name?: string
  output?: string
}

/** Properties for session error events. */
export interface SessionErrorProps {
  sessionID?: string
  error?: unknown
}
