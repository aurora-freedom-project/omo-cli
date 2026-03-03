import { promises as fs, type Dirent } from "fs"
import { join, basename } from "path"
import { Effect } from "effect"
import { parseFrontmatter } from "../../shared/frontmatter"
import { sanitizeModelField } from "../../shared/model-sanitizer"
import { isMarkdownFile } from "../../shared/file-utils"
import { getClaudeConfigDir, getOpenCodeConfigDir } from "../../shared"
import { log } from "../../shared/logger"
import type { CommandScope, CommandDefinition, CommandFrontmatter, LoadedCommand } from "./types"

async function loadCommandsFromDir(
  commandsDir: string,
  scope: CommandScope,
  visited: Set<string> = new Set(),
  prefix: string = ""
): Promise<LoadedCommand[]> {
  const accessible = await Effect.runPromise(
    Effect.tryPromise({
      try: () => fs.access(commandsDir),
      catch: () => "not-found" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed("not-found" as const)))
  )
  if (accessible === "not-found") return []

  const realPathResult = await Effect.runPromise(
    Effect.tryPromise({
      try: () => fs.realpath(commandsDir),
      catch: (error) => error,
    }).pipe(Effect.catchAll((error) => {
      log(`Failed to resolve command directory: ${commandsDir}`, error)
      return Effect.succeed(null)
    }))
  )
  if (!realPathResult) return []
  const realPath = realPathResult

  if (visited.has(realPath)) {
    return []
  }
  visited.add(realPath)

  const entriesResult = await Effect.runPromise(
    Effect.tryPromise({
      try: () => fs.readdir(commandsDir, { withFileTypes: true }),
      catch: (error) => error,
    }).pipe(Effect.catchAll((error) => {
      log(`Failed to read command directory: ${commandsDir}`, error)
      return Effect.succeed(null)
    }))
  )
  if (!entriesResult) return []
  const entries = entriesResult

  const commands: LoadedCommand[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue
      const subDirPath = join(commandsDir, entry.name)
      const subPrefix = prefix ? `${prefix}:${entry.name}` : entry.name
      const subCommands = await loadCommandsFromDir(subDirPath, scope, visited, subPrefix)
      commands.push(...subCommands)
      continue
    }

    if (!isMarkdownFile(entry)) continue

    const commandPath = join(commandsDir, entry.name)
    const baseCommandName = basename(entry.name, ".md")
    const commandName = prefix ? `${prefix}:${baseCommandName}` : baseCommandName

    const parsed = await Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const content = await fs.readFile(commandPath, "utf-8")
          const { data, body } = parseFrontmatter<CommandFrontmatter>(content)

          const wrappedTemplate = `<command-instruction>
${body.trim()}
</command-instruction>

<user-request>
$ARGUMENTS
</user-request>`

          const formattedDescription = `(${scope}) ${data.description || ""}`

          const isOpencodeSource = scope === "opencode" || scope === "opencode-project"
          const definition: CommandDefinition = {
            name: commandName,
            description: formattedDescription,
            template: wrappedTemplate,
            agent: data.agent,
            model: sanitizeModelField(data.model, isOpencodeSource ? "opencode" : "claude-code"),
            subtask: data.subtask,
            argumentHint: data["argument-hint"],
            handoffs: data.handoffs,
          }

          return { name: commandName, path: commandPath, definition, scope } as LoadedCommand
        },
        catch: (error) => error,
      }).pipe(Effect.catchAll((error) => {
        log(`Failed to parse command: ${commandPath}`, error)
        return Effect.succeed(null)
      }))
    )
    if (parsed) commands.push(parsed)
  }

  return commands
}

function commandsToRecord(commands: LoadedCommand[]): Record<string, CommandDefinition> {
  const result: Record<string, CommandDefinition> = {}
  for (const cmd of commands) {
    const { name: _name, argumentHint: _argumentHint, ...openCodeCompatible } = cmd.definition
    result[cmd.name] = openCodeCompatible as CommandDefinition
  }
  return result
}

export async function loadUserCommands(): Promise<Record<string, CommandDefinition>> {
  const userCommandsDir = join(getClaudeConfigDir(), "commands")
  const commands = await loadCommandsFromDir(userCommandsDir, "user")
  return commandsToRecord(commands)
}

export async function loadProjectCommands(): Promise<Record<string, CommandDefinition>> {
  const projectCommandsDir = join(process.cwd(), ".claude", "commands")
  const commands = await loadCommandsFromDir(projectCommandsDir, "project")
  return commandsToRecord(commands)
}

export async function loadOpencodeGlobalCommands(): Promise<Record<string, CommandDefinition>> {
  const configDir = getOpenCodeConfigDir({ binary: "opencode" })
  const opencodeCommandsDir = join(configDir, "command")
  const commands = await loadCommandsFromDir(opencodeCommandsDir, "opencode")
  return commandsToRecord(commands)
}

export async function loadOpencodeProjectCommands(): Promise<Record<string, CommandDefinition>> {
  const opencodeProjectDir = join(process.cwd(), ".opencode", "command")
  const commands = await loadCommandsFromDir(opencodeProjectDir, "opencode-project")
  return commandsToRecord(commands)
}

export async function loadAllCommands(): Promise<Record<string, CommandDefinition>> {
  const [user, project, global, projectOpencode] = await Promise.all([
    loadUserCommands(),
    loadProjectCommands(),
    loadOpencodeGlobalCommands(),
    loadOpencodeProjectCommands(),
  ])
  return { ...projectOpencode, ...global, ...project, ...user }
}
