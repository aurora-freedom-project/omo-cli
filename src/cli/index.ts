#!/usr/bin/env bun
import { Command } from "commander"
import { install } from "./install"
import { run } from "./run"
import { getLocalVersion } from "./get-local-version"
import { doctor } from "./doctor"
import { createMcpOAuthCommand } from "./mcp-oauth"
import { importSkills, listBundles } from "./import-skills"
import { runSecurityScan } from "./skills-scanner"
import { runCategorization } from "./skills-categorizer"
import { adaptTier, adaptAllTiers } from "./skills-adapter"
import type { InstallArgs } from "./types"
import type { RunOptions } from "./run"
import type { GetLocalVersionOptions } from "./get-local-version/types"
import type { DoctorOptions } from "./doctor"
import packageJson from "../../package.json" with { type: "json" }

const VERSION = packageJson.version

const program = new Command()

program
  .name("oh-my-opencode")
  .description("The ultimate OpenCode plugin - multi-model orchestration, LSP tools, and more")
  .version(VERSION, "-v, --version", "Show version number")

program
  .command("install")
  .description("Install and configure oh-my-opencode with interactive setup")
  .option("--no-tui", "Run in non-interactive mode (requires all options)")
  .option("--claude <value>", "Claude subscription: no, yes, max20")
  .option("--openai <value>", "OpenAI/ChatGPT subscription: no, yes (default: no)")
  .option("--gemini <value>", "Gemini integration: no, yes")
  .option("--copilot <value>", "GitHub Copilot subscription: no, yes")
  .option("--opencode-zen <value>", "OpenCode Zen access: no, yes (default: no)")
  .option("--zai-coding-plan <value>", "Z.ai Coding Plan subscription: no, yes (default: no)")
  .option("--skip-auth", "Skip authentication setup hints")
  .addHelpText("after", `
Examples:
  $ bunx oh-my-opencode install
  $ bunx oh-my-opencode install --no-tui --claude=max20 --openai=yes --gemini=yes --copilot=no
  $ bunx oh-my-opencode install --no-tui --claude=no --gemini=no --copilot=yes --opencode-zen=yes

Model Providers (Priority: Native > Copilot > OpenCode Zen > Z.ai):
  Claude        Native anthropic/ models (Opus, Sonnet, Haiku)
  OpenAI        Native openai/ models (GPT-5.2 for Oracle)
  Gemini        Native google/ models (Gemini 3 Pro, Flash)
  Copilot       github-copilot/ models (fallback)
  OpenCode Zen  opencode/ models (opencode/claude-opus-4-5, etc.)
  Z.ai          zai-coding-plan/glm-4.7 (Librarian priority)
`)
  .action(async (options) => {
    const args: InstallArgs = {
      tui: options.tui !== false,
      claude: options.claude,
      openai: options.openai,
      gemini: options.gemini,
      copilot: options.copilot,
      opencodeZen: options.opencodeZen,
      zaiCodingPlan: options.zaiCodingPlan,
      skipAuth: options.skipAuth ?? false,
    }
    const exitCode = await install(args)
    process.exit(exitCode)
  })

program
  .command("run <message>")
  .description("Run opencode with todo/background task completion enforcement")
  .option("-a, --agent <name>", "Agent to use (default: Sisyphus)")
  .option("-d, --directory <path>", "Working directory")
  .option("-t, --timeout <ms>", "Timeout in milliseconds (default: 30 minutes)", parseInt)
  .addHelpText("after", `
Examples:
  $ bunx oh-my-opencode run "Fix the bug in index.ts"
  $ bunx oh-my-opencode run --agent Sisyphus "Implement feature X"
  $ bunx oh-my-opencode run --timeout 3600000 "Large refactoring task"

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
  $ bunx oh-my-opencode get-local-version
  $ bunx oh-my-opencode get-local-version --json
  $ bunx oh-my-opencode get-local-version --directory /path/to/project

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
  .description("Check oh-my-opencode installation health and diagnose issues")
  .option("--verbose", "Show detailed diagnostic information")
  .option("--json", "Output results in JSON format")
  .option("--category <category>", "Run only specific category")
  .addHelpText("after", `
Examples:
  $ bunx oh-my-opencode doctor
  $ bunx oh-my-opencode doctor --verbose
  $ bunx oh-my-opencode doctor --json
  $ bunx oh-my-opencode doctor --category authentication

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
    console.log(`oh-my-opencode v${VERSION}`)
  })

program
  .command("import-skills")
  .description("Import skills from antigravity-awesome-skills library (560+ skills)")
  .option("-b, --bundle <name>", "Import a skill bundle (essentials, web-dev, security, devops, etc.)")
  .option("-s, --skills <names...>", "Import specific skills by name")
  .option("-t, --target <path>", "Target directory (default: ~/.agent/skills)")
  .option("-l, --list", "List available bundles")
  .option("-a, --all", "Import ALL skills from repository (616)")
  .option("--tier <number>", "Import skills by tier (1-4, requires categorize-skills first)")
  .option("--audit", "Audit skills structure without importing")
  .option("--valid-only", "With --all: only import valid skills (with proper SKILL.md)")
  .addHelpText("after", `
Examples:
  $ bunx oh-my-opencode import-skills --list
  $ bunx oh-my-opencode import-skills --audit
  $ bunx oh-my-opencode import-skills --tier 1        # Tier 1: 85 SAFE + Excellent
  $ bunx oh-my-opencode import-skills --tier 2        # Tier 2: 394 SAFE/LOW + Good
  $ bunx oh-my-opencode import-skills --all
  $ bunx oh-my-opencode import-skills --all --valid-only
  $ bunx oh-my-opencode import-skills --bundle essentials
  $ bunx oh-my-opencode import-skills --skills brainstorming api-design

Available Tiers (run categorize-skills first):
  Tier 1    85 skills  - SAFE + Excellent quality (recommended start)
  Tier 2   394 skills  - SAFE/LOW + Good quality
  Tier 3   100 skills  - MEDIUM risk
  Tier 4    36 skills  - HIGH risk (manual review required)

Available Bundles:
  essentials    Core skills for everyone (brainstorming, planning, clean code)
  web-dev       Frontend and full-stack web development
  security      Security testing, auditing, and best practices
  devops        Infrastructure, deployment, and automation
  backend       Server-side development and APIs
  data-ai       Data processing, ML, and AI applications
  testing       Testing, quality assurance, and automation
`)
  .action(async (options) => {
    if (options.list) {
      listBundles()
      process.exit(0)
    }

    const success = await importSkills({
      bundle: options.bundle,
      skills: options.skills,
      targetPath: options.target,
      all: options.all,
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
  $ bunx oh-my-opencode scan-skills
  $ bunx oh-my-opencode scan-skills --details
  $ bunx oh-my-opencode scan-skills --output ./my-report.json

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
  $ bunx oh-my-opencode categorize-skills
  $ bunx oh-my-opencode categorize-skills --input ./my-scan.json

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
  .option("-t, --target <path>", "Target directory (default: ~/.agent/skills)")
  .addHelpText("after", `
Examples:
  $ bunx oh-my-opencode adapt-skills --tier 1         # Tier 1 only (85 skills)
  $ bunx oh-my-opencode adapt-skills --max-tier 2     # Tier 1 + 2 (479 skills)
  $ bunx oh-my-opencode adapt-skills --max-tier 3     # Tier 1-3 (579 skills)

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

program.addCommand(createMcpOAuthCommand())

program.parse()
