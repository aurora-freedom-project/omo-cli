#!/usr/bin/env bun
/**
 * Auto-fix common tsc errors in test files.
 *
 * Usage:
 *   bun run fix:types          # via npm script
 *   bun run script/fix-test-types.ts   # directly
 *
 * What it fixes:
 *   - TS7006: Parameter 'x' implicitly has an 'any' type → adds `: string`
 *   - TS2345: Argument type mismatch in mockImplementation → wraps with `as any`
 *   - TS2345: spyOn on mock.module target (`never`) → `(spyOn(...) as any).mock...`
 *   - TS2454: Variable used before assigned → adds `!` to declaration
 *   - TS2322: Type 'unknown' → adds `as Record<string, unknown>`
 *   - TS2322: Type '{...}' not assignable to 'never' (mock arrays) → `[...] as any`
 *   - TS18046: 'expr' is of type 'unknown' → `(expr as any)`
 *   - TS18048: 'expr' is possibly 'undefined' → `expr!`
 *   - `as never` → `as any` in test files with tsc errors
 *
 * Safe to run repeatedly — idempotent (won't double-fix).
 * Does NOT change production code, only *.test.ts files.
 */
import { readFileSync, writeFileSync } from "fs"
import { execSync } from "child_process"

const ROOT = process.cwd()

// ─── Phase 1: Collect tsc errors ───────────────────────────────────────────────

console.log("Running tsc --noEmit to collect errors...")
const tscOutput = execSync(`bun tsc --noEmit 2>&1 || true`, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    cwd: ROOT,
})

interface TscError {
    file: string
    line: number
    col: number
    code: string
    message: string
}

