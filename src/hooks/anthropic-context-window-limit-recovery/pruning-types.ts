/** Signature of a tool call for deduplication analysis. */
export interface ToolCallSignature {
  toolName: string
  signature: string
  callID: string
  turn: number
}

/** Record of a file operation for supersede-write pruning. */
export interface FileOperation {
  callID: string
  tool: string
  filePath: string
  turn: number
}

/** Record of a tool call that resulted in an error. */
export interface ErroredToolCall {
  callID: string
  toolName: string
  turn: number
  errorAge: number
}

/** Result of a context pruning operation. */
export interface PruningResult {
  itemsPruned: number
  totalTokensSaved: number
  strategies: {
    deduplication: number
    supersedeWrites: number
    purgeErrors: number
  }
}

/** Mutable state tracked during context pruning analysis. */
export interface PruningState {
  toolIdsToPrune: Set<string>
  currentTurn: number
  fileOperations: Map<string, FileOperation[]>
  toolSignatures: Map<string, ToolCallSignature[]>
  erroredTools: Map<string, ErroredToolCall>
}

/** Approximate characters per LLM token for estimation. */
export const CHARS_PER_TOKEN = 4

/** Estimates the token count of text using character-based heuristic. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}
