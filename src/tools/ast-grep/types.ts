import type { CLI_LANGUAGES, NAPI_LANGUAGES } from "./constants"

/** Language supported by ast-grep CLI. */
export type CliLanguage = (typeof CLI_LANGUAGES)[number]
/** Language supported by ast-grep NAPI binding. */
export type NapiLanguage = (typeof NAPI_LANGUAGES)[number]

/** A line/column position in source code. */
export interface Position {
  line: number
  column: number
}

/** A range of positions in source code. */
export interface Range {
  start: Position
  end: Position
}

/** A match result from ast-grep CLI search. */
export interface CliMatch {
  text: string
  range: {
    byteOffset: { start: number; end: number }
    start: Position
    end: Position
  }
  file: string
  lines: string
  charCount: { leading: number; trailing: number }
  language: string
}

/** A simplified search match with file, text, range, and context lines. */
export interface SearchMatch {
  file: string
  text: string
  range: Range
  lines: string
}

/** A captured meta-variable from an ast-grep pattern match. */
export interface MetaVariable {
  name: string
  text: string
  kind: string
}

/** Result of an ast-grep structural analysis. */
export interface AnalyzeResult {
  text: string
  range: Range
  kind: string
  metaVariables: MetaVariable[]
}

/** Result of an ast-grep code transformation. */
export interface TransformResult {
  original: string
  transformed: string
  editCount: number
}

/** Complete result from an ast-grep search operation. */
export interface SgResult {
  matches: CliMatch[]
  totalMatches: number
  truncated: boolean
  truncatedReason?: "max_matches" | "max_output_bytes" | "timeout"
  error?: string
}
