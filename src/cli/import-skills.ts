/**
 * cli/import-skills.ts - Import skills from antigravity-awesome-skills
 */

import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { parseFrontmatter } from "../shared/frontmatter";
import bundlesData from "../../assets/skill-bundles.json";

const SKILLS_REPO = "https://github.com/sickn33/antigravity-awesome-skills.git";
const DEFAULT_SKILLS_PATH = join(homedir(), ".opencode", "skills");

interface Bundle {
    name: string;
    description: string;
    skills: string[];
}

interface SkillBundles {
    bundles: Record<string, Bundle>;
    categories: Record<string, string[]>;
}

interface SkillIndexEntry {
    id: string;
    path: string;
    name: string;
}

interface SkillValidation {
    id: string;
    hasSkillMd: boolean;
    hasFrontmatter: boolean;
    hasName: boolean;
    hasDescription: boolean;
    status: 'valid' | 'partial' | 'invalid';
    error?: string;
}

interface AuditResult {
    valid: string[];
    partial: string[];
    invalid: string[];
    details: SkillValidation[];
}

const bundles: SkillBundles = bundlesData as SkillBundles;

/**
 * Run git command
 */
async function runGitCommand(args: string[], cwd: string): Promise<{
    success: boolean;
    output: string;
    error?: string;
}> {
    return new Promise((resolve) => {
        const git = spawn("git", args, { cwd, shell: true });

        let stdout = '';
        let stderr = '';

        git.stdout?.on('data', (data) => {
            const str = data.toString();
            stdout += str;
            process.stdout.write(str); // Stream to console
        });

        git.stderr?.on('data', (data) => {
            const str = data.toString();
            stderr += str;
            process.stderr.write(str); // Stream to console
        });

        git.on('close', (code) => {
            resolve({
                success: code === 0,
                output: stdout,
                error: code !== 0 ? stderr : undefined,
            });
        });
    });
}

/**
 * Load available skills from skills_index.json
 */
function loadSkillsIndex(repoPath: string): Set<string> {
    const indexPath = join(repoPath, "skills_index.json");
    if (!existsSync(indexPath)) {
        console.warn("⚠️  skills_index.json not found, skipping validation");
        return new Set();
    }

    try {
        const content = readFileSync(indexPath, 'utf-8');
        const index = JSON.parse(content) as SkillIndexEntry[];
        return new Set(index.map(entry => entry.id));
    } catch (error) {
        console.warn("⚠️  Failed to parse skills_index.json:", error);
        return new Set();
    }
}

/**
 * Get all skill IDs from repository
 */
export function getAllSkillIds(repoPath: string): string[] {
    const skillsDir = join(repoPath, "skills");
    if (!existsSync(skillsDir)) {
        return [];
    }

    try {
        return readdirSync(skillsDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);
    } catch (error) {
        console.error("Failed to read skills directory:", error);
        return [];
    }
}

/**
 * Validate a single skill directory
 */
export function validateSkillDirectory(skillPath: string): SkillValidation {
    const id = basename(skillPath);
    const skillMdPath = join(skillPath, 'SKILL.md');

    // Check if SKILL.md exists
    if (!existsSync(skillMdPath)) {
        return {
            id,
            hasSkillMd: false,
            hasFrontmatter: false,
            hasName: false,
            hasDescription: false,
            status: 'invalid',
            error: 'Missing SKILL.md'
        };
    }

    try {
        const content = readFileSync(skillMdPath, 'utf-8');
        const { data, hadFrontmatter, parseError } = parseFrontmatter<{
            name?: string;
            description?: string;
        }>(content);

        if (parseError) {
            return {
                id,
                hasSkillMd: true,
                hasFrontmatter: false,
                hasName: false,
                hasDescription: false,
                status: 'invalid',
                error: 'Invalid YAML frontmatter'
            };
        }

        const hasName = !!data.name;
        const hasDescription = !!data.description;

        let status: 'valid' | 'partial' | 'invalid';
        if (hasName && hasDescription) {
            status = 'valid';
        } else if (hadFrontmatter) {
            status = 'partial';
        } else {
            status = 'invalid';
        }

        return {
            id,
            hasSkillMd: true,
            hasFrontmatter: hadFrontmatter,
            hasName,
            hasDescription,
            status,
            error: !hasName ? 'Missing name field' : (!hasDescription ? 'Missing description field' : undefined)
        };
    } catch (error) {
        return {
            id,
            hasSkillMd: true,
            hasFrontmatter: false,
            hasName: false,
            hasDescription: false,
            status: 'invalid',
            error: `Failed to read SKILL.md: ${error}`
        };
    }
}

/**
 * Audit all skills in repository
 */
