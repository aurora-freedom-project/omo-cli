import { readFile, readdir } from "fs/promises"
import type { Dirent } from "fs"
import { join, basename } from "path"
import { Effect } from "effect"
import yaml from "js-yaml"
import { parseFrontmatter } from "../../shared/frontmatter"
import { sanitizeModelField } from "../../shared/model-sanitizer"
import { resolveSymlink, isMarkdownFile } from "../../shared/file-utils"
import type { CommandDefinition } from "../claude-code-command-loader/types"
import type { SkillScope, SkillMetadata, LoadedSkill } from "./types"
import type { SkillMcpConfig } from "../skill-mcp-manager/types"

export async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0

  const worker = async () => {
    while (index < items.length) {
      const currentIndex = index++
      results[currentIndex] = await mapper(items[currentIndex])
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)

  return results
}

function parseSkillMcpConfigFromFrontmatter(content: string): SkillMcpConfig | undefined {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch) return undefined

  return Effect.runSync(
    Effect.try({
      try: () => {
        const parsed = yaml.load(frontmatterMatch[1]) as Record<string, unknown>
        if (parsed && typeof parsed === "object" && "mcp" in parsed && parsed.mcp) {
          return parsed.mcp as SkillMcpConfig
        }
        return undefined
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed(undefined)))
  )
}

export async function loadMcpJsonFromDirAsync(skillDir: string): Promise<SkillMcpConfig | undefined> {
  const mcpJsonPath = join(skillDir, "mcp.json")

  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const content = await readFile(mcpJsonPath, "utf-8")
        const parsed = JSON.parse(content) as Record<string, unknown>

        if (parsed && typeof parsed === "object" && "mcpServers" in parsed && parsed.mcpServers) {
          return parsed.mcpServers as SkillMcpConfig
        }

        if (parsed && typeof parsed === "object" && !("mcpServers" in parsed)) {
          const hasCommandField = Object.values(parsed).some(
            (v) => v && typeof v === "object" && "command" in (v as Record<string, unknown>)
          )
          if (hasCommandField) {
            return parsed as SkillMcpConfig
          }
        }
        return undefined
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed(undefined)))
  )
}

export async function loadSkillFromPathAsync(
  skillPath: string,
  resolvedPath: string,
  defaultName: string,
  scope: SkillScope
): Promise<LoadedSkill | null> {
  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const content = await readFile(skillPath, "utf-8")
        const { data, body, parseError } = parseFrontmatter<SkillMetadata>(content)
        if (parseError) return null

        const frontmatterMcp = parseSkillMcpConfigFromFrontmatter(content)
        const mcpJsonMcp = await loadMcpJsonFromDirAsync(resolvedPath)
        const mcpConfig = mcpJsonMcp || frontmatterMcp

        const skillName = data.name || defaultName
        const originalDescription = data.description || ""
        const isOpencodeSource = scope === "opencode" || scope === "opencode-project"
        const formattedDescription = `(${scope} - Skill) ${originalDescription}`

        const wrappedTemplate = `<skill-instruction>
Base directory for this skill: ${resolvedPath}/
File references (@path) in this skill are relative to this directory.

${body.trim()}
</skill-instruction>

<user-request>
$ARGUMENTS
</user-request>`

        const definition: CommandDefinition = {
          name: skillName,
          description: formattedDescription,
          template: wrappedTemplate,
          model: sanitizeModelField(data.model, isOpencodeSource ? "opencode" : "claude-code"),
          agent: data.agent,
          subtask: data.subtask,
          argumentHint: data["argument-hint"],
        }

        return {
          name: skillName,
          path: skillPath,
          resolvedPath,
          definition,
          scope,
          license: data.license,
          compatibility: data.compatibility,
          metadata: data.metadata,
          allowedTools: parseAllowedTools(data["allowed-tools"]),
          mcpConfig,
        } as LoadedSkill
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))
  )
}

function parseAllowedTools(allowedTools: string | string[] | undefined): string[] | undefined {
  if (!allowedTools) return undefined

  // Handle YAML array format: already parsed as string[]
  if (Array.isArray(allowedTools)) {
    return allowedTools.map(t => t.trim()).filter(Boolean)
  }

  // Handle space-separated string format: "Read Write Edit Bash"
  return allowedTools.split(/\s+/).filter(Boolean)
}

export async function discoverSkillsInDirAsync(skillsDir: string): Promise<LoadedSkill[]> {
  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const entries = await readdir(skillsDir, { withFileTypes: true })

        const processEntry = async (entry: Dirent): Promise<LoadedSkill | null> => {
          if (entry.name.startsWith(".")) return null

          const entryPath = join(skillsDir, entry.name)

          if (entry.isDirectory() || entry.isSymbolicLink()) {
            const resolvedPath = resolveSymlink(entryPath)
            const dirName = entry.name

            const skillMdPath = join(resolvedPath, "SKILL.md")
            const hasSkillMd = await Effect.runPromise(
              Effect.tryPromise({
                try: async () => { await readFile(skillMdPath, "utf-8"); return true },
                catch: () => "fail" as const,
              }).pipe(Effect.catchAll(() => Effect.succeed(false)))
            )
            if (hasSkillMd) {
              return loadSkillFromPathAsync(skillMdPath, resolvedPath, dirName, "opencode-project")
            }

            const namedSkillMdPath = join(resolvedPath, `${dirName}.md`)
            const hasNamedMd = await Effect.runPromise(
              Effect.tryPromise({
                try: async () => { await readFile(namedSkillMdPath, "utf-8"); return true },
                catch: () => "fail" as const,
              }).pipe(Effect.catchAll(() => Effect.succeed(false)))
            )
            if (hasNamedMd) {
              return loadSkillFromPathAsync(namedSkillMdPath, resolvedPath, dirName, "opencode-project")
            }

            return null
          }

          if (isMarkdownFile(entry)) {
            const skillName = basename(entry.name, ".md")
            return loadSkillFromPathAsync(entryPath, skillsDir, skillName, "opencode-project")
          }

          return null
        }

        const skillPromises = await mapWithConcurrency(entries, processEntry, 16)
        return skillPromises.filter((skill): skill is LoadedSkill => skill !== null)
      },
      catch: (error) => error,
    }).pipe(Effect.catchAll(() => Effect.succeed([] as LoadedSkill[])))
  )
}
