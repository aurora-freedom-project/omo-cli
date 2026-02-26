import * as fs from 'fs';
import * as path from 'path';

const REPLACEMENTS = [
    [/\bprometheus\b/gi, 'Planner'],
    [/\batlas/gi, 'Conductor'], // hook/atlas -> hook/navigator was done already? No wait. For hooks, it's navigator.
    [/\bmetis\b/gi, 'Consultant'],
    [/\bmomus\b/gi, 'Reviewer'],
    [/\boracle\b/gi, 'Architect'],
    [/\blibrarian\b/gi, 'Researcher'],
    [/\bsisyphus-junior\b/gi, 'Worker'],
    [/\bsisyphus(?!(labs|\.png|\.ai|-dev|-dev-ai|:))\b/gi, 'Orchestrator'], // Sisyphus -> Orchestrator, but not Sisyphus Labs
];

function matchCase(match: string, replacement: string): string {
    if (match === match.toUpperCase()) return replacement.toUpperCase();
    if (match[0] === match[0].toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    return replacement.toLowerCase();
}

function processFile(filePath: string) {
    let content = fs.readFileSync(filePath, 'utf8');
    let newContent = content;

    for (const [regex, replacementRaw] of REPLACEMENTS) {
        newContent = newContent.replace(regex as RegExp, (match) => {
            // Special case for atlas -> navigator in path
            if (match.toLowerCase() === 'atlas' && content.includes(`src/hooks/${match}`)) {
                return matchCase(match, 'navigator');
            }
            return matchCase(match, replacementRaw as string);
        });
    }

    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

['README.md', 'AGENTS.md'].forEach(processFile);
console.log('Done!');
