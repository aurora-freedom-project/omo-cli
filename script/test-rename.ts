import * as fs from 'fs';
import * as path from 'path';

const REPLACEMENTS = [
    [/prometheus/g, 'planner'],
    [/Prometheus/g, 'Planner'],
    [/atlas/g, 'conductor'],
    [/Atlas/g, 'Conductor'],
    [/metis/g, 'consultant'],
    [/Metis/g, 'Consultant'],
    [/momus/g, 'reviewer'],
    [/Momus/g, 'Reviewer'],
    [/oracle/g, 'architect'],
    [/Oracle/g, 'Architect'],
    [/librarian/g, 'researcher'],
    [/Librarian/g, 'Researcher'],
    [/sisyphusJunior/g, 'worker'],
    [/SisyphusJunior/g, 'Worker'],
    [/sisyphus/g, 'orchestrator'],
    [/Sisyphus/g, 'Orchestrator'],
    [/exploration/gi, 'exploration'], // Safe
];

const IGNORED_FILES = new Set([
    'agent-display-names.ts',
    'agent-display-names.test.ts',
    'migration.ts',
    'schema.ts',
    'types.ts',
    'utils.ts',
    'migration.test.ts',
]);

function processFile(filePath: string) {
    if (IGNORED_FILES.has(path.basename(filePath))) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let newContent = content;

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
