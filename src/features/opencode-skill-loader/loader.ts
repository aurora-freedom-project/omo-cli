import { promises as fs } from "fs"
import { join, basename } from "path"
import { Effect } from "effect"
import yaml from "js-yaml"
import { parseFrontmatter } from "../../shared/frontmatter"
import { sanitizeModelField } from "../../shared/model-sanitizer"
import { resolveSymlinkAsync, isMarkdownFile } from "../../shared/file-utils"
import { getClaudeConfigDir } from "../../shared"
import { getOpenCodeConfigDir } from "../../shared/opencode-config-dir"
import { UNIFIED_SKILLS_DIR } from "../../cli/skills-setup"
import type { CommandDefinition } from "../claude-code-command-loader/types"
import type { SkillScope, SkillMetadata, LoadedSkill, LazyContentLoader } from "./types"
import type { SkillMcpConfig } from "../skill-mcp-manager/types"

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

async function loadMcpJsonFromDir(skillDir: string): Promise<SkillMcpConfig | undefined> {
  const mcpJsonPath = join(skillDir, "mcp.json")

  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const content = await fs.readFile(mcpJsonPath, "utf-8")
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

function parseAllowedTools(allowedTools: string | string[] | undefined): string[] | undefined {
  if (!allowedTools) return undefined

  // Handle YAML array format: already parsed as string[]
  if (Array.isArray(allowedTools)) {
    return allowedTools.map(t => t.trim()).filter(Boolean)
  }

  // Handle space-separated string format: "Read Write Edit Bash"
  return allowedTools.split(/\s+/).filter(Boolean)
}

async function loadSkillFromPath(
  skillPath: string,
  resolvedPath: string,
  defaultName: string,
  scope: SkillScope
): Promise<LoadedSkill | null> {
  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const content = await fs.readFile(skillPath, "utf-8")
        const { data, body } = parseFrontmatter<SkillMetadata>(content)
        const frontmatterMcp = parseSkillMcpConfigFromFrontmatter(content)
        const mcpJsonMcp = await loadMcpJsonFromDir(resolvedPath)
        const mcpConfig = mcpJsonMcp || frontmatterMcp

        const skillName = data.name || defaultName
        const originalDescription = data.description || ""
        const isOpencodeSource = scope === "opencode" || scope === "opencode-project"
        const formattedDescription = `(${scope} - Skill) ${originalDescription}`

        const templateContent = `<skill-instruction>
Base directory for this skill: ${resolvedPath}/
File references (@path) in this skill are relative to this directory.

${body.trim()}
</skill-instruction>

<user-request>
$ARGUMENTS
</user-request>`

        const eagerLoader: LazyContentLoader = {
          loaded: true,
          content: templateContent,
          load: async () => templateContent,
        }

        const definition: CommandDefinition = {
          name: skillName,
          description: formattedDescription,
          template: templateContent,
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
          lazyContent: eagerLoader,
        } as LoadedSkill
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))
  )
}

