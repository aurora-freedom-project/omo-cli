import type { CommandDefinition } from "../claude-code-command-loader"
import type { BuiltinCommandName, BuiltinCommands } from "./types"
import { INIT_DEEP_TEMPLATE } from "./templates/init-deep"
import { RALPH_LOOP_TEMPLATE, CANCEL_RALPH_TEMPLATE } from "./templates/ralph-loop"
import { REFACTOR_TEMPLATE } from "./templates/refactor"
import { START_WORK_TEMPLATE } from "./templates/start-work"
import {
  DESIGN_AUDIT_TEMPLATE, DESIGN_POLISH_TEMPLATE, DESIGN_CRITIQUE_TEMPLATE,
  DESIGN_NORMALIZE_TEMPLATE, DESIGN_ANIMATE_TEMPLATE, DESIGN_COLORIZE_TEMPLATE,
  DESIGN_DISTILL_TEMPLATE, DESIGN_BOLDER_TEMPLATE, DESIGN_QUIETER_TEMPLATE,
  DESIGN_HARDEN_TEMPLATE,
} from "./templates/design"

const BUILTIN_COMMAND_DEFINITIONS: Record<BuiltinCommandName, Omit<CommandDefinition, "name">> = {
  "init-deep": {
    description: "(builtin) Initialize hierarchical AGENTS.md knowledge base",
    template: `<command-instruction>
${INIT_DEEP_TEMPLATE}
</command-instruction>

<user-request>
$ARGUMENTS
</user-request>`,
    argumentHint: "[--create-new] [--max-depth=N]",
  },
   "ralph-loop": {
     description: "(builtin) Start self-referential development loop until completion",
     template: `<command-instruction>
${RALPH_LOOP_TEMPLATE}
</command-instruction>

<user-task>
$ARGUMENTS
</user-task>`,
     argumentHint: '"task description" [--completion-promise=TEXT] [--max-iterations=N]',
   },
   "ulw-loop": {
     description: "(builtin) Start ultrawork loop - continues until completion with ultrawork mode",
     template: `<command-instruction>
${RALPH_LOOP_TEMPLATE}
</command-instruction>

<user-task>
$ARGUMENTS
</user-task>`,
     argumentHint: '"task description" [--completion-promise=TEXT] [--max-iterations=N]',
   },
  "cancel-ralph": {
    description: "(builtin) Cancel active Ralph Loop",
    template: `<command-instruction>
${CANCEL_RALPH_TEMPLATE}
</command-instruction>`,
  },
  refactor: {
    description:
      "(builtin) Intelligent refactoring command with LSP, AST-grep, architecture analysis, codemap, and TDD verification.",
    template: `<command-instruction>
${REFACTOR_TEMPLATE}
</command-instruction>`,
    argumentHint: "<refactoring-target> [--scope=<file|module|project>] [--strategy=<safe|aggressive>]",
  },
  "start-work": {
    description: "(builtin) Start Orchestrator work session from Planner plan",
    template: `<command-instruction>
${START_WORK_TEMPLATE}
</command-instruction>

<session-context>
Session ID: $SESSION_ID
Timestamp: $TIMESTAMP
</session-context>

<user-request>
$ARGUMENTS
</user-request>`,
    argumentHint: "[plan-name]",
  },
  // ─── Design Steering Commands (from impeccable) ────────────────────────────
  "design-audit": {
    description: "(builtin) Full UI/UX design audit using impeccable guidelines",
    template: `<command-instruction>\n${DESIGN_AUDIT_TEMPLATE}\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>`,
    argumentHint: "[target-file-or-component]",
  },
  "design-polish": {
    description: "(builtin) Apply final coat of design refinement",
    template: `<command-instruction>\n${DESIGN_POLISH_TEMPLATE}\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>`,
    argumentHint: "[target-file-or-component]",
  },
  "design-critique": {
    description: "(builtin) Blunt design critique — point out every weakness",
    template: `<command-instruction>\n${DESIGN_CRITIQUE_TEMPLATE}\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>`,
    argumentHint: "[target-file-or-component]",
  },
  "design-normalize": {
    description: "(builtin) Standardize spacing, colors, typography for consistency",
    template: `<command-instruction>\n${DESIGN_NORMALIZE_TEMPLATE}\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>`,
    argumentHint: "[target-file-or-component]",
  },
  "design-animate": {
    description: "(builtin) Add tasteful micro-interactions and animations",
    template: `<command-instruction>\n${DESIGN_ANIMATE_TEMPLATE}\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>`,
    argumentHint: "[target-file-or-component]",
  },
  "design-colorize": {
    description: "(builtin) Fix color system — palette cohesion, contrast, accessibility",
    template: `<command-instruction>\n${DESIGN_COLORIZE_TEMPLATE}\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>`,
    argumentHint: "[target-file-or-component]",
  },
  "design-distill": {
    description: "(builtin) Simplify overcomplicated UI elements",
    template: `<command-instruction>\n${DESIGN_DISTILL_TEMPLATE}\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>`,
    argumentHint: "[target-file-or-component]",
  },
  "design-bolder": {
    description: "(builtin) Make key UI elements more prominent and impactful",
    template: `<command-instruction>\n${DESIGN_BOLDER_TEMPLATE}\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>`,
    argumentHint: "[target-file-or-component]",
  },
  "design-quieter": {
    description: "(builtin) Tone down visual noise, add breathing room",
    template: `<command-instruction>\n${DESIGN_QUIETER_TEMPLATE}\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>`,
    argumentHint: "[target-file-or-component]",
  },
  "design-harden": {
    description: "(builtin) Bulletproof responsive behavior across all breakpoints",
    template: `<command-instruction>\n${DESIGN_HARDEN_TEMPLATE}\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>`,
    argumentHint: "[target-file-or-component]",
  },
}

export function loadBuiltinCommands(
  disabledCommands?: BuiltinCommandName[]
): BuiltinCommands {
  const disabled = new Set(disabledCommands ?? [])
  const commands: BuiltinCommands = {}

  for (const [name, definition] of Object.entries(BUILTIN_COMMAND_DEFINITIONS)) {
    if (!disabled.has(name as BuiltinCommandName)) {
      const { argumentHint: _argumentHint, ...openCodeCompatible } = definition
      commands[name] = { ...openCodeCompatible, name } as CommandDefinition
    }
  }

  return commands
}
