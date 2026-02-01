/**
 * cli/skills-scanner.ts - Security and quality scanner for skills
 * 
 * Scans SKILL.md files for:
 * - Security risks (dangerous commands, external scripts)
 * - Quality metrics (description, examples, structure)
 * - Agent compatibility (tool requirements, complexity)
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter } from "../shared/frontmatter";

// Risk patterns
const HIGH_RISK_PATTERNS = [
    /rm\s+-rf\s+[\/~]/gi,           // rm -rf with root/home
    /sudo\s+/gi,                     // sudo commands
    /curl\s+.*\|\s*bash/gi,         // curl | bash
    /wget\s+.*\|\s*bash/gi,         // wget | bash
    /eval\s*\(/gi,                   // eval()
    /\bexec\s*\(/gi,                // exec()
    /chmod\s+777/gi,                 // chmod 777
    />\s*\/etc\//gi,                 // write to /etc
    /:\s*\${.*:-/gi,                 // bash parameter expansion (potential injection)
];

const MEDIUM_RISK_PATTERNS = [
    /rm\s+-/gi,                      // rm with flags
    /chmod\s+/gi,                    // chmod
    /chown\s+/gi,                    // chown
    /mkfs\s+/gi,                     // mkfs
    /dd\s+if=/gi,                    // dd command
    /curl\s+/gi,                     // curl (without pipe)
    /wget\s+/gi,                     // wget (without pipe)
    /npm\s+install\s+-g/gi,         // global npm install
    /pip\s+install/gi,              // pip install
    /brew\s+install/gi,             // brew install
];

const LOW_RISK_PATTERNS = [
    /https?:\/\/[^\s]+/gi,          // External URLs
    /api[_-]?key/gi,                // API key references
    /secret/gi,                      // Secret references
    /password/gi,                    // Password references
    /token/gi,                       // Token references
];

// Quality indicators
const QUALITY_INDICATORS = {
    hasExamples: /```[\s\S]*?```/g,           // Code blocks
    hasHeadings: /^#{1,3}\s+/gm,              // Markdown headings
    hasList: /^[-*]\s+/gm,                    // Bullet lists
    hasNumberedList: /^\d+\.\s+/gm,           // Numbered lists
    hasLinks: /\[.*?\]\(.*?\)/g,              // Markdown links
};

// Agent categories based on content
const AGENT_KEYWORDS = {
    prometheus: ['architecture', 'design', 'planning', 'strategy', 'system design', 'blueprint'],
    oracle: ['review', 'debug', 'analyze', 'consult', 'diagnose', 'troubleshoot'],
    librarian: ['documentation', 'docs', 'research', 'reference', 'api', 'readme'],
    explore: ['search', 'find', 'grep', 'locate', 'navigate'],
    momus: ['validate', 'review', 'critique', 'test', 'verify', 'quality'],
    sisyphus: ['implement', 'create', 'build', 'develop', 'code'],
    'sisyphus-junior': ['task', 'execute', 'run', 'script', 'automate'],
    atlas: ['orchestrate', 'coordinate', 'manage', 'todo', 'project'],
    metis: ['analyze', 'gap', 'requirements', 'pre-planning'],
};

export interface SkillScanResult {
    id: string;
    path: string;

    // Frontmatter
    name?: string;
    description?: string;
    triggers?: string[];

    // Security
    riskLevel: 'high' | 'medium' | 'low' | 'safe';
    securityIssues: string[];

    // Quality
    qualityScore: number; // 0-100
    qualityDetails: {
        hasDescription: boolean;
        hasExamples: boolean;
        hasHeadings: boolean;
        hasList: boolean;
        contentLength: number;
    };

    // Agent compatibility
    suggestedAgents: string[];
    complexity: 'low' | 'medium' | 'high';

    // Errors
    error?: string;
}

export interface ScanReport {
    timestamp: string;
    totalSkills: number;
    summary: {
        highRisk: number;
        mediumRisk: number;
        lowRisk: number;
        safe: number;
    };
    qualityDistribution: {
        excellent: number; // 80-100
        good: number;      // 60-79
        fair: number;      // 40-59
        poor: number;      // 0-39
    };
    agentMapping: Record<string, string[]>;
    skills: SkillScanResult[];
}

/**
 * Scan a single skill
 */
