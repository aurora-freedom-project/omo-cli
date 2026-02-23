import * as path from "path"
import * as fs from "fs"
import { execSync } from "child_process"
import { getOpenCodeConfigDir, log } from "../shared"
import { SkillValidator } from "../features/opencode-skill-loader/validator";

export async function syncSkills(force: boolean = false) {
    console.log("🔄 Starting Global Skill Synchronization...")

    const REMOTE_REPO = "https://github.com/sickn33/antigravity-awesome-skills.git"
    const TARGET_SUBDIR = "skills"

    const configDir = getOpenCodeConfigDir({ binary: "opencode" })
    const globalSkillsDir = path.join(configDir, "skills")
    const tmpRepoDir = path.join(configDir, ".tmp_skills_repo")

    console.log(`   Target Directory: ${globalSkillsDir}`)

    // 1. Initialize Shadow Clone (if needed)
    if (!fs.existsSync(path.join(tmpRepoDir, ".git"))) {
        console.log("   Initializing Shadow Clone using sparse-checkout...")
        fs.mkdirSync(tmpRepoDir, { recursive: true })

        try {
            execSync("git init", { cwd: tmpRepoDir, stdio: "ignore" })
            execSync(`git remote add origin ${REMOTE_REPO}`, { cwd: tmpRepoDir, stdio: "ignore" })
            execSync("git config core.sparseCheckout true", { cwd: tmpRepoDir, stdio: "ignore" })

            const infoDir = path.join(tmpRepoDir, ".git", "info")
            if (!fs.existsSync(infoDir)) fs.mkdirSync(infoDir, { recursive: true })
            fs.writeFileSync(path.join(infoDir, "sparse-checkout"), `${TARGET_SUBDIR}/\n`)

            console.log("   Fetching repository...")
            execSync("git pull origin main", { cwd: tmpRepoDir, stdio: "ignore" })
        } catch (err: any) {
            console.error("❌ Failed to initialize shadow clone:", err.message)
            return process.exit(1)
        }
    } else {
        try {
            console.log("   Pulling latest updates...")
            execSync("git pull origin main", { cwd: tmpRepoDir, stdio: "ignore" })
        } catch (err: any) {
            console.error("❌ Failed to update shadow clone:", err.message)
            return process.exit(1)
        }
    }

    // 2. Determine actual source path (sparse checkout puts it in tmp_repo/skills)
    const sourceSkillsDir = path.join(tmpRepoDir, TARGET_SUBDIR)
    if (!fs.existsSync(sourceSkillsDir)) {
        console.error("❌ Failed to find 'skills' directory in the remote repository.")
        return process.exit(1)
    }

    // 3. Run Validator & One-Way Sync
    console.log("   Sanitizing and synchronizing skills to global directory...")
    const validator = new SkillValidator()
    const logs = await validator.sanitizeAndSync(sourceSkillsDir, globalSkillsDir)

    let fixed = 0
    let renamed = 0
    let copied = 0

    for (const log of logs) {
        if (log.action === "FIXED_YAML") fixed++
        else if (log.action === "RENAMED_DUPLICATE") renamed++
        else copied++
    }

    console.log(`\n✅ Global Skill Sync Complete! Total skills loaded: ${logs.length}`)
    console.log(`   → Clean Copies: ${copied}`)
    if (fixed > 0) console.log(`   → YAML Fixed: ${fixed}`)
    if (renamed > 0) console.log(`   → Duplicates Renamed: ${renamed}`)

    console.log("\\nTip: Sub-agents can now dynamically load these skills using 'load_skills=[\"skill-name\"]'")
}
