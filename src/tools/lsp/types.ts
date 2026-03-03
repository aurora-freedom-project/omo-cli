/** Configuration for an LSP language server. */
export interface LSPServerConfig {
  id: string
  command: string[]
  extensions: string[]
  disabled?: boolean
  env?: Record<string, string>
  initialization?: Record<string, unknown>
}

/** A zero-based line/character position in a text document. */
export interface Position {
  line: number
  character: number
}

/** A range of positions in a text document. */
export interface Range {
  start: Position
  end: Position
}

/** A location in a document identified by URI and range. */
export interface Location {
  uri: string
  range: Range
}

/** A link between source and target locations (goto definition). */
export interface LocationLink {
  targetUri: string
  targetRange: Range
  targetSelectionRange: Range
  originSelectionRange?: Range
}

/** A symbol found in a workspace search. */
export interface SymbolInfo {
  name: string
  kind: number
  location: Location
  containerName?: string
}

/** A symbol found within a document (hierarchical). */
export interface DocumentSymbol {
  name: string
  kind: number
  range: Range
  selectionRange: Range
  children?: DocumentSymbol[]
}

/** A diagnostic (error, warning) reported by the language server. */
export interface Diagnostic {
  range: Range
  severity?: number
  code?: string | number
  source?: string
  message: string
}

/** Identifies a text document by its URI. */
export interface TextDocumentIdentifier {
  uri: string
}

/** A text document identifier with a version number. */
export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number | null
}

/** A text edit to apply to a document. */
export interface TextEdit {
  range: Range
  newText: string
}

/** A set of edits to apply to a versioned text document. */
export interface TextDocumentEdit {
  textDocument: VersionedTextDocumentIdentifier
  edits: TextEdit[]
}

/** A workspace edit operation to create a new file. */
export interface CreateFile {
  kind: "create"
  uri: string
  options?: { overwrite?: boolean; ignoreIfExists?: boolean }
}

/** A workspace edit operation to rename a file. */
export interface RenameFile {
  kind: "rename"
  oldUri: string
  newUri: string
  options?: { overwrite?: boolean; ignoreIfExists?: boolean }
}

/** A workspace edit operation to delete a file. */
export interface DeleteFile {
  kind: "delete"
  uri: string
  options?: { recursive?: boolean; ignoreIfNotExists?: boolean }
}

/** A collection of edits across multiple documents. */
export interface WorkspaceEdit {
  changes?: { [uri: string]: TextEdit[] }
  documentChanges?: (TextDocumentEdit | CreateFile | RenameFile | DeleteFile)[]
}

/** Result of a prepare-rename request (range + optional placeholder). */
export interface PrepareRenameResult {
  range: Range
  placeholder?: string
}

/** Indicates the server supports default rename behavior. */
export interface PrepareRenameDefaultBehavior {
  defaultBehavior: boolean
}

/** Basic information about an LSP server for lookup results. */
export interface ServerLookupInfo {
  id: string
  command: string[]
  extensions: string[]
}

/** Result of looking up an LSP server for a file extension. */
export type ServerLookupResult =
  | { status: "found"; server: ResolvedServer }
  | { status: "not_configured"; extension: string; availableServers: string[] }
  | { status: "not_installed"; server: ServerLookupInfo; installHint: string }

/** A fully resolved LSP server configuration with priority. */
export interface ResolvedServer {
  id: string
  command: string[]
  extensions: string[]
  priority: number
  env?: Record<string, string>
  initialization?: Record<string, unknown>
}
