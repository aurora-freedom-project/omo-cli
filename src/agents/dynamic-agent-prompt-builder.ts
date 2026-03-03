import type { AgentPromptMetadata, BuiltinAgentName } from "./types"

/** Metadata about an available agent for prompt building. */
export interface AvailableAgent {
  name: BuiltinAgentName
  description: string
  metadata: AgentPromptMetadata
}

/** Metadata about an available tool for prompt building. */
export interface AvailableTool {
  name: string
  category: "lsp" | "ast" | "search" | "session" | "command" | "other"
}

/** Metadata about an available skill for prompt building. */
export interface AvailableSkill {
  name: string
  description: string
  location: "user" | "project" | "plugin"
}

/** Metadata about a task category for prompt building. */
export interface AvailableCategory {
  name: string
  description: string
}

/** Categorizes tool names into typed tool objects (lsp, ast, search, etc.). */
export function categorizeTools(toolNames: string[]): AvailableTool[] {
  return toolNames.map((name) => {
    let category: AvailableTool["category"] = "other"
    if (name.startsWith("lsp_")) {
      category = "lsp"
    } else if (name.startsWith("ast_grep")) {
      category = "ast"
    } else if (name === "grep" || name === "glob") {
      category = "search"
    } else if (name.startsWith("session_")) {
      category = "session"
    } else if (name === "slashcommand") {
      category = "command"
    }
    return { name, category }
  })
}

/** Formats categorized tools into a prompt section for agent system prompts. */
export function formatToolsForPrompt(tools: AvailableTool[]): string {
  const lspTools = tools.filter((t) => t.category === "lsp")
  const astTools = tools.filter((t) => t.category === "ast")
  const searchTools = tools.filter((t) => t.category === "search")

  const parts: string[] = []

  if (searchTools.length > 0) {
    parts.push(...searchTools.map((t) => `\`${t.name}\``))
  }

  if (lspTools.length > 0) {
    parts.push("`lsp_*`")
  }

  if (astTools.length > 0) {
    parts.push("`ast_grep`")
  }

  return parts.join(", ")
}

/** Builds a section listing key triggers for agent delegation. */
export function buildKeyTriggersSection(agents: AvailableAgent[], _skills: AvailableSkill[] = []): string {
  const keyTriggers = agents
    .filter((a) => a.metadata.keyTrigger)
    .map((a) => `- ${a.metadata.keyTrigger}`)

  if (keyTriggers.length === 0) return ""

  return `### Key Triggers (check BEFORE classification):

${keyTriggers.join("\n")}
- **"Look into" + "create PR"** → Not just research. Full implementation cycle expected.`
}

/** Builds the tool selection decision table for agent prompts. */
export function buildToolSelectionTable(
  agents: AvailableAgent[],
  tools: AvailableTool[] = [],
  _skills: AvailableSkill[] = []
): string {
  const rows: string[] = [
    "### Tool & Agent Selection:",
    "",
  ]

  rows.push("| Resource | Cost | When to Use |")
  rows.push("|----------|------|-------------|")

  if (tools.length > 0) {
    const toolsDisplay = formatToolsForPrompt(tools)
    rows.push(`| ${toolsDisplay} | FREE | Not Complex, Scope Clear, No Implicit Assumptions |`)
  }

  const costOrder = { FREE: 0, CHEAP: 1, EXPENSIVE: 2 }
  const sortedAgents = [...agents]
    .filter((a) => a.metadata.category !== "utility")
    .sort((a, b) => costOrder[a.metadata.cost] - costOrder[b.metadata.cost])

  for (const agent of sortedAgents) {
    const shortDesc = agent.description.split(".")[0] || agent.description
    rows.push(`| \`${agent.name}\` agent | ${agent.metadata.cost} | ${shortDesc} |`)
  }

  rows.push("")
  rows.push("**Default flow**: explorer/researcher (background) + tools → architect (if required)")

  return rows.join("\n")
}