export function scanSkill(skillPath: string): SkillScanResult {
    const id = basename(skillPath);
    const skillMdPath = join(skillPath, 'SKILL.md');

    const result: SkillScanResult = {
        id,
        path: skillPath,
        riskLevel: 'safe',
        securityIssues: [],
        qualityScore: 0,
        qualityDetails: {
            hasDescription: false,
            hasExamples: false,
            hasHeadings: false,
            hasList: false,
            contentLength: 0,
        },
        suggestedAgents: [],
        complexity: 'low',
    };

    // Check if SKILL.md exists
    if (!existsSync(skillMdPath)) {
        result.error = 'Missing SKILL.md';
        result.riskLevel = 'high';
        result.securityIssues.push('Cannot validate - no SKILL.md');
        return result;
    }

    try {
        const content = readFileSync(skillMdPath, 'utf-8');
        const { data, body, hadFrontmatter, parseError } = parseFrontmatter<{
            name?: string;
            description?: string;
            triggers?: string[];
        }>(content);

        // Extract frontmatter
        result.name = data.name;
        result.description = data.description;
        result.triggers = data.triggers;

        if (parseError) {
            result.error = 'Invalid YAML frontmatter';
        }

        // Security scan
        const fullContent = content.toLowerCase();

        // Check HIGH risk patterns
        for (const pattern of HIGH_RISK_PATTERNS) {
            const matches = fullContent.match(pattern);
            if (matches) {
                result.riskLevel = 'high';
                result.securityIssues.push(`HIGH: ${pattern.source} found (${matches.length}x)`);
            }
        }

        // Check MEDIUM risk patterns (only if not already high)
        if (result.riskLevel !== 'high') {
            for (const pattern of MEDIUM_RISK_PATTERNS) {
                const matches = fullContent.match(pattern);
                if (matches) {
                    if (result.riskLevel === 'safe') result.riskLevel = 'medium';
                    result.securityIssues.push(`MEDIUM: ${pattern.source} found (${matches.length}x)`);
                }
            }
        }

        // Check LOW risk patterns (only if safe so far)
        if (result.riskLevel === 'safe') {
            for (const pattern of LOW_RISK_PATTERNS) {
                const matches = content.match(pattern);
                if (matches) {
                    result.riskLevel = 'low';
                    result.securityIssues.push(`LOW: ${pattern.source} found (${matches.length}x)`);
                }
            }
        }

        // Quality assessment
        result.qualityDetails.contentLength = content.length;
        result.qualityDetails.hasDescription = !!data.description && data.description.length > 20;
        result.qualityDetails.hasExamples = QUALITY_INDICATORS.hasExamples.test(content);
        result.qualityDetails.hasHeadings = QUALITY_INDICATORS.hasHeadings.test(content);
        result.qualityDetails.hasList = QUALITY_INDICATORS.hasList.test(content) ||
            QUALITY_INDICATORS.hasNumberedList.test(content);

        // Calculate quality score
        let score = 0;
        if (hadFrontmatter) score += 20;
        if (result.qualityDetails.hasDescription) score += 25;
        if (result.qualityDetails.hasExamples) score += 25;
        if (result.qualityDetails.hasHeadings) score += 15;
        if (result.qualityDetails.hasList) score += 10;
        if (result.qualityDetails.contentLength > 500) score += 5;

        result.qualityScore = Math.min(100, score);

        // Agent mapping
        const lowerContent = content.toLowerCase();
        for (const [agent, keywords] of Object.entries(AGENT_KEYWORDS)) {
            const matchCount = keywords.filter(kw => lowerContent.includes(kw)).length;
            if (matchCount >= 2 || (matchCount >= 1 && keywords.length <= 3)) {
                result.suggestedAgents.push(agent);
            }
        }

        // If no specific agent matched, suggest general agents
        if (result.suggestedAgents.length === 0) {
            result.suggestedAgents.push('sisyphus');
        }

        // Complexity assessment
        const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
        const steps = (content.match(/^\d+\.\s+/gm) || []).length;

        if (codeBlocks > 5 || steps > 10 || content.length > 5000) {
            result.complexity = 'high';
        } else if (codeBlocks > 2 || steps > 5 || content.length > 2000) {
            result.complexity = 'medium';
        }

    } catch (error) {
        result.error = `Failed to read: ${error}`;
        result.riskLevel = 'high';
    }

    return result;
}

/**
 * Scan all skills in repository
 */
export function scanAllSkills(repoPath: string): ScanReport {
    const skillsDir = join(repoPath, "skills");

    const report: ScanReport = {
        timestamp: new Date().toISOString(),
        totalSkills: 0,
        summary: { highRisk: 0, mediumRisk: 0, lowRisk: 0, safe: 0 },
        qualityDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
        agentMapping: {},
        skills: [],
    };

    if (!existsSync(skillsDir)) {
        console.error("❌ Skills directory not found");
        return report;
    }

    const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

    report.totalSkills = skillDirs.length;

    console.log(`\n🔍 Scanning ${skillDirs.length} skills...\n`);

    for (const skillName of skillDirs) {
        const result = scanSkill(join(skillsDir, skillName));
        report.skills.push(result);

        // Update summary
        switch (result.riskLevel) {
            case 'high': report.summary.highRisk++; break;
            case 'medium': report.summary.mediumRisk++; break;
            case 'low': report.summary.lowRisk++; break;
            case 'safe': report.summary.safe++; break;
        }

        // Update quality distribution
        if (result.qualityScore >= 80) report.qualityDistribution.excellent++;
        else if (result.qualityScore >= 60) report.qualityDistribution.good++;
        else if (result.qualityScore >= 40) report.qualityDistribution.fair++;
        else report.qualityDistribution.poor++;

        // Update agent mapping
        for (const agent of result.suggestedAgents) {
            if (!report.agentMapping[agent]) {
                report.agentMapping[agent] = [];
            }
            report.agentMapping[agent].push(skillName);
        }
    }

    return report;
}

