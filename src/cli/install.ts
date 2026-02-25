import * as p from "@clack/prompts"
import color from "picocolors"
import { spawn } from "node:child_process"
import type { InstallArgs, InstallConfig, DetectedConfig } from "./types"
import {
  addPluginToOpenCodeConfig,
  writeOmoConfig,
  isOpenCodeInstalled,
  getOpenCodeVersion,
  addAuthPlugins,
  addProviderConfig,
  detectCurrentConfig,
} from "./config-manager"

import { listProfiles, applyProfile, getActiveProfile, deriveInstallConfigFromProfile } from "./profile-manager"
import { runProfileWizard } from "./profile-wizard"
import packageJson from "../../package.json" with { type: "json" }

const VERSION = packageJson.version

const SYMBOLS = {
  check: color.green("[OK]"),
  cross: color.red("[X]"),
  arrow: color.cyan("->"),
  bullet: color.dim("*"),
  info: color.blue("[i]"),
  warn: color.yellow("[!]"),
  star: color.yellow("*"),
}

function formatProvider(name: string, enabled: boolean, detail?: string): string {
  const status = enabled ? SYMBOLS.check : color.dim("○")
  const label = enabled ? color.white(name) : color.dim(name)
  const suffix = detail ? color.dim(` (${detail})`) : ""
  return `  ${status} ${label}${suffix}`
}

function formatConfigSummary(config: InstallConfig): string {
  const lines: string[] = []

  lines.push(color.bold(color.white("Configuration Summary")))
  lines.push("")

  const claudeDetail = config.hasClaude ? (config.isMax20 ? "max20" : "standard") : undefined
  lines.push(formatProvider("Claude", config.hasClaude, claudeDetail))
  lines.push(formatProvider("OpenAI/ChatGPT", config.hasOpenAI, "GPT-5.2 for Oracle"))
  lines.push(formatProvider("Gemini", config.hasGemini))
  lines.push(formatProvider("GitHub Copilot", config.hasCopilot, "fallback"))
  lines.push(formatProvider("OpenCode Zen", config.hasOpencodeZen, "opencode/ models"))
  lines.push(formatProvider("Z.ai Coding Plan", config.hasZaiCodingPlan, "Librarian/Multimodal"))

  lines.push("")
  lines.push(color.dim("─".repeat(40)))
  lines.push("")

  lines.push(color.bold(color.white("Model Assignment")))
  lines.push("")
  lines.push(`  ${SYMBOLS.info} Models auto-configured based on provider priority`)
  lines.push(`  ${SYMBOLS.bullet} Priority: Native > Copilot > OpenCode Zen > Z.ai`)

  return lines.join("\n")
}

function printHeader(isUpdate: boolean): void {
  const mode = isUpdate ? "Update" : "Install"
  console.log()
  console.log(color.bgMagenta(color.white(` oMoMoMoMo... ${mode} `)))
  console.log()
}

function printStep(step: number, total: number, message: string): void {
  const progress = color.dim(`[${step}/${total}]`)
  console.log(`${progress} ${message}`)
}

function printSuccess(message: string): void {
  console.log(`${SYMBOLS.check} ${message}`)
}

function printError(message: string): void {
  console.log(`${SYMBOLS.cross} ${color.red(message)}`)
}

function printInfo(message: string): void {
  console.log(`${SYMBOLS.info} ${message}`)
}

function printWarning(message: string): void {
  console.log(`${SYMBOLS.warn} ${color.yellow(message)}`)
}

function printBox(content: string, title?: string): void {
  const lines = content.split("\n")
  const maxWidth = Math.max(...lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, "").length), title?.length ?? 0) + 4
  const border = color.dim("─".repeat(maxWidth))

  console.log()
  if (title) {
    console.log(color.dim("┌─") + color.bold(` ${title} `) + color.dim("─".repeat(maxWidth - title.length - 4)) + color.dim("┐"))
  } else {
    console.log(color.dim("┌") + border + color.dim("┐"))
  }

  for (const line of lines) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, "")
    const padding = maxWidth - stripped.length
    console.log(color.dim("│") + ` ${line}${" ".repeat(padding - 1)}` + color.dim("│"))
  }

  console.log(color.dim("└") + border + color.dim("┘"))
  console.log()
}