const errors: TscError[] = []
for (const line of tscOutput.split("\n")) {
    const match = line.match(/^(src\/[^(]+)\((\d+),(\d+)\): error (TS\d+): (.*)/)
    if (match) {
        errors.push({
            file: match[1],
            line: parseInt(match[2]),
            col: parseInt(match[3]),
            code: match[4],
            message: match[5],
        })
    }
}

const testErrors = errors.filter(e => e.file.endsWith(".test.ts"))
if (testErrors.length === 0) {
    console.log("✅ No test-file tsc errors found!")
    process.exit(0)
}

console.log(`Found ${testErrors.length} test-file tsc errors across ${new Set(testErrors.map(e => e.file)).size} files\n`)

// Group by file
const fileErrors = new Map<string, TscError[]>()
for (const err of testErrors) {
    if (!fileErrors.has(err.file)) fileErrors.set(err.file, [])
    fileErrors.get(err.file)!.push(err)
}

let totalFixes = 0
let totalFiles = 0

// ─── Phase 2: Fix `as never` → `as any` ───────────────────────────────────────

for (const [relFile] of fileErrors) {
    const filePath = `${ROOT}/${relFile}`
    let content = readFileSync(filePath, "utf-8")
    const original = content
    let count = 0

    // } as never → } as any
    count += (content.match(/\} as never/g) || []).length
    content = content.replace(/\} as never/g, "} as any")

    // null as never → null as any
    count += (content.match(/null as never/g) || []).length
    content = content.replace(/null as never/g, "null as any")

    // ) as never → ) as any
    count += (content.match(/\) as never/g) || []).length
    content = content.replace(/\) as never/g, ") as any")

    // "string" as never → "string" as any
    count += (content.match(/" as never/g) || []).length
    content = content.replace(/" as never/g, '" as any')

    if (content !== original) {
        writeFileSync(filePath, content)
        totalFiles++
        totalFixes += count
        console.log(`  [as-never→as-any] ${count} fixes in ${relFile}`)
    }
}

// ─── Phase 3: Fix TS7006, TS2345, TS2454, TS2322 ──────────────────────────────

// Re-read files (may have changed in Phase 2)
// Re-collect errors after as-never fixes
const tscOutput2 = execSync(`bun tsc --noEmit 2>&1 || true`, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    cwd: ROOT,
})

const errors2: TscError[] = []
for (const line of tscOutput2.split("\n")) {
    const match = line.match(/^(src\/[^(]+\.test\.ts)\((\d+),(\d+)\): error (TS\d+): (.*)/)
    if (match) {
        errors2.push({
            file: match[1],
            line: parseInt(match[2]),
            col: parseInt(match[3]),
            code: match[4],
            message: match[5],
        })
    }
}

const fileErrors2 = new Map<string, TscError[]>()
for (const err of errors2) {
    if (!fileErrors2.has(err.file)) fileErrors2.set(err.file, [])
    fileErrors2.get(err.file)!.push(err)
}

for (const [relFile, fileErrs] of fileErrors2) {
    const filePath = `${ROOT}/${relFile}`
    let lines = readFileSync(filePath, "utf-8").split("\n")
    const original = lines.join("\n")
    let fixes = 0

    // Process errors from bottom to top so line numbers stay valid
    const sortedErrs = [...fileErrs].sort((a, b) => b.line - a.line || b.col - a.col)
    const modifiedLines = new Set<number>()

    for (const err of sortedErrs) {
        const lineIdx = err.line - 1
        if (lineIdx >= lines.length) continue
        if (modifiedLines.has(lineIdx)) continue

        const line = lines[lineIdx]

        // TS7006: implicit any → add : string
        if (err.code === "TS7006") {
            const paramMatch = err.message.match(/Parameter '(\w+)' implicitly has an 'any' type/)
            if (paramMatch) {
                const paramName = paramMatch[1]
                const col = err.col - 1
                if (line.substring(col).startsWith(paramName)) {
                    const before = line.substring(0, col)
                    const after = line.substring(col + paramName.length)
                    if (after.match(/^[),\s=]/)) {
                        lines[lineIdx] = before + paramName + ": string" + after
                        fixes++
                        modifiedLines.add(lineIdx)
                    }
                }
            }
            continue
        }

        // TS2345: Argument type mismatch
        if (err.code === "TS2345" && err.message.includes("not assignable to parameter")) {
            // mockImplementation with wrong signature
            if (line.includes(".mockImplementation(") && !line.includes("as any)")) {
                const implStart = line.indexOf(".mockImplementation(") + ".mockImplementation(".length
                let depth = 1
                let i = implStart
                for (; i < line.length && depth > 0; i++) {
                    if (line[i] === "(") depth++
                    if (line[i] === ")") depth--
                }
                if (depth === 0) {
                    const before = line.substring(0, implStart)
                    const inner = line.substring(implStart, i - 1)
                    const after = line.substring(i - 1)
                    lines[lineIdx] = before + "(" + inner + ") as any" + after
                    fixes++
                    modifiedLines.add(lineIdx)
                }
                continue
            }

            // Generic: wrap argument with (expr as any)
            if (!line.includes("as any")) {
                const col = err.col - 1
                let end = col
                let depth = 0
                for (; end < line.length; end++) {
                    if ("([{".includes(line[end])) depth++
                    if (")]}".includes(line[end])) {
                        if (depth === 0) break
                        depth--
                    }
                    if (line[end] === "," && depth === 0) break
                }
                const expr = line.substring(col, end).trim()
                if (expr.length > 0 && !expr.includes("as any")) {
                    lines[lineIdx] = line.substring(0, col) + "(" + expr + " as any)" + line.substring(end)
                    fixes++
                    modifiedLines.add(lineIdx)
                }
            }
            continue
        }

        // TS2454: Variable used before assigned → add ! to let declaration
        if (err.code === "TS2454") {
            const varMatch = err.message.match(/Variable '(\w+)' is used before being assigned/)
            if (varMatch) {
                const varName = varMatch[1]
                for (let i = lineIdx - 1; i >= 0; i--) {
                    const declLine = lines[i]
                    const re = new RegExp(`^(\\s*let\\s+${varName})\\b`)
                    if (re.test(declLine) && !declLine.includes(`${varName}!`)) {
                        lines[i] = declLine.replace(re, `$1!`)
                        fixes++
                        break
                    }
                }
            }
            continue
        }

        // TS2322: 'unknown' not assignable to 'Record<string, unknown>'
        if (err.code === "TS2322" && err.message.includes("'unknown' is not assignable to type 'Record<string, unknown>'")) {
            if (!line.includes("as Record")) {
                lines[lineIdx] = line.replace(/(\s*=\s*.+?)(\s*$)/, "$1 as Record<string, unknown>$2")
                fixes++
                modifiedLines.add(lineIdx)
            }
            continue
        }

        // TS2322: Type '{...}' is not assignable to type 'never' (mock.module returning never[])
        // Fix: wrap array argument with `as any` — e.g. mockFn.mockResolvedValue([{...}]) → mockFn.mockResolvedValue([{...}] as any)
        if (err.code === "TS2322" && err.message.includes("is not assignable to type 'never'")) {
            if (!line.includes("as any") && !line.includes("as never")) {
                // Look for array literal context: find `]` followed by `)` on same or next line
                const closeBracketIdx = line.lastIndexOf("]")
                if (closeBracketIdx >= 0 && !line.substring(closeBracketIdx).includes("as any")) {
                    lines[lineIdx] = line.substring(0, closeBracketIdx + 1) + " as any" + line.substring(closeBracketIdx + 1)
                    fixes++
                    modifiedLines.add(lineIdx)
                }
            }
            continue
        }

        // TS18046: 'expr' is of type 'unknown' — cast to any for property access
        if (err.code === "TS18046" && err.message.includes("is of type 'unknown'")) {
            const col = err.col - 1
            // Find the expression being accessed (e.g. `results[i]` or `promptBody.tools`)
            // Wrap it in `(expr as any)`
            const dotOrBracket = line.indexOf(".", col)
            const bracket = line.indexOf("[", col)
            let end = dotOrBracket >= 0 ? dotOrBracket : bracket
            if (end < 0) end = line.length

            const expr = line.substring(col, end)
            if (expr.length > 0 && !line.includes("as any") && !expr.includes("as any")) {
                lines[lineIdx] = line.substring(0, col) + "(" + expr + " as any)" + line.substring(end)
                fixes++
                modifiedLines.add(lineIdx)
            }
            continue
        }

        // TS18048: 'expr' is possibly 'undefined' — add non-null assertion
        if (err.code === "TS18048" && err.message.includes("is possibly 'undefined'")) {
            // Extract the variable/property name from error message
            const nameMatch = err.message.match(/'([^']+)' is possibly 'undefined'/)
            if (nameMatch) {
                const name = nameMatch[1]
                const col = err.col - 1
                // Add `!` after the expression at col position
                const exprEnd = col + name.length
                if (exprEnd <= line.length && line.substring(col, exprEnd) === name && line[exprEnd] !== "!") {
                    lines[lineIdx] = line.substring(0, exprEnd) + "!" + line.substring(exprEnd)
                    fixes++
                    modifiedLines.add(lineIdx)
                }
            }
            continue
        }

        // TS2345: spyOn on mock.module target becomes `never` — cast spyOn result
        // When mock.module overwrites a module, spyOn(target, "method") returns Mock<never, never>
        // Fix: (spyOn(x, "y") as any).mockImplementation(...)
        if (err.code === "TS2345" && err.message.includes("not assignable to parameter of type 'never'")) {
            if (line.includes("spyOn(") && line.includes(".mockImplementation(")) {
                const spyOnStart = line.indexOf("spyOn(")
                // Find matching closing paren for spyOn()
                let depth = 0
                let spyOnEnd = spyOnStart + 6
                for (; spyOnEnd < line.length; spyOnEnd++) {
                    if (line[spyOnEnd] === "(") depth++
                    if (line[spyOnEnd] === ")") {
                        if (depth === 0) { spyOnEnd++; break }
                        depth--
                    }
                }
                if (!line.substring(0, spyOnStart).includes("(spyOn(")) {
                    const before = line.substring(0, spyOnStart)
                    const spyOnExpr = line.substring(spyOnStart, spyOnEnd)
                    const after = line.substring(spyOnEnd)
                    // Need semicolon prefix if at start of line
                    const prefix = before.trim() === "" ? ";" : ""
                    lines[lineIdx] = before + prefix + "(" + spyOnExpr + " as any)" + after
                    fixes++
                    modifiedLines.add(lineIdx)
                }
            }
            continue
        }
    }

    const content = lines.join("\n")
    if (fixes > 0 && content !== original) {
        writeFileSync(filePath, content)
        totalFiles++
        totalFixes += fixes
        console.log(`  [type-fixes] ${fixes} fixes in ${relFile}`)
    }
}

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`)
console.log(`Total: ${totalFixes} fixes across ${totalFiles} files`)

// Final check
const finalOutput = execSync(`bun tsc --noEmit 2>&1 || true`, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    cwd: ROOT,
})
const remaining = finalOutput.split("\n").filter(l => l.includes("error TS") && l.includes(".test.ts")).length
console.log(`Remaining test tsc errors: ${remaining}`)
