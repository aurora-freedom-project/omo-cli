/** Type of source code comment. */
export type CommentType = "line" | "block" | "docstring"

/** Information about a detected comment in source code. */
export interface CommentInfo {
  text: string
  lineNumber: number
  filePath: string
  commentType: CommentType
  isDocstring: boolean
  metadata?: Record<string, string>
}

/** A pending file write/edit operation to check for comments. */
export interface PendingCall {
  filePath: string
  content?: string
  oldString?: string
  newString?: string
  edits?: Array<{ old_string: string; new_string: string }>
  tool: "write" | "edit" | "multiedit"
  sessionID: string
  timestamp: number
}

/** Collection of comments found in a single file. */
export interface FileComments {
  filePath: string
  comments: CommentInfo[]
}

/** Result of applying a comment filter. */
export interface FilterResult {
  shouldSkip: boolean
  reason?: string
}

/** Function that evaluates whether a comment should be skipped. */
export type CommentFilter = (comment: CommentInfo) => FilterResult
