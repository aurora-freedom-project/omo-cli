import { spawnSync } from "child_process"
import { createHash } from "crypto"
import { Effect } from "effect"
import { readFileSync } from "fs"
import { basename, extname } from "path"
import { getSgCliPath, LANG_EXTENSIONS } from "../../tools/ast-grep/constants"
import { log } from "../../shared/logger"
import type { CodeElement, CodeRelation } from "../../cli/memory/surreal-client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SgJsonMatch {
    text: string
    range: {
        byteOffset: { start: number; end: number }
        start: { line: number; column: number }
        end: { line: number; column: number }
    }
    file: string
    language: string
    metaVariables?: Record<string, {
        text: string
        range: {
            byteOffset: { start: number; end: number }
            start: { line: number; column: number }
            end: { line: number; column: number }
        }
    }>
}

export interface ParseResult {
    elements: CodeElement[]
    relations: CodeRelation[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId(project: string, file: string, kind: string, name: string, lineStart: number): string {
    const hash = createHash("md5")
        .update(`${project}:${file}:${kind}:${name}:${lineStart}`)
        .digest("hex")
        .slice(0, 16)
    return hash
}

function fileHash(content: string): string {
    return createHash("md5").update(content).digest("hex")
}

function detectLanguage(filePath: string): string | null {
    const ext = extname(filePath).toLowerCase()
    for (const [lang, exts] of Object.entries(LANG_EXTENSIONS)) {
        if ((exts as string[]).includes(ext)) return lang
    }
    return null
}

/**
 * Run sg CLI with a pattern and return JSON matches.
 */
function runSgPattern(
    sgPath: string,
    pattern: string,
    lang: string,
    filePath: string
): SgJsonMatch[] {
    return Effect.runSync(
        Effect.try({
            try: () => {
                const result = spawnSync(
                    sgPath,
                    ["run", "-p", pattern, "--lang", lang, "--json=compact", filePath],
                    {
                        encoding: "utf-8",
                        timeout: 30000,
                        maxBuffer: 5 * 1024 * 1024,
                    }
                )

                if (!result.stdout?.trim()) return []

                return JSON.parse(result.stdout) as SgJsonMatch[]
            },
            catch: (err) => err,
        }).pipe(Effect.catchAll((err) => {
            log("[code-parser] sg pattern failed", { pattern, lang, filePath, err })
            return Effect.succeed([] as SgJsonMatch[])
        }))
    )
}

// ---------------------------------------------------------------------------
// Language-specific patterns
// ---------------------------------------------------------------------------

// TypeScript/JavaScript patterns for sg CLI
const TS_PATTERNS = {
    // Named function declarations: function foo() {}
    functionDecl: "function $NAME($$$PARAMS) $BODY",
    // Exported function: export function foo() {}
    exportedFunction: "export function $NAME($$$PARAMS) $BODY",
    // Async function: async function foo() {}
    asyncFunction: "async function $NAME($$$PARAMS) $BODY",
    // Arrow const: const foo = () => {}
    arrowConst: "const $NAME = ($$$PARAMS) => $BODY",
    // Exported arrow: export const foo = () => {}
    exportedArrow: "export const $NAME = ($$$PARAMS) => $BODY",
    // Class declaration: class Foo {}
    classDecl: "class $NAME $BODY",
    // Exported class: export class Foo {}
    exportedClass: "export class $NAME $BODY",
    // Interface: interface Foo {}
    interfaceDecl: "interface $NAME $BODY",
    // Exported interface
    exportedInterface: "export interface $NAME $BODY",
    // Type alias: type Foo = ...
    typeAlias: "type $NAME = $TYPE",
    // Exported type
    exportedType: "export type $NAME = $TYPE",
    // Import statement
    importStmt: "import $$$IMPORTS from '$SOURCE'",
}

// ---------------------------------------------------------------------------
// Parsing functions
// ---------------------------------------------------------------------------

function extractComment(content: string, lineStart: number): string | undefined {
    const lines = content.split("\n")
    // Look backwards from the line before the element for JSDoc or // comments
    let commentLines: string[] = []
    for (let i = lineStart - 2; i >= Math.max(0, lineStart - 15); i--) {
        const line = lines[i]?.trim()
        if (!line) break
        if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/**") || line.startsWith("*/")) {
            commentLines.unshift(line.replace(/^\/\*\*?\s*|\s*\*\/$/g, "").replace(/^\*\s?/, "").replace(/^\/\/\s?/, "").trim())
        } else {
            break
        }
    }
    const doc = commentLines.filter(Boolean).join(" ").trim()
    return doc || undefined
}

function extractParamsFromText(text: string): string[] {
    const paramMatch = text.match(/\(([^)]*)\)/)
    if (!paramMatch?.[1]) return []
    return paramMatch[1]
        .split(",")
        .map(p => p.trim().split(":")[0]?.split("?")[0]?.trim())
        .filter(Boolean)
        .filter(p => p !== "...")
}

