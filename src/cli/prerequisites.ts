import { execSync } from "node:child_process"
import { Effect } from "effect"

export interface PrerequisiteResult {
    name: string
    ok: boolean
    critical: boolean
    version?: string
    hint?: string
}

export interface PrerequisitesReport {
    results: PrerequisiteResult[]
    allCriticalPassed: boolean
    allPassed: boolean
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkDocker(): Promise<PrerequisiteResult> {
    return Effect.runSync(
        Effect.try({
            try: () => {
                const version = execSync("docker --version", { encoding: "utf-8", timeout: 5000 }).trim()
                const match = version.match(/Docker version ([\d.]+)/)
                return { name: "Docker", ok: true, critical: true, version: match?.[1] ?? version } as PrerequisiteResult
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed({
            name: "Docker",
            ok: false,
            critical: true,
            hint: "Install: https://docs.docker.com/get-docker/",
        } as PrerequisiteResult)))
    )
}

async function checkOllama(): Promise<PrerequisiteResult> {
    return Effect.runSync(
        Effect.try({
            try: () => {
                const version = execSync("ollama --version", { encoding: "utf-8", timeout: 5000 }).trim()
                const match = version.match(/([\d.]+)/)
                return { name: "Ollama", ok: true, critical: true, version: match?.[1] ?? version } as PrerequisiteResult
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed({
            name: "Ollama",
            ok: false,
            critical: true,
            hint: "Install: https://ollama.com/download",
        } as PrerequisiteResult)))
    )
}

async function checkOllamaRunning(): Promise<PrerequisiteResult> {
    return Effect.runPromise(
        Effect.tryPromise({
            try: async () => {
                const res = await fetch("http://localhost:11434/api/tags", {
                    signal: AbortSignal.timeout(3000),
                })
                if (res.ok) {
                    return { name: "Ollama Server", ok: true, critical: true } as PrerequisiteResult
                }
                return {
                    name: "Ollama Server",
                    ok: false,
                    critical: true,
                    hint: "Start Ollama: ollama serve (or open the Ollama app)",
                } as PrerequisiteResult
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed({
            name: "Ollama Server",
            ok: false,
            critical: true,
            hint: "Start Ollama: ollama serve (or open the Ollama app)",
        } as PrerequisiteResult)))
    )
}

async function checkEmbeddingModel(): Promise<PrerequisiteResult> {
    return Effect.runPromise(
        Effect.tryPromise({
            try: async () => {
                const res = await fetch("http://localhost:11434/api/tags", {
                    signal: AbortSignal.timeout(3000),
                })
                if (!res.ok) {
                    return {
                        name: "Embedding Model",
                        ok: false,
                        critical: false,
                        hint: "Ollama not reachable — start Ollama first, then run: ollama pull all-minilm:l6-v2",
                    } as PrerequisiteResult
                }

                const data = (await res.json()) as { models?: Array<{ name: string }> }
                const models = data.models ?? []
                const hasModel = models.some((m) => m.name.startsWith("all-minilm"))

                if (hasModel) {
                    return { name: "Embedding Model (all-minilm)", ok: true, critical: false } as PrerequisiteResult
                }

                return {
                    name: "Embedding Model (all-minilm)",
                    ok: false,
                    critical: false,
                    hint: "Run: ollama pull all-minilm:l6-v2",
                } as PrerequisiteResult
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed({
            name: "Embedding Model (all-minilm)",
            ok: false,
            critical: false,
            hint: "Start Ollama first, then run: ollama pull all-minilm:l6-v2",
        } as PrerequisiteResult)))
    )
}

async function checkGit(): Promise<PrerequisiteResult> {
    return Effect.runSync(
        Effect.try({
            try: () => {
                const version = execSync("git --version", { encoding: "utf-8", timeout: 5000 }).trim()
                const match = version.match(/git version ([\d.]+)/)
                return { name: "Git", ok: true, critical: false, version: match?.[1] ?? version } as PrerequisiteResult
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed({
            name: "Git",
            ok: false,
            critical: false,
            hint: "Install: brew install git (macOS) or https://git-scm.com",
        } as PrerequisiteResult)))
    )
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function checkPrerequisites(): Promise<PrerequisitesReport> {
    const results: PrerequisiteResult[] = []

    // Run all checks
    results.push(await checkDocker())
    results.push(await checkOllama())
    results.push(await checkOllamaRunning())
    results.push(await checkEmbeddingModel())
    results.push(await checkGit())

    const allCriticalPassed = results.filter((r) => r.critical).every((r) => r.ok)
    const allPassed = results.every((r) => r.ok)

    return { results, allCriticalPassed, allPassed }
}