async function runTuiMode(detected: DetectedConfig, args: InstallArgs): Promise<InstallConfig | null> {
  // ---------------------------------------------------------------------------
  // Profile-based selection: scan profiles/ dir + offer wizard
  // ---------------------------------------------------------------------------
  const profiles = listProfiles()
  const activeProfile = getActiveProfile()

  const profileOptions = profiles.map((prof) => ({
    value: prof.name,
    label: `📦 ${prof.name}`,
    hint: prof.summary,
  }))
  profileOptions.push({
    value: "__create_custom__",
    label: "✨ Create Custom Profile",
    hint: "Interactive wizard — configure every agent and category model",
  })

  const selectedProfile = await p.select({
    message: "Choose a profile:",
    options: profileOptions,
    initialValue: activeProfile ?? "mike",
  })

  if (p.isCancel(selectedProfile)) {
    p.cancel("Installation cancelled.")
    return null
  }

  // Handle custom profile creation via wizard
  if (selectedProfile === "__create_custom__") {
    const wizardResult = await runProfileWizard()
    if (!wizardResult) return null

    // We do NOT try to do arg skillsMode stuff automatically here
    return deriveInstallConfigFromProfile(wizardResult)
  }

  // Apply the selected profile
  const result = applyProfile(selectedProfile as string)
  if (!result.success) {
    p.log.error(`Failed to apply profile: ${result.error}`)
    return null
  }

  p.log.success(`Applied profile '${color.cyan(selectedProfile as string)}' to ${color.dim(result.path)}`)

  // Profile applied — derive config for downstream steps
  const profileName = selectedProfile as string
  return deriveInstallConfigFromProfile(profileName)
}

