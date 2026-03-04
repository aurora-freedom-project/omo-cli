const fs = require('fs');

const files = [
  "src/hooks/claude-code-hooks/transcript.test.ts",
  "src/plugin-config.test.ts",
  "src/shared/logger.test.ts",
  "src/features/claude-code-agent-loader/loader.test.ts",
  "src/shared/connected-providers-cache.test.ts",
  "src/features/claude-code-command-loader/loader.test.ts",
  "src/features/code-intel/indexer.test.ts",
  "src/features/claude-code-mcp-loader/loader.test.ts",
  "src/tools/lsp/config.test.ts",
  "src/cli/memory/docker-manager.test.ts"
];

let modifiedCount = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');

  if (content.includes('mock.module("node:fs"')) {
    continue;
  }

  const lines = content.split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('mock.module("fs"')) {
      startIdx = i;
      break;
    }
  }

  if (startIdx !== -1) {
    let pCount = 0;
    let endIdx = -1;
    let block = "";

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '(') pCount++;
        if (char === ')') pCount--;
      }

      if (i === startIdx) {
        // first line could already have matched parens if it's a single line mock
        if (pCount === 0 && line.includes(')')) {
          endIdx = i;
          break;
        }
      } else {
        if (pCount === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx !== -1) {
      const originalBlock = lines.slice(startIdx, endIdx + 1).join('\n');
      const newBlockNodeFs = originalBlock.replace(/['"]fs['"]/, '"node:fs"');

      // Attempt to create a node:fs/promises mock too. This is a bit manual, but we'll try to map the functions.
      // Usually it's readFileSync, writeFileSync, mkdirSync, existsSync
      let promisesBlock = originalBlock.replace(/['"]fs['"]/, '"node:fs/promises"');
      promisesBlock = promisesBlock.replace(/readFileSync/g, 'readFile');
      promisesBlock = promisesBlock.replace(/writeFileSync/g, 'writeFile');
      promisesBlock = promisesBlock.replace(/mkdirSync/g, 'mkdir');
      promisesBlock = promisesBlock.replace(/existsSync/g, 'access'); // For promises, access resolves or throws

      // Also some tests mock rmSync, appendFileSync
      promisesBlock = promisesBlock.replace(/rmSync/g, 'rm');
      promisesBlock = promisesBlock.replace(/appendFileSync/g, 'appendFile');

      lines.splice(endIdx + 1, 0, newBlockNodeFs, "", promisesBlock);
      fs.writeFileSync(file, lines.join('\n'));
      modifiedCount++;
      console.log(`Updated ${file}`);
    } else {
      console.log(`Could not find end of mock.module for ${file}`);
    }
  }
}
console.log(`Modified ${modifiedCount} files`);