export function auditAllSkills(repoPath: string): AuditResult {
    const skillsDir = join(repoPath, "skills");

    if (!existsSync(skillsDir)) {
        console.error("❌ Skills directory not found");
        return { valid: [], partial: [], invalid: [], details: [] };
    }

    const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

    const results: AuditResult = {
        valid: [],
        partial: [],
        invalid: [],
        details: []
    };

    for (const skillName of skillDirs) {
        const validation = validateSkillDirectory(join(skillsDir, skillName));
        results.details.push(validation);
        results[validation.status].push(skillName);
    }

    return results;
}

/**
 * Display audit results
 */
export function displayAuditResults(results: AuditResult): void {
    const total = results.valid.length + results.partial.length + results.invalid.length;

    console.log(`\n📊 Skills Audit Report\n`);
    console.log(`Total skills scanned: ${total}\n`);
    console.log(`✅ Valid: ${results.valid.length} (ready to import)`);
    console.log(`⚠️  Partial: ${results.partial.length} (missing optional fields)`);
    console.log(`❌ Invalid: ${results.invalid.length} (cannot import)\n`);

    if (results.invalid.length > 0) {
        console.log(`\nInvalid skills:`);
        results.details
            .filter(d => d.status === 'invalid')
            .slice(0, 10) // Show first 10
            .forEach(d => console.log(`   - ${d.id}: ${d.error}`));

        if (results.invalid.length > 10) {
            console.log(`   ... and ${results.invalid.length - 10} more`);
        }
    }

    if (results.partial.length > 0 && results.partial.length <= 10) {
        console.log(`\nPartial skills (missing description):`);
        results.details
            .filter(d => d.status === 'partial')
            .forEach(d => console.log(`   - ${d.id}`));
    }
}

/**
 * Validate skill names against skills_index.json
 */
export function validateSkillNames(
    skillNames: string[],
    availableSkills: Set<string>
): { valid: string[]; invalid: string[] } {
    if (availableSkills.size === 0) {
        return { valid: skillNames, invalid: [] };
    }

    const valid: string[] = [];
    const invalid: string[] = [];

    for (const name of skillNames) {
        // Check both hyphen and underscore versions
        const hyphenName = name.replace(/_/g, "-");
        const underscoreName = name.replace(/-/g, "_");

        if (availableSkills.has(name) ||
            availableSkills.has(hyphenName) ||
            availableSkills.has(underscoreName)) {
            valid.push(name);
        } else {
            invalid.push(name);
        }
    }

    return { valid, invalid };
}

/**
 * Clone or update skills repository
 */
export async function cloneOrUpdateSkillsRepo(targetPath: string): Promise<boolean> {
    console.log(`📦 Checking skills repository at ${targetPath}...`);

    // If directory exists, try to update
    if (existsSync(targetPath)) {
        console.log("📥 Repository exists, updating...");
        const result = await runGitCommand(["pull", "--rebase"], targetPath);

        if (result.success) {
            console.log("✅ Repository updated successfully");
            return true;
        } else {
            console.warn("⚠️  Failed to update repository, will re-clone");
            rmSync(targetPath, { recursive: true, force: true });
        }
    }

    // Clone fresh repository
    console.log("📥 Cloning skills repository...");
    const parentDir = join(targetPath, "..");

    if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
    }

    const result = await runGitCommand(
        ["clone", SKILLS_REPO, targetPath],
        parentDir
    );

    if (result.success) {
        console.log("✅ Repository cloned successfully");
        return true;
    } else {
        console.error("❌ Failed to clone repository:", result.error);
        return false;
    }
}

/**
 * List available bundles
 */
export function listBundles(): void {
    console.log("\n🎁 Available Skill Bundles:\n");

    Object.entries(bundles.bundles).forEach(([key, bundle], index) => {
        console.log(`${index + 1}. ${bundle.name}`);
        console.log(`   ${bundle.description}`);
        console.log(`    Skills: ${bundle.skills.length}`);
        console.log();
    });
}

/**
 * Get bundle by key or list all
 */
export function getBundleSkills(bundleKey: string): string[] | null {
    const bundle = bundles.bundles[bundleKey];
    if (!bundle) {
        console.error(`❌ Bundle '${bundleKey}' not found`);
        console.log("\nAvailable bundles:");
        Object.keys(bundles.bundles).forEach(key => {
            console.log(`  - ${key}`);
        });
        return null;
    }

    return bundle.skills;
}

/**
 * Copy specific skills from repo to target
 */