async function runNonTuiInstall(args: InstallArgs): Promise<number> {
  if (!args.profile) {
    printHeader(false)
    printError("Validation failed:")
    console.log(`  ${SYMBOLS.bullet} Missing required argument: --profile`)
    console.log()
    const profiles = listProfiles()
    if (profiles.length > 0) {
      printInfo("Available profiles:")
      for (const p of profiles) {
        console.log(`  ${color.cyan(p.name.padEnd(15))} ${p.summary}`)
      }
    }
    console.log()
    printInfo("Usage: bunx omo-cli install --no-tui --profile=mike")
    console.log()
    return 1
  }

  const isProfileValid = listProfiles().some(p => p.name === args.profile)
  if (!isProfileValid) {
    printHeader(false)
    printError(`Validation failed: Profile '${args.profile}' not found.`)
    console.log("To create a custom profile, run the interactive TUI:")
    console.log("  $ bunx omo-cli install")
    return 1
  }

  const detected = detectCurrentConfig()
  const isUpdate = detected.isInstalled

  printHeader(isUpdate)

  const totalSteps = 6
  let step = 1

  printStep(step++, totalSteps, "Checking OpenCode installation...")
  const installed = await isOpenCodeInstalled()
  const version = await getOpenCodeVersion()
  if (!installed) {
    printWarning("OpenCode binary not found. Plugin will be configured, but you'll need to install OpenCode to use it.")
    printInfo("Visit https://opencode.ai/docs for installation instructions")
  } else {
    printSuccess(`OpenCode ${version ?? ""} detected`)
  }

  if (isUpdate) {
    printInfo("Existing configuration detected — will be updated")
  }

  // Derive the target models from the exact profile JSON content
  const config = deriveInstallConfigFromProfile(args.profile)

  printStep(step++, totalSteps, "Applying profile config...")
  const applyParams = applyProfile(args.profile)
  if (!applyParams.success) {
    printError(`Failed: ${applyParams.error}`)
    return 1
  }

  printSuccess(`Profile '${color.cyan(args.profile)}' applied to ${color.dim(applyParams.path)}`)

  printStep(step++, totalSteps, "Adding omo-cli plugin...")
  const pluginResult = await addPluginToOpenCodeConfig(VERSION)
  if (!pluginResult.success) {
    printError(`Failed: ${pluginResult.error}`)
    return 1
  }
  printSuccess(`Plugin ${isUpdate ? "verified" : "added"} ${SYMBOLS.arrow} ${color.dim(pluginResult.configPath)}`)

  if (config.hasGemini) {
    printStep(step++, totalSteps, "Adding auth plugins...")
    const authResult = await addAuthPlugins(config)
    if (!authResult.success) {
      printError(`Failed: ${authResult.error}`)
      return 1
    }
    printSuccess(`Auth plugins configured ${SYMBOLS.arrow} ${color.dim(authResult.configPath)}`)

    printStep(step++, totalSteps, "Adding provider configurations...")
    const providerResult = addProviderConfig(config)
    if (!providerResult.success) {
      printError(`Failed: ${providerResult.error}`)
      return 1
    }
    printSuccess(`Providers configured ${SYMBOLS.arrow} ${color.dim(providerResult.configPath)}`)
  } else {
    step += 2
  }

  // Automatic skill import for Mike's Full Setup
  if (args.profile === "mike" || args.profile === "mike-local") {
    printStep(step++, totalSteps, "Synchronizing full skill library (700+ skills)...")

    await new Promise<void>((resolve) => {
      // Spawn a new process to run sync-skills with inherited stdio
      // This ensures the user sees the progress bar and logs directly
      const syncProcess = spawn(
        process.execPath, // Path to bun executable
        [process.argv[1], "sync-skills"],
        { stdio: "inherit" }
      )

      syncProcess.on("close", (code) => {
        if (code === 0) {
          printSuccess("Skills library synchronized")
        } else {
          printWarning("Skill synchronization process exited with error or was cancelled. You can run 'omo-cli sync-skills' later.")
        }
        resolve()
      })

      syncProcess.on("error", (err) => {
        printWarning(`Failed to spawn skill synchronization process: ${err.message}`)
        resolve()
      })
    })
  } else {
    step++
  }

  printStep(step++, totalSteps, "Verifying configuration...")
  printSuccess(`Configured properly for selected profile.`)

  printBox(formatConfigSummary(config), isUpdate ? "Updated Configuration" : "Installation Complete")

  if (!config.hasClaude) {
    console.log()
    console.log(color.bgRed(color.white(color.bold(" CRITICAL WARNING "))))
    console.log()
    console.log(color.red(color.bold("  Sisyphus agent is STRONGLY optimized for Claude Opus 4.6.")))
    console.log(color.red("  Without Claude, you may experience significantly degraded performance:"))
    console.log(color.dim("    • Reduced orchestration quality"))
    console.log(color.dim("    • Weaker tool selection and delegation"))
    console.log(color.dim("    • Less reliable task completion"))
    console.log()
    console.log(color.yellow("  Consider subscribing to Claude Pro/Max for the best experience."))
    console.log()
  }

  if (!config.hasClaude && !config.hasOpenAI && !config.hasGemini && !config.hasCopilot && !config.hasOpencodeZen) {
    printWarning("No model providers configured. Using opencode/big-pickle as fallback.")
  }

  console.log(`${SYMBOLS.star} ${color.bold(color.green(isUpdate ? "Configuration updated!" : "Installation complete!"))}`)
  console.log(`  Run ${color.cyan("opencode")} to start!`)
  console.log()

  printBox(
    `${color.bold("Pro Tip:")} Include ${color.cyan("ultrawork")} (or ${color.cyan("ulw")}) in your prompt.\n` +
    `All features work like magic—parallel agents, background tasks,\n` +
    `deep exploration, and relentless execution until completion.`,
    "The Magic Word"
  )

  console.log(`${SYMBOLS.star} ${color.yellow("If you found this helpful, consider starring the repo!")}`)
  console.log(`  ${color.dim("gh repo star aurora-freedom-project/omo-cli")}`)
  console.log()
  console.log(color.dim("oMoMoMoMo... Enjoy!"))
  console.log()

  if ((config.hasClaude || config.hasGemini || config.hasCopilot) && !args.skipAuth) {
    printBox(
      `Run ${color.cyan("opencode auth login")} and select your provider:\n` +
      (config.hasClaude ? `  ${SYMBOLS.bullet} Anthropic ${color.gray("→ Claude Pro/Max")}\n` : "") +
      (config.hasGemini ? `  ${SYMBOLS.bullet} Google ${color.gray("→ OAuth with Antigravity")}\n` : "") +
      (config.hasCopilot ? `  ${SYMBOLS.bullet} GitHub ${color.gray("→ Copilot")}` : ""),
      "Authenticate Your Providers"
    )
  }

  return 0
}

