/**
 * cli/skills-categorizer.ts - Categorize and tier skills for progressive import
 * 
 * Uses scan results to create import tiers and agent assignments
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ScanReport, SkillScanResult } from "./skills-scanner";

// Tier definitions
export interface TierDefinition {
    name: string;
    description: string;
    criteria: (skill: SkillScanResult) => boolean;
    skills: string[];
}

// Category definitions for OMO agents
export interface AgentCategory {
    agent: string;
    description: string;
    primarySkills: string[];
    secondarySkills: string[];
}

export interface CategorizationReport {
    timestamp: string;
    totalSkills: number;

    // Tiered import lists
    tiers: {
        tier1_core: string[];      // SAFE + Excellent quality
        tier2_standard: string[];  // SAFE/LOW + Good quality
        tier3_extended: string[];  // MEDIUM + any quality
        tier4_review: string[];    // HIGH risk - manual review
        excluded: string[];        // Invalid/broken
    };

    // Agent-specific recommendations
    agentRecommendations: AgentCategory[];

    // Skill categories
    categories: Record<string, string[]>;
}

// Skill category keywords
const CATEGORY_KEYWORDS: Record<string, string[]> = {
    'architecture': ['architecture', 'design', 'system', 'c4', 'diagram', 'blueprint'],
    'security': ['security', 'pentest', 'vulnerability', 'exploit', 'attack', 'injection', 'xss', 'privilege'],
    'devops': ['deploy', 'docker', 'kubernetes', 'k8s', 'terraform', 'ci', 'cd', 'pipeline', 'gitops'],
    'testing': ['test', 'tdd', 'bdd', 'e2e', 'unit', 'integration', 'playwright', 'cypress'],
    'documentation': ['doc', 'readme', 'api-doc', 'changelog', 'comment'],
    'frontend': ['react', 'vue', 'angular', 'css', 'ui', 'ux', 'component', 'frontend'],
    'backend': ['api', 'backend', 'server', 'database', 'rest', 'graphql', 'microservice'],
    'ai-ml': ['ai', 'ml', 'llm', 'rag', 'embedding', 'agent', 'prompt', 'langchain', 'langgraph'],
    'data': ['data', 'analytics', 'pipeline', 'etl', 'warehouse', 'sql'],
    'mobile': ['mobile', 'ios', 'android', 'flutter', 'react-native'],
    'cloud': ['aws', 'gcp', 'azure', 'cloud', 'serverless', 'lambda'],
    'performance': ['performance', 'optimization', 'profiling', 'caching', 'scale'],
    'workflow': ['workflow', 'automation', 'git', 'pr', 'review', 'commit'],
};

/**
 * Categorize skill by keywords
 */
function categorizeSkill(skill: SkillScanResult): string[] {
    const categories: string[] = [];
    const searchText = `${skill.id} ${skill.name || ''} ${skill.description || ''}`.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        const matchCount = keywords.filter(kw => searchText.includes(kw)).length;
        if (matchCount >= 1) {
            categories.push(category);
        }
    }

    return categories.length > 0 ? categories : ['general'];
}

/**
 * Generate categorization report from scan
 */
