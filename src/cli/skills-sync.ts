import * as p from "@clack/prompts";
import * as path from "path"
import * as fs from "fs"
import { execSync } from "child_process"
import { getOpenCodeConfigDir, log } from "../shared"
import { SkillValidator } from "../features/opencode-skill-loader/validator";
import { UNIFIED_SKILLS_DIR, ensureUnifiedSkillsDirectory } from "./skills-setup";

export async function syncSkills(force: boolean = false) {
    p.log.info("🔄 Starting Global Skill Synchronization...")

    const REMOTE_REPO = "https://github.com/sickn33/antigravity-awesome-skills.git"
    const TARGET_SUBDIR = "skills"

    const configDir = getOpenCodeConfigDir({ binary: "opencode" })
    const globalSkillsDir = UNIFIED_SKILLS_DIR
    const tmpRepoDir = path.join(configDir, ".tmp_skills_repo")

    // Ensure unified directory and symlink are set up
    ensureUnifiedSkillsDirectory();

    p.log.info(`   Target Directory: ${globalSkillsDir}`)

    // 1. Initialize Shadow Clone (if needed)
    if (!fs.existsSync(path.join(tmpRepoDir, ".git"))) {
        p.log.info("   Initializing Shadow Clone using sparse-checkout...")
        fs.mkdirSync(tmpRepoDir, { recursive: true })

        try {
            execSync("git init", { cwd: tmpRepoDir, stdio: "ignore" })
            execSync(`git remote add origin ${REMOTE_REPO}`, { cwd: tmpRepoDir, stdio: "ignore" })
            execSync("git config core.sparseCheckout true", { cwd: tmpRepoDir, stdio: "ignore" })

            const infoDir = path.join(tmpRepoDir, ".git", "info")
            if (!fs.existsSync(infoDir)) fs.mkdirSync(infoDir, { recursive: true })
            fs.writeFileSync(path.join(infoDir, "sparse-checkout"), `${TARGET_SUBDIR}/\n`)

            p.log.info("   Fetching repository...")
            execSync("git pull origin main", { cwd: tmpRepoDir, stdio: "ignore" })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            p.log.error(`❌ Failed to initialize shadow clone: ${message}`)
            return process.exit(1)
        }
    } else {
        try {
            p.log.info("   Pulling latest updates...")
            execSync("git pull origin main", { cwd: tmpRepoDir, stdio: "ignore" })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            p.log.error(`❌ Failed to update shadow clone: ${message}`)
            return process.exit(1)
        }
    }

    // 2. Determine actual source path (sparse checkout puts it in tmp_repo/skills)
    const sourceSkillsDir = path.join(tmpRepoDir, TARGET_SUBDIR)
    if (!fs.existsSync(sourceSkillsDir)) {
        p.log.error("❌ Failed to find 'skills' directory in the remote repository.")
        return process.exit(1)
    }

    // 3. Run Validator & One-Way Sync
    p.log.info("   Sanitizing and synchronizing skills to global directory...")
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

    p.log.info(`\n✅ Global Skill Sync Complete! Total skills loaded: ${logs.length}`)
    p.log.info(`   → Clean Copies: ${copied}`)
    if (fixed > 0) p.log.info(`   → YAML Fixed: ${fixed}`)
    if (renamed > 0) p.log.info(`   → Duplicates Renamed: ${renamed}`)

    p.log.info("\\nTip: Sub-agents can now dynamically load these skills using 'load_skills=[\"skill-name\"]'")
}
