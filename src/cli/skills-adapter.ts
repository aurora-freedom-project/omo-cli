/**
 * cli/skills-adapter.ts - Adapt skills to OMO format
 * 
 * Enhances skills with:
 * - OMO agent recommendations
 * - Category tags
 * - Complexity indicators
 * - Standardized frontmatter
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter } from "../shared/frontmatter";
import type { CategorizationReport } from "./skills-categorizer";

interface AdaptedSkillMeta {
    name: string;
    description: string;
    triggers?: string[];
    // OMO-specific additions
    agents?: string[];
    category?: string;
    complexity?: 'low' | 'medium' | 'high';
    tier?: number;
}

interface AdaptationResult {
    skillId: string;
    status: 'adapted' | 'skipped' | 'error';
    changes: string[];
    error?: string;
}

interface AdaptationReport {
    timestamp: string;
    totalProcessed: number;
    adapted: number;
    skipped: number;
    errors: number;
    results: AdaptationResult[];
}

/**
 * Get agent recommendations for a skill
 */
function getAgentRecommendations(
    skillId: string,
    categorizationReport: CategorizationReport
): string[] {
    const agents: string[] = [];

    for (const rec of categorizationReport.agentRecommendations) {
        if (rec.primarySkills.includes(skillId)) {
            agents.push(rec.agent);
        }
    }

    // If no primary agent, add sisyphus as default
    if (agents.length === 0) {
        agents.push('sisyphus');
    }

    return agents.slice(0, 3); // Max 3 agents
}

/**
 * Get category for a skill
 */
function getSkillCategory(
    skillId: string,
    categorizationReport: CategorizationReport
): string {
    for (const [category, skills] of Object.entries(categorizationReport.categories)) {
        if (skills.includes(skillId)) {
            return category;
        }
    }
    return 'general';
}

/**
 * Get tier for a skill
 */
function getSkillTier(
    skillId: string,
    categorizationReport: CategorizationReport
): number {
    if (categorizationReport.tiers.tier1_core.includes(skillId)) return 1;
    if (categorizationReport.tiers.tier2_standard.includes(skillId)) return 2;
    if (categorizationReport.tiers.tier3_extended.includes(skillId)) return 3;
    if (categorizationReport.tiers.tier4_review.includes(skillId)) return 4;
    return 0; // Excluded
}

/**
 * Generate new frontmatter YAML
 */
function generateFrontmatter(meta: AdaptedSkillMeta): string {
    let yaml = '---\n';
    yaml += `name: ${meta.name}\n`;
    yaml += `description: ${meta.description}\n`;

    if (meta.triggers && meta.triggers.length > 0) {
        yaml += 'triggers:\n';
        for (const trigger of meta.triggers) {
            yaml += `  - "${trigger}"\n`;
        }
    }

    if (meta.agents && meta.agents.length > 0) {
        yaml += 'agents:\n';
        for (const agent of meta.agents) {
            yaml += `  - ${agent}\n`;
        }
    }

    if (meta.category) {
        yaml += `category: ${meta.category}\n`;
    }

    if (meta.complexity) {
        yaml += `complexity: ${meta.complexity}\n`;
    }

    if (meta.tier) {
        yaml += `tier: ${meta.tier}\n`;
    }

    yaml += '---\n';
    return yaml;
}

/**
 * Adapt a single skill
 */
export function adaptSkill(
    skillPath: string,
    categorizationReport: CategorizationReport,
    securityReport?: { skills: Array<{ id: string; complexity: string }> }
): AdaptationResult {
    const skillId = basename(skillPath);
    const skillMdPath = join(skillPath, 'SKILL.md');
    const changes: string[] = [];

    if (!existsSync(skillMdPath)) {
        return {
            skillId,
            status: 'error',
            changes: [],
            error: 'Missing SKILL.md',
        };
    }

    try {
        const content = readFileSync(skillMdPath, 'utf-8');
        const { data, body, hadFrontmatter } = parseFrontmatter<{
            name?: string;
            description?: string;
            triggers?: string[];
            agents?: string[];
            category?: string;
            complexity?: string;
            tier?: number;
        }>(content);

        // Check if already adapted
        if (data.agents && data.category && data.tier) {
            return {
                skillId,
                status: 'skipped',
                changes: ['Already adapted'],
            };
        }

        // Get OMO metadata
        const agents = getAgentRecommendations(skillId, categorizationReport);
        const category = getSkillCategory(skillId, categorizationReport);
        const tier = getSkillTier(skillId, categorizationReport);

        // Get complexity from security report
        let complexity: 'low' | 'medium' | 'high' = 'medium';
        if (securityReport) {
            const skillScan = securityReport.skills.find(s => s.id === skillId);
            if (skillScan) {
                complexity = skillScan.complexity as 'low' | 'medium' | 'high';
            }
        }

        // Build new meta
        const newMeta: AdaptedSkillMeta = {
            name: data.name || skillId,
            description: data.description || `Skill for ${skillId}`,
            triggers: data.triggers,
            agents,
            category,
            complexity,
            tier,
        };

        // Track changes
        if (!data.agents) changes.push(`Added agents: ${agents.join(', ')}`);
        if (!data.category) changes.push(`Added category: ${category}`);
        if (!data.tier) changes.push(`Added tier: ${tier}`);
        if (!data.complexity) changes.push(`Added complexity: ${complexity}`);

        // Generate new content
        const newFrontmatter = generateFrontmatter(newMeta);
        const newContent = newFrontmatter + '\n' + body;

        // Write back
        writeFileSync(skillMdPath, newContent);

        return {
            skillId,
            status: 'adapted',
            changes,
        };
    } catch (error) {
        return {
            skillId,
            status: 'error',
            changes: [],
            error: `${error}`,
        };
    }
}