export function generateCategorizationReport(scanReport: ScanReport): CategorizationReport {
    const report: CategorizationReport = {
        timestamp: new Date().toISOString(),
        totalSkills: scanReport.totalSkills,
        tiers: {
            tier1_core: [],
            tier2_standard: [],
            tier3_extended: [],
            tier4_review: [],
            excluded: [],
        },
        agentRecommendations: [],
        categories: {},
    };

    // Initialize categories
    for (const category of Object.keys(CATEGORY_KEYWORDS)) {
        report.categories[category] = [];
    }
    report.categories['general'] = [];

    // Categorize each skill
    for (const skill of scanReport.skills) {
        // Skip broken skills
        if (skill.error && skill.error.includes('Missing SKILL.md')) {
            report.tiers.excluded.push(skill.id);
            continue;
        }

        // Tier assignment
        if (skill.riskLevel === 'high') {
            report.tiers.tier4_review.push(skill.id);
        } else if (skill.riskLevel === 'safe' && skill.qualityScore >= 80) {
            report.tiers.tier1_core.push(skill.id);
        } else if ((skill.riskLevel === 'safe' || skill.riskLevel === 'low') && skill.qualityScore >= 60) {
            report.tiers.tier2_standard.push(skill.id);
        } else {
            report.tiers.tier3_extended.push(skill.id);
        }

        // Category assignment
        const categories = categorizeSkill(skill);
        for (const cat of categories) {
            if (!report.categories[cat]) {
                report.categories[cat] = [];
            }
            report.categories[cat].push(skill.id);
        }
    }

    // Generate agent recommendations
    const agentPriorities: Record<string, { primary: Set<string>, secondary: Set<string> }> = {
        'prometheus': { primary: new Set(), secondary: new Set() },
        'oracle': { primary: new Set(), secondary: new Set() },
        'librarian': { primary: new Set(), secondary: new Set() },
        'sisyphus': { primary: new Set(), secondary: new Set() },
        'sisyphus-junior': { primary: new Set(), secondary: new Set() },
        'momus': { primary: new Set(), secondary: new Set() },
        'atlas': { primary: new Set(), secondary: new Set() },
        'metis': { primary: new Set(), secondary: new Set() },
        'explore': { primary: new Set(), secondary: new Set() },
    };

    // Category → Agent mapping
    const categoryToAgent: Record<string, { primary: string, secondary: string[] }> = {
        'architecture': { primary: 'prometheus', secondary: ['oracle', 'atlas'] },
        'security': { primary: 'oracle', secondary: ['momus'] },
        'devops': { primary: 'sisyphus', secondary: ['sisyphus-junior'] },
        'testing': { primary: 'momus', secondary: ['sisyphus-junior'] },
        'documentation': { primary: 'librarian', secondary: ['sisyphus'] },
        'frontend': { primary: 'sisyphus-junior', secondary: ['sisyphus'] },
        'backend': { primary: 'sisyphus', secondary: ['sisyphus-junior'] },
        'ai-ml': { primary: 'prometheus', secondary: ['librarian', 'oracle'] },
        'data': { primary: 'sisyphus', secondary: ['librarian'] },
        'mobile': { primary: 'sisyphus-junior', secondary: ['sisyphus'] },
        'cloud': { primary: 'sisyphus', secondary: ['sisyphus-junior'] },
        'performance': { primary: 'oracle', secondary: ['momus'] },
        'workflow': { primary: 'atlas', secondary: ['sisyphus'] },
        'general': { primary: 'sisyphus', secondary: ['sisyphus-junior'] },
    };

    // Assign skills to agents based on categories
    for (const [category, skills] of Object.entries(report.categories)) {
        const mapping = categoryToAgent[category] || categoryToAgent['general'];
        for (const skillId of skills) {
            agentPriorities[mapping.primary].primary.add(skillId);
            for (const secondary of mapping.secondary) {
                agentPriorities[secondary].secondary.add(skillId);
            }
        }
    }

    // Convert to report format
    const agentDescriptions: Record<string, string> = {
        'prometheus': 'Strategic planning, architecture design',
        'oracle': 'Code review, debugging, security analysis',
        'librarian': 'Documentation, research, API reference',
        'sisyphus': 'Primary implementation, backend, DevOps',
        'sisyphus-junior': 'Task execution, frontend, utilities',
        'momus': 'Testing, validation, quality assurance',
        'atlas': 'Project orchestration, workflow management',
        'metis': 'Pre-planning analysis, requirements gathering',
        'explore': 'Code search, codebase navigation',
    };

    for (const [agent, priorities] of Object.entries(agentPriorities)) {
        report.agentRecommendations.push({
            agent,
            description: agentDescriptions[agent] || '',
            primarySkills: [...priorities.primary],
            secondarySkills: [...priorities.secondary].filter(s => !priorities.primary.has(s)),
        });
    }

    return report;
}

/**
 * Display categorization summary
 */