function extractReturnType(text: string): string | undefined {
    // Match ): ReturnType { or ): ReturnType => 
    const match = text.match(/\)\s*:\s*([^{=>]+?)(?:\s*[{=]|$)/)
    return match?.[1]?.trim() || undefined
}

function parseTypeScriptFile(
    sgPath: string,
    filePath: string,
    content: string,
    project: string
): ParseResult {
    const elements: CodeElement[] = []
    const relations: CodeRelation[] = []
    const lang = filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? "tsx" : "typescript"
    const hash = fileHash(content)
    const seenElements = new Set<string>()

    // Helper to add element if not duplicate
    function addElement(el: Omit<CodeElement, "id" | "project" | "fileHash">, exported: boolean) {
        const id = makeId(project, filePath, el.kind, el.name, el.lineStart)
        if (seenElements.has(id)) return id
        seenElements.add(id)
        elements.push({
            ...el,
            id,
            project,
            fileHash: hash,
            exported,
        })
        return id
    }

    // --- Functions ---
    const funcPatterns: Array<{ pattern: string; exported: boolean }> = [
        { pattern: TS_PATTERNS.exportedFunction, exported: true },
        { pattern: TS_PATTERNS.functionDecl, exported: false },
        { pattern: TS_PATTERNS.asyncFunction, exported: false },
        { pattern: TS_PATTERNS.exportedArrow, exported: true },
        { pattern: TS_PATTERNS.arrowConst, exported: false },
    ]

    for (const { pattern, exported } of funcPatterns) {
        const matches = runSgPattern(sgPath, pattern, lang, filePath)
        for (const m of matches) {
            const name = m.metaVariables?.NAME?.text
            if (!name || name.length > 100) continue

            const lineStart = m.range.start.line + 1
            const lineEnd = m.range.end.line + 1
            const signature = m.text.split("\n")[0]?.trim().slice(0, 200) ?? ""
            const docstring = extractComment(content, lineStart)
            const params = extractParamsFromText(m.text)
            const returnType = extractReturnType(m.text)

            addElement({
                name,
                kind: "function",
                file: filePath,
                lineStart,
                lineEnd,
                signature,
                docstring,
                exported,
                params,
                returnType,
                content: m.text.slice(0, 500),
            }, exported)
        }
    }

    // --- Classes ---
    for (const { pattern, exported } of [
        { pattern: TS_PATTERNS.exportedClass, exported: true },
        { pattern: TS_PATTERNS.classDecl, exported: false },
    ]) {
        const matches = runSgPattern(sgPath, pattern, lang, filePath)
        for (const m of matches) {
            const name = m.metaVariables?.NAME?.text
            if (!name || name.length > 100) continue

            const lineStart = m.range.start.line + 1
            const lineEnd = m.range.end.line + 1
            const signature = m.text.split("\n")[0]?.trim().slice(0, 200) ?? ""
            const docstring = extractComment(content, lineStart)

            // Check for extends
            const extendsMatch = signature.match(/extends\s+(\w+)/)
            const implementsMatch = signature.match(/implements\s+([\w,\s]+)/)

            const classId = addElement({
                name,
                kind: "class",
                file: filePath,
                lineStart,
                lineEnd,
                signature,
                docstring,
                exported,
                content: m.text.slice(0, 1000),
            }, exported)

            // Add extends/implements relations
            if (extendsMatch?.[1]) {
                const parentId = makeId(project, "", "class", extendsMatch[1], 0)
                relations.push({
                    sourceId: classId,
                    targetId: parentId,
                    kind: "extends",
                })
            }
            if (implementsMatch?.[1]) {
                for (const iface of implementsMatch[1].split(",")) {
                    const ifaceName = iface.trim()
                    if (ifaceName) {
                        const ifaceId = makeId(project, "", "interface", ifaceName, 0)
                        relations.push({
                            sourceId: classId,
                            targetId: ifaceId,
                            kind: "implements",
                        })
                    }
                }
            }
        }
    }

    // --- Interfaces ---
    for (const { pattern, exported } of [
        { pattern: TS_PATTERNS.exportedInterface, exported: true },
        { pattern: TS_PATTERNS.interfaceDecl, exported: false },
    ]) {
        const matches = runSgPattern(sgPath, pattern, lang, filePath)
        for (const m of matches) {
            const name = m.metaVariables?.NAME?.text
            if (!name || name.length > 100) continue

            addElement({
                name,
                kind: "interface",
                file: filePath,
                lineStart: m.range.start.line + 1,
                lineEnd: m.range.end.line + 1,
                signature: m.text.split("\n")[0]?.trim().slice(0, 200) ?? "",
                docstring: extractComment(content, m.range.start.line + 1),
                exported,
                content: m.text.slice(0, 500),
            }, exported)
        }
    }

    // --- Type aliases ---
    for (const { pattern, exported } of [
        { pattern: TS_PATTERNS.exportedType, exported: true },
        { pattern: TS_PATTERNS.typeAlias, exported: false },
    ]) {
        const matches = runSgPattern(sgPath, pattern, lang, filePath)
        for (const m of matches) {
            const name = m.metaVariables?.NAME?.text
            if (!name || name.length > 100) continue

            addElement({
                name,
                kind: "type",
                file: filePath,
                lineStart: m.range.start.line + 1,
                lineEnd: m.range.end.line + 1,
                signature: m.text.split("\n")[0]?.trim().slice(0, 200) ?? "",
                docstring: extractComment(content, m.range.start.line + 1),
                exported,
            }, exported)
        }
    }

    // --- Import relations ---
    const importMatches = runSgPattern(sgPath, TS_PATTERNS.importStmt, lang, filePath)
    for (const m of importMatches) {
        const source = m.metaVariables?.SOURCE?.text
        if (!source || source.startsWith(".") === false) continue // only local imports

        // Create a relation from this file's elements to the imported file
        // We use a placeholder element for the importing file
        const importerId = makeId(project, filePath, "file", basename(filePath), 0)
        // Resolve relative import to approximate file path
        const importedFile = source.replace(/^\.\//, "").replace(/^\.\.\//, "../")
        const importedId = makeId(project, importedFile, "file", basename(importedFile), 0)

        relations.push({
            sourceId: importerId,
            targetId: importedId,
            kind: "imports",
        })
    }

    return { elements, relations }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Parse a source file and extract code elements + relations.
 */
export function parseFile(
    filePath: string,
    content: string,
    project: string
): ParseResult {
    const lang = detectLanguage(filePath)
    if (!lang) return { elements: [], relations: [] }

    const sgPath = getSgCliPath()
    if (!sgPath) {
        log("[code-parser] sg CLI not available, skipping", { filePath })
        return { elements: [], relations: [] }
    }

    // TypeScript/JavaScript/TSX/JSX
    if (["typescript", "javascript", "tsx"].includes(lang)) {
        return parseTypeScriptFile(sgPath, filePath, content, project)
    }

    // For other languages: basic function/class extraction via simpler patterns
    return parseGenericFile(sgPath, filePath, content, project, lang)
}

/**
 * Parse a generic file using basic function/class patterns.
 * Works for Go, Python, Rust, Java, etc.
 */
function parseGenericFile(
    sgPath: string,
    filePath: string,
    content: string,
    project: string,
    lang: string
): ParseResult {
    const elements: CodeElement[] = []
    const hash = fileHash(content)
    const seenElements = new Set<string>()

    // Language-specific function patterns
    const patterns: Record<string, string[]> = {
        go: ["func $NAME($$$PARAMS) $$$BODY"],
        python: ["def $NAME($$$PARAMS):"],
        rust: ["fn $NAME($$$PARAMS) $$$BODY", "pub fn $NAME($$$PARAMS) $$$BODY"],
        java: [
            "public $RET $NAME($$$PARAMS) $BODY",
            "private $RET $NAME($$$PARAMS) $BODY",
            "protected $RET $NAME($$$PARAMS) $BODY",
        ],
    }

    const classPatterns: Record<string, string[]> = {
        go: ["type $NAME struct $BODY"],
        python: ["class $NAME:"],
        rust: ["struct $NAME $BODY", "pub struct $NAME $BODY"],
        java: ["public class $NAME $BODY", "class $NAME $BODY"],
    }

    // Extract functions
    for (const pattern of patterns[lang] ?? []) {
        const matches = runSgPattern(sgPath, pattern, lang, filePath)
        for (const m of matches) {
            const name = m.metaVariables?.NAME?.text
            if (!name || name.length > 100) continue

            const id = makeId(project, filePath, "function", name, m.range.start.line + 1)
            if (seenElements.has(id)) continue
            seenElements.add(id)

            elements.push({
                id,
                name,
                kind: "function",
                file: filePath,
                lineStart: m.range.start.line + 1,
                lineEnd: m.range.end.line + 1,
                signature: m.text.split("\n")[0]?.trim().slice(0, 200) ?? "",
                docstring: extractComment(content, m.range.start.line + 1),
                exported: m.text.includes("export") || m.text.includes("pub ") || m.text.includes("public "),
                params: extractParamsFromText(m.text),
                project,
                fileHash: hash,
            })
        }
    }

    // Extract classes/structs
    for (const pattern of classPatterns[lang] ?? []) {
        const matches = runSgPattern(sgPath, pattern, lang, filePath)
        for (const m of matches) {
            const name = m.metaVariables?.NAME?.text
            if (!name || name.length > 100) continue

            const id = makeId(project, filePath, "class", name, m.range.start.line + 1)
            if (seenElements.has(id)) continue
            seenElements.add(id)

            elements.push({
                id,
                name,
                kind: "class",
                file: filePath,
                lineStart: m.range.start.line + 1,
                lineEnd: m.range.end.line + 1,
                signature: m.text.split("\n")[0]?.trim().slice(0, 200) ?? "",
                docstring: extractComment(content, m.range.start.line + 1),
                exported: m.text.includes("export") || m.text.includes("pub ") || m.text.includes("public "),
                project,
                fileHash: hash,
            })
        }
    }

    return { elements, relations: [] }
}

/**
 * Compute file hash for incremental indexing.
 */
export function computeFileHash(content: string): string {
    return fileHash(content)
}

/**
 * Detect language from file path.
 */
export function getLanguage(filePath: string): string | null {
    return detectLanguage(filePath)
}