export function copySkillsToTarget(
    skillsRepoPath: string,
    targetSkillsPath: string,
    skillNames: string[]
): number {
    let copiedCount = 0;

    console.log(`\n📋 Copying ${skillNames.length} skills to ${targetSkillsPath}...\n`);

    if (!existsSync(targetSkillsPath)) {
        mkdirSync(targetSkillsPath, { recursive: true });
    }

    for (const skillName of skillNames) {
        // Try multiple path patterns
        const possiblePaths = [
            join(skillsRepoPath, "skills", skillName),
            join(skillsRepoPath, "skills", skillName.replace(/-/g, "_")),
        ];

        let found = false;
        for (const sourcePath of possiblePaths) {
            if (existsSync(sourcePath)) {
                const targetPath = join(targetSkillsPath, skillName);

                try {
                    cpSync(sourcePath, targetPath, { recursive: true, force: true });
                    console.log(`✅ ${skillName}`);
                    copiedCount++;
                    found = true;
                    break;
                } catch (error) {
                    console.error(`❌ Failed to copy ${skillName}:`, error);
                }
            }
        }

        if (!found) {
            console.warn(`⚠️  ${skillName} (not found in repo)`);
        }
    }

    console.log(`\n✅ Copied ${copiedCount}/${skillNames.length} skills successfully\n`);
    return copiedCount;
}

/**
 * Main import workflow
 */
export async function importSkills(options: {
    bundle?: string;
    skills?: string[];
    targetPath?: string;
    all?: boolean;
    audit?: boolean;
    validOnly?: boolean;
    tier?: number;
}): Promise<boolean> {
    const targetPath = options.targetPath || DEFAULT_SKILLS_PATH;
    const skillsRepoPath = join(homedir(), ".antigravity-skills-cache");

    // Step 1: Clone/update repo
    const repoReady = await cloneOrUpdateSkillsRepo(skillsRepoPath);
    if (!repoReady) {
        return false;
    }

    // Step 2: Handle audit mode
    if (options.audit) {
        console.log("\n🔍 Running skills audit...\n");
        const auditResults = auditAllSkills(skillsRepoPath);
        displayAuditResults(auditResults);
        return true;
    }

    // Step 3: Determine which skills to import
    let skillsToImport: string[] = [];

    // Handle tier-based import
    if (options.tier) {
        const tiersDir = join(process.cwd(), "skills_tiers");
        const tierFiles: Record<number, string> = {
            1: "tier1_core.json",
            2: "tier2_standard.json",
            3: "tier3_extended.json",
            4: "tier4_review.json",
        };

        const tierFile = tierFiles[options.tier];
        if (!tierFile) {
            console.error(`❌ Invalid tier: ${options.tier}. Use 1, 2, 3, or 4.`);
            return false;
        }

        const tierPath = join(tiersDir, tierFile);
        if (!existsSync(tierPath)) {
            console.error(`❌ Tier file not found: ${tierPath}`);
            console.log("Run 'categorize-skills' first to generate tier lists.");
            return false;
        }

        skillsToImport = JSON.parse(readFileSync(tierPath, 'utf-8'));
        console.log(`\n📦 Importing Tier ${options.tier}: ${skillsToImport.length} skills\n`);
    } else if (options.all) {
        // Import all skills
        const allSkills = getAllSkillIds(skillsRepoPath);
        console.log(`\n📦 Found ${allSkills.length} total skills in repository\n`);

        if (options.validOnly) {
            // Validate and filter to only valid skills
            console.log("🔍 Validating skills structure...\n");
            const auditResults = auditAllSkills(skillsRepoPath);
            skillsToImport = [...auditResults.valid, ...auditResults.partial];
            console.log(`✅ ${skillsToImport.length} skills passed validation\n`);

            if (auditResults.invalid.length > 0) {
                console.log(`⚠️  Skipping ${auditResults.invalid.length} invalid skills\n`);
            }
        } else {
            skillsToImport = allSkills;
        }
    } else if (options.bundle) {
        const bundleSkills = getBundleSkills(options.bundle);
        if (!bundleSkills) {
            return false;
        }
        skillsToImport = bundleSkills;
    } else if (options.skills) {
        skillsToImport = options.skills;
    } else {
        console.error("❌ No bundle, skills, or --all specified");
        listBundles();
        return false;
    }

    // Step 4: Validate skills against index (for bundle/skills mode)
    if (!options.all) {
        const availableSkills = loadSkillsIndex(skillsRepoPath);
        const { invalid } = validateSkillNames(skillsToImport, availableSkills);

        if (invalid.length > 0) {
            console.warn(`\n⚠️  The following skills were not found in skills_index.json:`);
            invalid.forEach(name => console.warn(`   - ${name}`));
            console.warn(`These skills may fail to import or have been renamed.\n`);
        }
    }

    // Step 5: Copy skills
    const copiedCount = copySkillsToTarget(skillsRepoPath, targetPath, skillsToImport);

    if (copiedCount > 0) {
        console.log(`🎉 Successfully imported ${copiedCount} skills to ${targetPath}`);
        return true;
    } else {
        console.error("❌ No skills were imported");
        return false;
    }
}
