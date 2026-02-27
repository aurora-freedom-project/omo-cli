#!/usr/bin/env bun
import { Command } from "commander"
import { install } from "./install"
import { run } from "./run"
import { getLocalVersion } from "./get-local-version"
import { doctor } from "./doctor"
import { createMcpOAuthCommand } from "./mcp-oauth"
import { createMemoryCommand } from "./memory"
import { importSkills } from "./import-skills"
import { runSecurityScan } from "./skills-scanner"
import { runCategorization } from "./skills-categorizer"
import { adaptTier, adaptAllTiers } from "./skills-adapter"
import { syncSkills } from "./skills-sync"
import { createIndexCommand } from "./index-codebase"
import type { InstallArgs } from "./types"
import type { RunOptions } from "./run"
import type { GetLocalVersionOptions } from "./get-local-version/types"
import type { DoctorOptions } from "./doctor"
import packageJson from "../../package.json" with { type: "json" }

const VERSION = packageJson.version

const program = new Command()

program
  .name("omo-cli")
  .description("The ultimate OpenCode plugin - multi-model orchestration, LSP tools, and more")
  .version(VERSION, "-v, --version", "Show version number")

program
  .command("install")
  .description("Install and configure omo-cli using profiles")
  .option("--no-tui", "Run in non-interactive mode (requires --profile)")
  .option("-p, --profile <name>", "Apply a profile by name (e.g., mike)")
  .option("--skip-auth", "Skip authentication setup hints")
  .addHelpText("after", `
Examples:
  $ bunx omo-cli install                              # Interactive TUI (profile wizard)
  $ bunx omo-cli install --no-tui --profile=mike      # Non-interactive

Profiles define the active models for each agent and task category.
You can view or create profiles using 'omo-cli profile' commands.
`)
  .action(async (options) => {
    const args: InstallArgs = {
      tui: options.tui !== false,
      profile: options.profile,
      skipAuth: options.skipAuth ?? false,
    }
    const exitCode = await install(args)
    process.exit(exitCode)
  })

program
  .command("run <message>")
  .description("Run opencode with todo/background task completion enforcement")
  .option("-a, --agent <name>", "Agent to use (default: orchestrator)")
  .option("-d, --directory <path>", "Working directory")
  .option("-t, --timeout <ms>", "Timeout in milliseconds (default: 30 minutes)", parseInt)
  .addHelpText("after", `
Examples:
  $ bunx omo-cli run "Fix the bug in index.ts"
  $ bunx omo-cli run --agent orchestrator "Implement feature X"
  $ bunx omo-cli run --timeout 3600000 "Large refactoring task"

Unlike 'opencode run', this command waits until:
  - All todos are completed or cancelled
  - All child sessions (background tasks) are idle
`)
  .action(async (message: string, options) => {
    const runOptions: RunOptions = {
      message,
      agent: options.agent,
      directory: options.directory,
      timeout: options.timeout,
    }
    const exitCode = await run(runOptions)
    process.exit(exitCode)
  })

program
  .command("get-local-version")
  .description("Show current installed version and check for updates")
  .option("-d, --directory <path>", "Working directory to check config from")
  .option("--json", "Output in JSON format for scripting")
  .addHelpText("after", `
Examples:
  $ bunx omo-cli get-local-version
  $ bunx omo-cli get-local-version --json
  $ bunx omo-cli get-local-version --directory /path/to/project

This command shows:
  - Current installed version
  - Latest available version on npm
  - Whether you're up to date
  - Special modes (local dev, pinned version)
`)
  .action(async (options) => {
    const versionOptions: GetLocalVersionOptions = {
      directory: options.directory,
      json: options.json ?? false,
    }
    const exitCode = await getLocalVersion(versionOptions)
    process.exit(exitCode)
  })

program
  .command("doctor")
  .description("Check omo-cli installation health and diagnose issues")
  .option("--verbose", "Show detailed diagnostic information")
  .option("--json", "Output results in JSON format")
  .option("--category <category>", "Run only specific category")
  .addHelpText("after", `
Examples:
  $ bunx omo-cli doctor
  $ bunx omo-cli doctor --verbose
  $ bunx omo-cli doctor --json
  $ bunx omo-cli doctor --category authentication

Categories:
  installation     Check OpenCode and plugin installation
  configuration    Validate configuration files
  authentication   Check auth provider status
  dependencies     Check external dependencies
  tools            Check LSP and MCP servers
  updates          Check for version updates
`)
  .action(async (options) => {
    const doctorOptions: DoctorOptions = {
      verbose: options.verbose ?? false,
      json: options.json ?? false,
      category: options.category,
    }
    const exitCode = await doctor(doctorOptions)
    process.exit(exitCode)
  })

program
  .command("version")
  .description("Show version information")
  .action(() => {
    console.log(`omo-cli v${VERSION}`)
  })

