import type { CommandDefinition } from "../claude-code-command-loader"

export type BuiltinCommandName =
  | "init-deep" | "ralph-loop" | "cancel-ralph" | "ulw-loop" | "refactor" | "start-work"
  | "design-audit" | "design-polish" | "design-critique" | "design-normalize"
  | "design-animate" | "design-colorize" | "design-distill"
  | "design-bolder" | "design-quieter" | "design-harden"

export interface BuiltinCommandConfig {
  disabled_commands?: BuiltinCommandName[]
}

export type BuiltinCommands = Record<string, CommandDefinition>
