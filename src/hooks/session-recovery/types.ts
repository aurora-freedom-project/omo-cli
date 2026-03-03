/** Part type for LLM thinking/reasoning content. */
export type ThinkingPartType = "thinking" | "redacted_thinking" | "reasoning"
/** Part type for meta/step markers. */
export type MetaPartType = "step-start" | "step-finish"
/** Part type for user-visible content (text, tools). */
export type ContentPartType = "text" | "tool" | "tool_use" | "tool_result"

/** Stored metadata for a session message. */
export interface StoredMessageMeta {
  id: string
  sessionID: string
  role: "user" | "assistant"
  parentID?: string
  time?: {
    created: number
    completed?: number
  }
  error?: unknown
}

/** Stored text part of a message. */
export interface StoredTextPart {
  id: string
  sessionID: string
  messageID: string
  type: "text"
  text: string
  synthetic?: boolean
  ignored?: boolean
}

/** Stored tool invocation part of a message. */
export interface StoredToolPart {
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
  }
}

/** Stored reasoning/thinking part of a message. */
export interface StoredReasoningPart {
  id: string
  sessionID: string
  messageID: string
  type: "reasoning"
  text: string
}

/** Stored step marker part (start/finish). */
export interface StoredStepPart {
  id: string
  sessionID: string
  messageID: string
  type: "step-start" | "step-finish"
}

/** Union type for all stored part variants. */
export type StoredPart = StoredTextPart | StoredToolPart | StoredReasoningPart | StoredStepPart | {
  id: string
  sessionID: string
  messageID: string
  type: string
  [key: string]: unknown
}

/** Data received from an OpenCode message event for recovery processing. */
export interface MessageData {
  info?: {
    id?: string
    role?: string
    sessionID?: string
    parentID?: string
    error?: unknown
    agent?: string
    model?: {
      providerID: string
      modelID: string
    }
    system?: string
    tools?: Record<string, boolean>
  }
  parts?: Array<{
    type: string
    id?: string
    text?: string
    thinking?: string
    name?: string
    input?: Record<string, unknown>
    callID?: string
  }>
}

/** Configuration for resuming a session after recovery. */
export interface ResumeConfig {
  sessionID: string
  agent?: string
  model?: {
    providerID: string
    modelID: string
  }
}