program
  .command("import-skills")
  .description("Import skills from antigravity-awesome-skills library (560+ skills)")
  .option("-s, --skills <names...>", "Import specific skills by name")
  .option("-t, --target <path>", "Target directory (default: ~/.config/_skills_)")
  .option("--tier <number>", "Import skills by tier (1-4, requires categorize-skills first)")
  .option("--audit", "Audit skills structure without importing")
  .option("--valid-only", "Only import valid skills (with proper SKILL.md)")
  .addHelpText("after", `
Examples:
  $ bunx omo-cli import-skills                  # Import ALL skills (default)
  $ bunx omo-cli import-skills --valid-only     # Import ALL valid skills
  $ bunx omo-cli import-skills --audit          # Check skills without importing
  $ bunx omo-cli import-skills --tier 1         # Tier 1: 85 SAFE + Excellent
  $ bunx omo-cli import-skills --tier 2         # Tier 2: 394 SAFE/LOW + Good
  $ bunx omo-cli import-skills --skills brainstorming api-design

Available Tiers (run categorize-skills first):
  Tier 1    85 skills  - SAFE + Excellent quality (recommended start)
  Tier 2   394 skills  - SAFE/LOW + Good quality
  Tier 3   100 skills  - MEDIUM risk
  Tier 4    36 skills  - HIGH risk (manual review required)
`)
  .action(async (options) => {
    const success = await importSkills({
      skills: options.skills,
      targetPath: options.target,
      audit: options.audit,
      validOnly: options.validOnly,
      tier: options.tier ? parseInt(options.tier, 10) : undefined,
    })

    process.exit(success ? 0 : 1)
  })

program
  .command("scan-skills")
  .description("Security and quality scan for skills (run before importing)")
  .option("-o, --output <path>", "Output path for JSON report (default: ./skills_security_report.json)")
  .option("-d, --details", "Show detailed skill list")
  .addHelpText("after", `
Examples:
  $ bunx omo-cli scan-skills
  $ bunx omo-cli scan-skills --details
  $ bunx omo-cli scan-skills --output ./my-report.json

This command scans all 600+ skills for:
  🔴 HIGH risk:   Dangerous commands (rm -rf, sudo, curl|bash)
  🟠 MEDIUM risk: Shell commands, file operations
  🟡 LOW risk:    External URLs, API key references
  🟢 SAFE:        Pure markdown instructions

Plus quality scoring and OMO agent mapping.
`)
  .action(async (options) => {
    await runSecurityScan({
      outputPath: options.output,
      showDetails: options.details,
    })
  })

program
  .command("categorize-skills")
  .description("Categorize skills by tier and agent compatibility (run after scan-skills)")
  .option("-i, --input <path>", "Input scan report path (default: ./skills_security_report.json)")
  .option("-o, --output <path>", "Output path for categorization report")
  .addHelpText("after", `
Examples:
  $ bunx omo-cli categorize-skills
  $ bunx omo-cli categorize-skills --input ./my-scan.json

This command creates:
  📊 Tiered import lists (Tier 1-4 based on risk/quality)
  🤖 Agent-skill assignments (which agent should use which skills)
  📂 Category breakdown (architecture, security, devops, etc.)

Workflow:
  1. scan-skills     → Security & quality scan
  2. categorize-skills → Create import tiers
  3. import-skills --tier 1 → Progressive import
`)
  .action(async (options) => {
    await runCategorization({
      scanReportPath: options.input,
      outputPath: options.output,
    })
  })

program
  .command("adapt-skills")
  .description("Adapt and import skills with OMO metadata (agents, category, tier)")
  .option("--tier <number>", "Adapt specific tier (1-4)")
  .option("--max-tier <number>", "Adapt all tiers up to max (default: 2)")
  .option("-t, --target <path>", "Target directory (default: ~/.config/_skills_)")
  .addHelpText("after", `
Examples:
  $ bunx omo-cli adapt-skills --tier 1         # Tier 1 only (85 skills)
  $ bunx omo-cli adapt-skills --max-tier 2     # Tier 1 + 2 (479 skills)
  $ bunx omo-cli adapt-skills --max-tier 3     # Tier 1-3 (626+ skills)

This command:
  1. Copies skills from cache to target
  2. Enhances SKILL.md with OMO metadata:
     - agents: Which OMO agents should use this skill
     - category: Skill category (architecture, testing, etc.)
     - complexity: low/medium/high
     - tier: 1-4 (quality/safety tier)

Complete Workflow:
  1. scan-skills        → Security & quality scan
  2. categorize-skills  → Create import tiers
  3. adapt-skills       → Import + enhance with OMO metadata
`)
  .action(async (options) => {
    if (options.tier) {
      await adaptTier({
        tier: parseInt(options.tier, 10),
        targetPath: options.target,
      })
    } else {
      await adaptAllTiers({
        maxTier: options.maxTier ? parseInt(options.maxTier, 10) : 2,
        targetPath: options.target,
      })
    }
  })

program
  .command("sync-skills")
  .description("Safely sync global skills from the raw remote agentskills.io standard repo")
  .option("-f, --force", "Force refresh shadow clone")
  .addHelpText("after", `
Examples:
  $ bunx omo-cli sync-skills
  $ bunx omo-cli sync-skills -f

This command uses a Shadow Clone architecture to fetch the latest global skills 
without corrupting local git caches. It automatically applies YAML fixes and 
deduplicates skill names before copying to ~/.config/_skills_.
`)
  .action(async (options) => {
    await syncSkills(options.force)
  })



program.addCommand(createMemoryCommand())
program.addCommand(createMcpOAuthCommand())
program.addCommand(createIndexCommand())

program.parse()