export function buildExploreSection(agents: AvailableAgent[]): string {
  const exploreAgent = agents.find((a) => a.name === "explorer")
  if (!exploreAgent) return ""

  const useWhen = exploreAgent.metadata.useWhen || []
  const avoidWhen = exploreAgent.metadata.avoidWhen || []

  return `### Explorer Agent = Contextual Grep

Use it as a **peer tool**, not a fallback. Fire liberally.

| Use Direct Tools | Use Explorer Agent |
|------------------|-------------------|
${avoidWhen.map((w) => `| ${w} |  |`).join("\n")}
${useWhen.map((w) => `|  | ${w} |`).join("\n")}`
}

export function buildResearcherSection(agents: AvailableAgent[]): string {
  const researcherAgent = agents.find((a) => a.name === "researcher")
  if (!researcherAgent) return ""

  const useWhen = researcherAgent.metadata.useWhen || []

  return `### Researcher Agent = Reference Grep

Search **external references** (docs, OSS, web). Fire proactively when unfamiliar libraries are involved.

| Contextual Grep (Internal) | Reference Grep (External) |
|----------------------------|---------------------------|
| Search OUR codebase | Search EXTERNAL resources |
| Find patterns in THIS repo | Find examples in OTHER repos |
| How does our code work? | How does this library work? |
| Project-specific logic | Official API documentation |
| | Library best practices & quirks |
| | OSS implementation examples |

**Trigger phrases** (fire researcher immediately):
${useWhen.map((w) => `- "${w}"`).join("\n")}`
}

export function buildDelegationTable(agents: AvailableAgent[]): string {
  const rows: string[] = [
    "### Delegation Table:",
    "",
    "| Domain | Delegate To | Trigger |",
    "|--------|-------------|---------|",
  ]

  for (const agent of agents) {
    for (const trigger of agent.metadata.triggers) {
      rows.push(`| ${trigger.domain} | \`${agent.name}\` | ${trigger.trigger} |`)
    }
  }

  return rows.join("\n")
}

export function buildCategorySkillsDelegationGuide(categories: AvailableCategory[], skills: AvailableSkill[]): string {
  if (categories.length === 0 && skills.length === 0) return ""

  const categoryRows = categories.map((c) => {
    const desc = c.description || c.name
    return `| \`${c.name}\` | ${desc} |`
  })

  const skillRows = skills.map((s) => {
    const desc = s.description.split(".")[0] || s.description
    return `| \`${s.name}\` | ${desc} |`
  })

  return `### Category + Skills Delegation System

**delegate_task() combines categories and skills for optimal task execution.**

#### Available Categories (Domain-Optimized Models)

Each category is configured with a model optimized for that domain. Read the description to understand when to use it.

| Category | Domain / Best For |
|----------|-------------------|
${categoryRows.join("\n")}

#### Available Skills (Domain Expertise Injection)

Skills inject specialized instructions into the subagent. Read the description to understand when each skill applies.

| Skill | Expertise Domain |
|-------|------------------|
${skillRows.join("\n")}

---

### MANDATORY: Category + Skill Selection Protocol

**STEP 1: Select Category**
- Read each category's description
- Match task requirements to category domain
- Select the category whose domain BEST fits the task

**STEP 2: Evaluate ALL Skills**
For EVERY skill listed above, ask yourself:
> "Does this skill's expertise domain overlap with my task?"

- If YES → INCLUDE in \`load_skills=[...]\`
- If NO → You MUST justify why (see below)

**STEP 3: Justify Omissions**

If you choose NOT to include a skill that MIGHT be relevant, you MUST provide:

\`\`\`
SKILL EVALUATION for "[skill-name]":
- Skill domain: [what the skill description says]
- Task domain: [what your task is about]
- Decision: OMIT
- Reason: [specific explanation of why domains don't overlap]
\`\`\`

**WHY JUSTIFICATION IS MANDATORY:**
- Forces you to actually READ skill descriptions
- Prevents lazy omission of potentially useful skills
- Subagents are STATELESS - they only know what you tell them
- Missing a relevant skill = suboptimal output

---

### Delegation Pattern

\`\`\`typescript
delegate_task(
  category="[selected-category]",
  load_skills=["skill-1", "skill-2"],  // Include ALL relevant skills
  prompt="..."
)
\`\`\`

**ANTI-PATTERN (will produce poor results):**
\`\`\`typescript
delegate_task(category="...", load_skills=[], prompt="...")  // Empty load_skills without justification
\`\`\``
}