async function loadSkillsFromDir(skillsDir: string, scope: SkillScope): Promise<LoadedSkill[]> {
  const entries = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => [])
  const skills: LoadedSkill[] = []

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue

    const entryPath = join(skillsDir, entry.name)

    if (entry.isDirectory() || entry.isSymbolicLink()) {
      const resolvedPath = await resolveSymlinkAsync(entryPath)
      const dirName = entry.name

      const skillMdPath = join(resolvedPath, "SKILL.md")
      const hasSkillMd = await Effect.runPromise(
        Effect.tryPromise({
          try: async () => { await fs.access(skillMdPath); return true },
          catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
      )
      if (hasSkillMd) {
        const skill = await loadSkillFromPath(skillMdPath, resolvedPath, dirName, scope)
        if (skill) skills.push(skill)
        continue
      }

      const namedSkillMdPath = join(resolvedPath, `${dirName}.md`)
      const hasNamedMd = await Effect.runPromise(
        Effect.tryPromise({
          try: async () => { await fs.access(namedSkillMdPath); return true },
          catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
      )
      if (hasNamedMd) {
        const skill = await loadSkillFromPath(namedSkillMdPath, resolvedPath, dirName, scope)
        if (skill) skills.push(skill)
        continue
      }

      continue
    }

    if (isMarkdownFile(entry)) {
      const skillName = basename(entry.name, ".md")
      const skill = await loadSkillFromPath(entryPath, skillsDir, skillName, scope)
      if (skill) skills.push(skill)
    }
  }

  return skills
}

function skillsToRecord(skills: LoadedSkill[]): Record<string, CommandDefinition> {
  const result: Record<string, CommandDefinition> = {}
  for (const skill of skills) {
    const { name: _name, argumentHint: _argumentHint, ...openCodeCompatible } = skill.definition
    result[skill.name] = openCodeCompatible as CommandDefinition
  }
  return result
}

export async function loadOpencodeGlobalSkills(): Promise<Record<string, CommandDefinition>> {
  const skills = await loadGlobalSkillsWithUnified()
  return skillsToRecord(skills)
}

export async function loadOpencodeProjectSkills(): Promise<Record<string, CommandDefinition>> {
  const opencodeProjectDir = join(process.cwd(), ".opencode", "skills")
  const skills = await loadSkillsFromDir(opencodeProjectDir, "opencode-project")
  return skillsToRecord(skills)
}

export interface DiscoverSkillsOptions {
  // Empty options interface for future expansion, removing legacy includeClaudeCodePaths
}

export async function discoverAllSkills(): Promise<LoadedSkill[]> {
  const [opencodeProjectSkills, opencodeGlobalSkills] = await Promise.all([
    discoverOpencodeProjectSkills(),
    discoverOpencodeGlobalSkills(),
  ])

  return [...opencodeGlobalSkills, ...opencodeProjectSkills]
}

export async function discoverSkills(_options: DiscoverSkillsOptions = {}): Promise<LoadedSkill[]> {
  return discoverAllSkills()
}

export async function getSkillByName(name: string, options: DiscoverSkillsOptions = {}): Promise<LoadedSkill | undefined> {
  const skills = await discoverSkills(options)
  return skills.find(s => s.name === name)
}

export async function discoverOpencodeGlobalSkills(): Promise<LoadedSkill[]> {
  return loadGlobalSkillsWithUnified()
}

/**
 * Load skills from both ~/.config/_skills_/ (unified) and
 * ~/.config/opencode/skills/ (native). User's native skills
 * take priority — if a skill name exists in both, the native
 * version wins. This way:
 * - Users keep their custom skills untouched
 * - ~/.config/_skills_/ skills are always available
 * - No symlinks needed
 */
async function loadGlobalSkillsWithUnified(): Promise<LoadedSkill[]> {
  const configDir = getOpenCodeConfigDir({ binary: "opencode" })
  const opencodeSkillsDir = join(configDir, "skills")

  // Load from both paths in parallel
  const [unifiedSkills, nativeSkills] = await Promise.all([
    loadSkillsFromDir(UNIFIED_SKILLS_DIR, "opencode"),
    loadSkillsFromDir(opencodeSkillsDir, "opencode"),
  ])

  // If same path (symlink), just return one set
  if (opencodeSkillsDir === UNIFIED_SKILLS_DIR) {
    return nativeSkills.length > 0 ? nativeSkills : unifiedSkills
  }

  // Dedup: native skills win over unified (user's custom setup takes priority)
  const nativeNames = new Set(nativeSkills.map(s => s.name))
  const merged = [...nativeSkills]
  for (const skill of unifiedSkills) {
    if (!nativeNames.has(skill.name)) {
      merged.push(skill)
    }
  }
  return merged
}

export async function discoverOpencodeProjectSkills(): Promise<LoadedSkill[]> {
  const opencodeProjectDir = join(process.cwd(), ".opencode", "skills")
  return loadSkillsFromDir(opencodeProjectDir, "opencode-project")
}

// Legacy Claude Code skill loaders — purged paths, return empty results
export async function loadUserSkills(): Promise<Record<string, CommandDefinition>> {
  return {}
}

export async function loadProjectSkills(): Promise<Record<string, CommandDefinition>> {
  return {}
}

export async function discoverUserClaudeSkills(): Promise<LoadedSkill[]> {
  return []
}

export async function discoverProjectClaudeSkills(): Promise<LoadedSkill[]> {
  return []
}