/**
 * Display scan report summary
 */
export function displayScanReport(report: ScanReport): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 SKILLS SECURITY & QUALITY REPORT`);
    console.log(`${'='.repeat(60)}\n`);

    console.log(`📅 Timestamp: ${report.timestamp}`);
    console.log(`📦 Total Skills: ${report.totalSkills}\n`);

    // Security summary
    console.log(`🛡️  SECURITY SUMMARY`);
    console.log(`${'─'.repeat(40)}`);
    console.log(`🔴 HIGH Risk:   ${report.summary.highRisk} skills`);
    console.log(`🟠 MEDIUM Risk: ${report.summary.mediumRisk} skills`);
    console.log(`🟡 LOW Risk:    ${report.summary.lowRisk} skills`);
    console.log(`🟢 SAFE:        ${report.summary.safe} skills\n`);

    // Quality summary
    console.log(`📈 QUALITY SUMMARY`);
    console.log(`${'─'.repeat(40)}`);
    console.log(`⭐ Excellent (80-100): ${report.qualityDistribution.excellent}`);
    console.log(`👍 Good (60-79):       ${report.qualityDistribution.good}`);
    console.log(`👌 Fair (40-59):       ${report.qualityDistribution.fair}`);
    console.log(`👎 Poor (0-39):        ${report.qualityDistribution.poor}\n`);

    // Agent distribution
    console.log(`🤖 AGENT MAPPING`);
    console.log(`${'─'.repeat(40)}`);
    for (const [agent, skills] of Object.entries(report.agentMapping)) {
        console.log(`${agent.padEnd(20)} ${skills.length} skills`);
    }

    // HIGH risk details
    if (report.summary.highRisk > 0) {
        console.log(`\n🔴 HIGH RISK SKILLS (Require Manual Review)`);
        console.log(`${'─'.repeat(40)}`);
        report.skills
            .filter(s => s.riskLevel === 'high')
            .slice(0, 20)
            .forEach(s => {
                console.log(`  • ${s.id}`);
                s.securityIssues.slice(0, 2).forEach(issue => {
                    console.log(`    └─ ${issue}`);
                });
            });

        if (report.summary.highRisk > 20) {
            console.log(`  ... and ${report.summary.highRisk - 20} more`);
        }
    }

    console.log(`\n${'='.repeat(60)}\n`);
}

/**
 * Save report to file
 */
export function saveReport(report: ScanReport, outputPath: string): void {
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`📄 Report saved to: ${outputPath}`);
}

/**
 * Main scan workflow
 */
export async function runSecurityScan(options: {
    repoPath?: string;
    outputPath?: string;
    showDetails?: boolean;
}): Promise<ScanReport> {
    const repoPath = options.repoPath || join(homedir(), ".antigravity-skills-cache");
    const outputPath = options.outputPath || join(process.cwd(), "skills_security_report.json");

    if (!existsSync(repoPath)) {
        console.error(`❌ Repository not found at ${repoPath}`);
        console.log("Run 'import-skills --audit' first to clone the repository.");
        process.exit(1);
    }

    const report = scanAllSkills(repoPath);
    displayScanReport(report);
    saveReport(report, outputPath);

    if (options.showDetails) {
        // Show all skills sorted by risk then quality
        console.log(`\n📋 DETAILED SKILL LIST`);
        console.log(`${'─'.repeat(60)}`);

        const sorted = [...report.skills].sort((a, b) => {
            const riskOrder = { high: 0, medium: 1, low: 2, safe: 3 };
            if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) {
                return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
            }
            return b.qualityScore - a.qualityScore;
        });

        for (const skill of sorted.slice(0, 50)) {
            const risk = { high: '🔴', medium: '🟠', low: '🟡', safe: '🟢' }[skill.riskLevel];
            const agents = skill.suggestedAgents.join(', ');
            console.log(`${risk} ${skill.id.padEnd(30)} Q:${skill.qualityScore.toString().padStart(3)} → ${agents}`);
        }

        if (sorted.length > 50) {
            console.log(`... and ${sorted.length - 50} more skills`);
        }
    }

    return report;
}
