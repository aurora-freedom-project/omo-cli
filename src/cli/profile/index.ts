import { Command } from "commander"
import { listProfiles, applyProfile, getActiveProfile } from "../profile-manager"
import { log } from "../../shared"
import pc from "picocolors"

export function createProfileCommand(): Command {
    const profileCommand = new Command("profile")
        .description("Manage omo-cli configuration profiles")

    profileCommand
        .command("list")
        .description("List all available configuration profiles")
        .action(() => {
            const profiles = listProfiles()
            const active = getActiveProfile()

            if (profiles.length === 0) {
                log("No profiles found in the profiles/ directory.")
                return
            }

            console.log("\nAvailable Profiles:")
            console.log("────────────────────────────────────────")
            
            for (const profile of profiles) {
                const isActive = profile.name === active
                const prefix = isActive ? pc.green("→") : " "
                const nameStr = isActive ? pc.bold(pc.green(profile.name)) : pc.white(profile.name)
                
                console.log(` ${prefix} ${nameStr.padEnd(20)} │ ${pc.gray(profile.summary)}`)
            }
            console.log("────────────────────────────────────────\n")
            
            if (!active) {
                console.log(pc.yellow("⚠ No profile is currently active. Run 'omo-cli profile apply <name>' to activate one."))
            }
        })

    profileCommand
        .command("apply <name>")
        .description("Apply a specific configuration profile")
        .action((name: string) => {
            log(`Applying profile '${name}'...`)
            const result = applyProfile(name)
            
            if (result.success) {
                console.log(pc.green(`✓ Profile '${name}' applied successfully!`))
                console.log(pc.gray(`  Config copied to: ${result.path}`))
                console.log("\nActive models have been updated. Run 'opencode' to start using them.")
            } else {
                console.log(pc.red(`✗ Failed to apply profile '${name}'`))
                if (result.error) {
                    console.log(pc.gray(`  Error: ${result.error}`))
                }
                process.exit(1)
            }
        })

    profileCommand
        .command("active")
        .description("Show the currently active profile")
        .action(() => {
            const active = getActiveProfile()
            if (active) {
                console.log(pc.green(`Currently active profile: `) + pc.bold(pc.white(active)))
            } else {
                console.log(pc.yellow("No profile is currently active."))
                console.log("Run 'omo-cli profile list' to see available profiles.")
            }
        })

    return profileCommand
}
