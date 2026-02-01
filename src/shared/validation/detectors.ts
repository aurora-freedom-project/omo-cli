/**
 * validation/detectors.ts - Detect available tools in project
 */

import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProjectTools {
    hasEslint: boolean;
    hasBiome: boolean;
    hasTypeScript: boolean;
    hasPackageJson: boolean;
    testCommand?: string;
}

/**
 * Detect which linter is available
 */
export function detectLinter(projectPath: string): 'eslint' | 'biome' | null {
    // Check for Biome first (newer)
    if (existsSync(join(projectPath, 'biome.json')) ||
        existsSync(join(projectPath, '.biome.json'))) {
        return 'biome';
    }

    // Check for ESLint
    if (existsSync(join(projectPath, '.eslintrc.js')) ||
        existsSync(join(projectPath, '.eslintrc.json')) ||
        existsSync(join(projectPath, '.eslintrc.yml')) ||
        existsSync(join(projectPath, 'eslint.config.js')) ||
        existsSync(join(projectPath, 'eslint.config.mjs'))) {
        return 'eslint';
    }

    // Check package.json for eslint dependency
    const pkgPath = join(projectPath, 'package.json');
    if (existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            if (deps['@biomejs/biome']) return 'biome';
            if (deps['eslint']) return 'eslint';
        } catch {
            // Ignore parse errors
        }
    }

    return null;
}

/**
 * Check if TypeScript is available
 */
export function hasTypeScript(projectPath: string): boolean {
    return existsSync(join(projectPath, 'tsconfig.json'));
}

/**
 * Detect test command from package.json
 */
export function detectTestCommand(projectPath: string): string | null {
    const pkgPath = join(projectPath, 'package.json');
    if (!existsSync(pkgPath)) return null;

    try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const scripts = pkg.scripts || {};

        // Look for common test script names
        if (scripts.test && scripts.test !== 'echo "Error: no test specified" && exit 1') {
            return 'test';
        }

        if (scripts['test:unit']) return 'test:unit';
        if (scripts['test:integration']) return 'test:integration';

        return null;
    } catch {
        return null;
    }
}

/**
 * Detect all available project tools
 */
export function detectProjectTools(projectPath: string): ProjectTools {
    const linter = detectLinter(projectPath);
    const testCmd = detectTestCommand(projectPath);

    return {
        hasEslint: linter === 'eslint',
        hasBiome: linter === 'biome',
        hasTypeScript: hasTypeScript(projectPath),
        hasPackageJson: existsSync(join(projectPath, 'package.json')),
        testCommand: testCmd ?? undefined,
    };
}