export function displayCategorizationSummary(report: CategorizationReport): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 SKILLS CATEGORIZATION REPORT`);
    console.log(`${'='.repeat(60)}\n`);

    // Tier summary
    console.log(`📊 IMPORT TIERS`);
    console.log(`${'─'.repeat(40)}`);
    console.log(`Tier 1 (Core):     ${report.tiers.tier1_core.length} skills - SAFE + Excellent quality`);
    console.log(`Tier 2 (Standard): ${report.tiers.tier2_standard.length} skills - SAFE/LOW + Good quality`);
    console.log(`Tier 3 (Extended): ${report.tiers.tier3_extended.length} skills - MEDIUM risk`);
    console.log(`Tier 4 (Review):   ${report.tiers.tier4_review.length} skills - HIGH risk, manual review`);
    console.log(`Excluded:          ${report.tiers.excluded.length} skills - Invalid/broken\n`);

    // Category breakdown
    console.log(`📂 CATEGORY BREAKDOWN`);
    console.log(`${'─'.repeat(40)}`);
    const sortedCategories = Object.entries(report.categories)
        .sort((a, b) => b[1].length - a[1].length);

    for (const [category, skills] of sortedCategories) {
        console.log(`${category.padEnd(20)} ${skills.length} skills`);
    }

    // Agent assignment summary
    console.log(`\n🤖 AGENT SKILL ASSIGNMENT`);
    console.log(`${'─'.repeat(40)}`);
    for (const rec of report.agentRecommendations) {
        console.log(`${rec.agent.padEnd(18)} Primary: ${rec.primarySkills.length.toString().padStart(3)} | Secondary: ${rec.secondarySkills.length}`);
    }

    // Tier 1 samples
    console.log(`\n⭐ TIER 1 CORE SKILLS (Top 20)`);
    console.log(`${'─'.repeat(40)}`);
    report.tiers.tier1_core.slice(0, 20).forEach(s => console.log(`  • ${s}`));
    if (report.tiers.tier1_core.length > 20) {
        console.log(`  ... and ${report.tiers.tier1_core.length - 20} more`);
    }

    console.log(`\n${'='.repeat(60)}\n`);
}

/**
 * Save categorization report
 */
export function saveCategorizationReport(report: CategorizationReport, outputPath: string): void {
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`📄 Categorization report saved to: ${outputPath}`);
}

/**
 * Main categorization workflow
 */
export async function runCategorization(options: {
    scanReportPath?: string;
    outputPath?: string;
}): Promise<CategorizationReport | null> {
    const scanReportPath = options.scanReportPath || join(process.cwd(), "skills_security_report.json");
    const outputPath = options.outputPath || join(process.cwd(), "skills_categorization_report.json");

    if (!existsSync(scanReportPath)) {
        console.error(`❌ Scan report not found at ${scanReportPath}`);
        console.log("Run 'scan-skills' first to generate the security report.");
        return null;
    }

    console.log(`\n📖 Loading scan report from ${scanReportPath}...`);
    const scanReport: ScanReport = JSON.parse(readFileSync(scanReportPath, 'utf-8'));

    console.log(`🔄 Categorizing ${scanReport.totalSkills} skills...`);
    const report = generateCategorizationReport(scanReport);

    displayCategorizationSummary(report);
    saveCategorizationReport(report, outputPath);

    // Also generate tier-specific import files
    const tiersDir = join(process.cwd(), "skills_tiers");
    if (!existsSync(tiersDir)) {
        const { mkdirSync } = await import("node:fs");
        mkdirSync(tiersDir, { recursive: true });
    }

    writeFileSync(join(tiersDir, "tier1_core.json"), JSON.stringify(report.tiers.tier1_core, null, 2));
    writeFileSync(join(tiersDir, "tier2_standard.json"), JSON.stringify(report.tiers.tier2_standard, null, 2));
    writeFileSync(join(tiersDir, "tier3_extended.json"), JSON.stringify(report.tiers.tier3_extended, null, 2));
    writeFileSync(join(tiersDir, "tier4_review.json"), JSON.stringify(report.tiers.tier4_review, null, 2));

    console.log(`📁 Tier import lists saved to: ${tiersDir}/`);

    return report;
}