/**
 * Adapt all skills in a tier
 */
export async function adaptTier(options: {
    tier: number;
    categorizationPath?: string;
    securityPath?: string;
    targetPath?: string;
}): Promise<AdaptationReport> {
    const categorizationPath = options.categorizationPath ||
        join(process.cwd(), "skills_categorization_report.json");
    const securityPath = options.securityPath ||
        join(process.cwd(), "skills_security_report.json");
    const targetPath = options.targetPath ||
        join(homedir(), ".agent", "skills");
    const skillsRepoPath = join(homedir(), ".antigravity-skills-cache");

    const report: AdaptationReport = {
        timestamp: new Date().toISOString(),
        totalProcessed: 0,
        adapted: 0,
        skipped: 0,
        errors: 0,
        results: [],
    };

    // Load reports
    if (!existsSync(categorizationPath)) {
        console.error(`❌ Categorization report not found: ${categorizationPath}`);
        console.log("Run 'categorize-skills' first.");
        return report;
    }

    const categorizationReport: CategorizationReport =
        JSON.parse(readFileSync(categorizationPath, 'utf-8'));

    let securityReport: { skills: Array<{ id: string; complexity: string }> } | undefined;
    if (existsSync(securityPath)) {
        securityReport = JSON.parse(readFileSync(securityPath, 'utf-8'));
    }

    // Get skills for tier
    const tierMap: Record<number, string[]> = {
        1: categorizationReport.tiers.tier1_core,
        2: categorizationReport.tiers.tier2_standard,
        3: categorizationReport.tiers.tier3_extended,
        4: categorizationReport.tiers.tier4_review,
    };

    const skillIds = tierMap[options.tier];
    if (!skillIds) {
        console.error(`❌ Invalid tier: ${options.tier}`);
        return report;
    }

    console.log(`\n🔧 Adapting Tier ${options.tier}: ${skillIds.length} skills\n`);

    // Ensure target directory exists
    if (!existsSync(targetPath)) {
        mkdirSync(targetPath, { recursive: true });
    }

    // Process each skill
    for (const skillId of skillIds) {
        const sourcePath = join(skillsRepoPath, "skills", skillId);
        const destPath = join(targetPath, skillId);

        // Copy skill first
        if (existsSync(sourcePath)) {
            cpSync(sourcePath, destPath, { recursive: true, force: true });
        } else {
            report.errors++;
            report.results.push({
                skillId,
                status: 'error',
                changes: [],
                error: 'Source not found',
            });
            continue;
        }

        // Adapt skill
        const result = adaptSkill(destPath, categorizationReport, securityReport);
        report.results.push(result);
        report.totalProcessed++;

        switch (result.status) {
            case 'adapted':
                report.adapted++;
                console.log(`✅ ${skillId} - ${result.changes.join(', ')}`);
                break;
            case 'skipped':
                report.skipped++;
                console.log(`⏭️  ${skillId} - Already adapted`);
                break;
            case 'error':
                report.errors++;
                console.log(`❌ ${skillId} - ${result.error}`);
                break;
        }
    }

    // Summary
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`✅ Adapted: ${report.adapted}`);
    console.log(`⏭️  Skipped: ${report.skipped}`);
    console.log(`❌ Errors: ${report.errors}`);
    console.log(`📦 Total: ${report.totalProcessed}`);
    console.log(`📁 Location: ${targetPath}`);

    return report;
}

/**
 * Adapt all tiers progressively
 */
export async function adaptAllTiers(options: {
    maxTier?: number;
    targetPath?: string;
}): Promise<void> {
    const maxTier = options.maxTier || 2; // Default: Tier 1 + 2

    console.log(`\n🚀 Progressive Skill Adaptation (Tier 1-${maxTier})\n`);

    for (let tier = 1; tier <= maxTier; tier++) {
        console.log(`\n${'='.repeat(40)}`);
        console.log(`📦 TIER ${tier}`);
        console.log(`${'='.repeat(40)}`);

        await adaptTier({
            tier,
            targetPath: options.targetPath,
        });
    }

    console.log(`\n🎉 Adaptation complete!`);
}
