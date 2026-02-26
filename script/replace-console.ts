import * as fs from 'fs';

function upgradeFile(path: string) {
    if (!fs.existsSync(path)) return;
    let content = fs.readFileSync(path, 'utf8');

    if (content.includes('console.log') || content.includes('console.error')) {
        // Add import if not present
        if (!content.includes('@clack/prompts')) {
            content = `import * as p from "@clack/prompts";\n` + content;
        }

        // Replace basic usages
        content = content.replace(/console\.log\(/g, 'p.log.info(');
        content = content.replace(/console\.error\(/g, 'p.log.error(');

        fs.writeFileSync(path, content, 'utf8');
        console.log(`Upgraded logs in ${path}`);
    }
}

upgradeFile('src/cli/skills-sync.ts');
upgradeFile('src/cli/skills-categorizer.ts');
upgradeFile('src/cli/skills-scanner.ts');