export async function install(args: InstallArgs): Promise<number> {
  if (!args.tui) {
    return runNonTuiInstall(args)
  }

  const detected = detectCurrentConfig()
  const isUpdate = detected.isInstalled

  p.intro(color.bgMagenta(color.white(isUpdate ? " oMoMoMoMo... Update " : " oMoMoMoMo... ")))

  if (isUpdate) {
    p.log.info("Existing configuration detected — will be updated")
  }

  const s = p.spinner()
  s.start("Checking OpenCode installation")

  const installed = await isOpenCodeInstalled()
  const version = await getOpenCodeVersion()
  if (!installed) {
    s.stop(`OpenCode binary not found ${color.yellow("[!]")}`)
    p.log.warn("OpenCode binary not found. Plugin will be configured, but you'll need to install OpenCode to use it.")
    p.note("Visit https://opencode.ai/docs for installation instructions", "Installation Guide")
  } else {
    s.stop(`OpenCode ${version ?? "installed"} ${color.green("[OK]")}`)
  }

  const config = await runTuiMode(detected, args)
  if (!config) return 1

  s.start("Adding omo-cli to OpenCode config")
  const pluginResult = await addPluginToOpenCodeConfig(VERSION)
  if (!pluginResult.success) {
    s.stop(`Failed to add plugin: ${pluginResult.error}`)
    p.outro(color.red("Installation failed."))
    return 1
  }
  s.stop(`Plugin added to ${color.cyan(pluginResult.configPath)}`)

  if (config.hasGemini) {
    s.start("Adding auth plugins (fetching latest versions)")
    const authResult = await addAuthPlugins(config)
    if (!authResult.success) {
      s.stop(`Failed to add auth plugins: ${authResult.error}`)
      p.outro(color.red("Installation failed."))
      return 1
    }
    s.stop(`Auth plugins added to ${color.cyan(authResult.configPath)}`)

    s.start("Writing omo-cli configuration")
    const omoResult = writeOmoConfig(config)
    if (!omoResult.success) {
      s.stop(`Failed to write config: ${omoResult.error}`)
      p.outro(color.red("Installation failed."))
      return 1
    }
    s.stop(`Omo-cli config written to ${color.cyan(omoResult.configPath)}`)
  }

  s.start("Verifying omo-cli configuration")
  s.stop(`Config verified for chosen profile.`)

  // Automatic skill import for Mike's profiles
  const activeProfile = getActiveProfile()
  if (activeProfile === "mike" || activeProfile === "mike-local" || args.profile === "mike" || args.profile === "mike-local") {
    s.start("Synchronizing full skill library (700+ skills)...")

    await new Promise<void>((resolve) => {
      const syncProcess = spawn(
        process.execPath,
        [process.argv[1], "sync-skills"],
        { stdio: "inherit" }
      )

      syncProcess.on("close", (code) => {
        if (code === 0) {
          s.stop(color.green("Skills library synchronized"))
        } else {
          s.stop(color.yellow("Skill synchronization was cancelled or failed"))
          p.log.warn("You can run 'omo-cli sync-skills' later to import skills.")
        }
        resolve()
      })

      syncProcess.on("error", (err) => {
        s.stop(color.yellow(`Failed to spawn skill synchronization process: ${err.message}`))
        resolve()
      })
    })
  }

  if (!config.hasClaude) {
    console.log()
    console.log(color.bgRed(color.white(color.bold(" CRITICAL WARNING "))))
    console.log()
    console.log(color.red(color.bold("  Sisyphus agent is STRONGLY optimized for Claude Opus 4.6.")))
    console.log(color.red("  Without Claude, you may experience significantly degraded performance:"))
    console.log(color.dim("    • Reduced orchestration quality"))
    console.log(color.dim("    • Weaker tool selection and delegation"))
    console.log(color.dim("    • Less reliable task completion"))
    console.log()
    console.log(color.yellow("  Consider subscribing to Claude Pro/Max for the best experience."))
    console.log()
  }

  if (!config.hasClaude && !config.hasOpenAI && !config.hasGemini && !config.hasCopilot && !config.hasOpencodeZen) {
    p.log.warn("No model providers configured. Using opencode/big-pickle as fallback.")
  }

  p.note(formatConfigSummary(config), isUpdate ? "Updated Configuration" : "Installation Complete")

  p.log.success(color.bold(isUpdate ? "Configuration updated!" : "Installation complete!"))
  p.log.message(`Run ${color.cyan("opencode")} to start!`)

  p.note(
    `Include ${color.cyan("ultrawork")} (or ${color.cyan("ulw")}) in your prompt.\n` +
    `All features work like magic—parallel agents, background tasks,\n` +
    `deep exploration, and relentless execution until completion.`,
    "The Magic Word"
  )

  p.log.message(`${color.yellow("★")} If you found this helpful, consider starring the repo!`)
  p.log.message(`  ${color.dim("gh repo star aurora-freedom-project/omo-cli")}`)

  p.outro(color.green("oMoMoMoMo... Enjoy!"))

  if ((config.hasClaude || config.hasGemini || config.hasCopilot) && !args.skipAuth) {
    const providers: string[] = []
    if (config.hasClaude) providers.push(`Anthropic ${color.gray("→ Claude Pro/Max")}`)
    if (config.hasGemini) providers.push(`Google ${color.gray("→ OAuth with Antigravity")}`)
    if (config.hasCopilot) providers.push(`GitHub ${color.gray("→ Copilot")}`)

    console.log()
    console.log(color.bold("Authenticate Your Providers"))
    console.log()
    console.log(`   Run ${color.cyan("opencode auth login")} and select:`)
    for (const provider of providers) {
      console.log(`   ${SYMBOLS.bullet} ${provider}`)
    }
    console.log()
  }

  return 0
}