export function buildArchitectSection(agents: AvailableAgent[]): string {
  const advisorAgent = agents.find((a) => a.name === "architect")
  if (!advisorAgent) return ""

  const useWhen = advisorAgent.metadata.useWhen || []
  const avoidWhen = advisorAgent.metadata.avoidWhen || []

  return `<Architect_Usage>
## Architect — Read-Only High-IQ Consultant

Architect is a read-only, expensive, high-quality reasoning model for debugging and architecture. Consultation only.

### WHEN to Consult:

| Trigger | Action |
|---------|--------|
${useWhen.map((w) => `| ${w} | Architect FIRST, then implement |`).join("\n")}

### WHEN NOT to Consult:

${avoidWhen.map((w) => `- ${w}`).join("\n")}

### Usage Pattern:
Briefly announce "Consulting Architect for [reason]" before invocation.

**Exception**: This is the ONLY case where you announce before acting. For all other work, start immediately without status updates.
</Architect_Usage>`
}

/** Builds the hard blocks section listing forbidden actions for agents. */
export function buildHardBlocksSection(): string {
  const blocks = [
    "| Type error suppression (`as any`, `@ts-ignore`) | Never |",
    "| Commit without explicit request | Never |",
    "| Speculate about unread code | Never |",
    "| Leave code in broken state after failures | Never |",
  ]

  return `## Hard Blocks (NEVER violate)

| Constraint | No Exceptions |
|------------|---------------|
${blocks.join("\n")}`
}

/** Builds the anti-patterns section warning agents about common mistakes. */
export function buildAntiPatternsSection(): string {
  const patterns = [
    "| **Type Safety** | `as any`, `@ts-ignore`, `@ts-expect-error` |",
    "| **Error Handling** | Empty catch blocks `catch(e) {}` |",
    "| **Testing** | Deleting failing tests to \"pass\" |",
    "| **Search** | Firing agents for single-line typos or obvious syntax errors |",
    "| **Debugging** | Shotgun debugging, random changes |",
  ]

  return `## Anti-Patterns (BLOCKING violations)

| Category | Forbidden |
|----------|-----------|
${patterns.join("\n")}`
}

/**
 * Builds the complete UltraWork delegation prompt section.
 * Combines all sub-sections into a comprehensive system prompt.
 */
export function buildUltraworkSection(
  agents: AvailableAgent[],
  categories: AvailableCategory[],
  skills: AvailableSkill[]
): string {
  const lines: string[] = []

  if (categories.length > 0) {
    lines.push("**Categories** (for implementation tasks):")
    for (const cat of categories) {
      const shortDesc = cat.description || cat.name
      lines.push(`- \`${cat.name}\`: ${shortDesc}`)
    }
    lines.push("")
  }

  if (skills.length > 0) {
    lines.push("**Skills** (combine with categories - EVALUATE ALL for relevance):")
    for (const skill of skills) {
      const shortDesc = skill.description.split(".")[0] || skill.description
      lines.push(`- \`${skill.name}\`: ${shortDesc}`)
    }
    lines.push("")
  }

  if (agents.length > 0) {
    const ultraworkAgentPriority = ["explorer", "researcher", "plan", "architect"]
    const sortedAgents = [...agents].sort((a, b) => {
      const aIdx = ultraworkAgentPriority.indexOf(a.name)
      const bIdx = ultraworkAgentPriority.indexOf(b.name)
      if (aIdx === -1 && bIdx === -1) return 0
      if (aIdx === -1) return 1
      if (bIdx === -1) return -1
      return aIdx - bIdx
    })

    lines.push("**Agents** (for specialized consultation/exploration):")
    for (const agent of sortedAgents) {
      const shortDesc = agent.description.split(".")[0] || agent.description
      const suffix = agent.name === "explorer" || agent.name === "researcher" ? " (multiple)" : ""
      lines.push(`- \`${agent.name}${suffix}\`: ${shortDesc}`)
    }
  }

  return lines.join("\n")
}
