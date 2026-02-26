import * as fs from 'fs';
import * as path from 'path';

const REPLACEMENTS = [
    // Exact string literal replacements for agent keys
    [/['"]sisyphus-junior['"]/g, '"worker"'],
    [/['"]multimodal-looker['"]/g, '"vision"'],
    [/['"]OpenCode-Builder['"]/g, '"builder"'],

    // Word replacements (Title case)
    [/\bSisyphusJunior\b/g, 'Worker'],
    [/\bMultimodalLooker\b/g, 'Vision'],
    [/\bOpenCodeBuilder\b/g, 'Builder'],
    [/\bSisyphus\b/g, 'Orchestrator'],
    [/\bAtlas\b/g, 'Conductor'],
    [/\bPrometheus\b/g, 'Planner'],
    [/\bMetis\b/g, 'Consultant'],
    [/\bMomus\b/g, 'Reviewer'],
    [/\bOracle\b/g, 'Architect'],
    [/\bLibrarian\b/g, 'Researcher'],
    [/\bExplore\b/g, 'Explorer'],

    // Word replacements (camelCase)
    [/\bsisyphusJunior\b/g, 'worker'],
    [/\bmultimodalLooker\b/g, 'vision'],
    [/\bopenCodeBuilder\b/g, 'builder'],
    [/\bsisyphus\b/g, 'orchestrator'],
    [/\batlas\b/g, 'conductor'],
    [/\bprometheus\b/g, 'planner'],
    [/\bmetis\b/g, 'consultant'],
    [/\bmomus\b/g, 'reviewer'],
    [/\boracle\b/g, 'architect'],
    [/\blibrarian\b/g, 'researcher'],
    [/\bexplore(?!r)\b/g, 'explorer'],
];

function processFile(filePath: string) {
    let content = fs.readFileSync(filePath, 'utf8');
    let newContent = content;

    // Skip agent-display-names.ts map keys to not break legacy backward compatibility?
    // We should actually let it replace because we only need backward compat parsing.
    // Actually, wait, the user said FULL rename.

    for (const [regex, replacement] of REPLACEMENTS) {
        newContent = newContent.replace(regex as RegExp, replacement as string);
    }

    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

function walkDir(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.md')) {
            processFile(fullPath);
        }
    }
}

walkDir('src');
console.log('Done!');
