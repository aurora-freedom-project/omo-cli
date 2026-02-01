/**
 * validation/quick-check.ts - Main quick validation entry point
 */

import { detectProjectTools } from "./detectors";
import { runLintCheck, runTypeCheck, runTests, runSecurityScan } from "./runners";
import type { QuickCheckOptions, ValidationResult } from "./types";

/**
 * Run quick validation checks (~30 seconds)
 * 
 * Checks (in priority order):
 * 1. Security Scan - hardcoded secrets
 * 2. Lint - ESLint or Biome
 * 3. Type Check - TypeScript --noEmit
 * 4. Tests - npm test
 */
export async function runQuickCheck(
    options: QuickCheckOptions
): Promise<ValidationResult> {
    const startTime = Date.now();
    const { projectPath } = options;

    // Detect available tools
    const tools = detectProjectTools(projectPath);

    const result: ValidationResult = {
        passed: true,
        checks: {},
        summary: {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
        },
        duration: 0,
    };

    // 1. Security Scan (always run)
    if (!options.skipSecurity) {
        try {
            const securityCheck = await runSecurityScan(projectPath);
            result.checks.security = securityCheck;
            result.summary.total++;

            if (securityCheck.passed) {
                result.summary.passed++;
            } else {
                result.summary.failed++;
                result.passed = false;
            }
        } catch (error) {
            result.checks.security = {
                name: 'Security Scan',
                passed: true,
                skipped: true,
            };
            result.summary.skipped++;
        }
    }

    // 2. Lint Check
    if (!options.skipLint && (tools.hasEslint || tools.hasBiome)) {
        try {
            const linter = tools.hasBiome ? 'biome' : 'eslint';
            const lintCheck = await runLintCheck(projectPath, linter);
            result.checks.lint = lintCheck;
            result.summary.total++;

            if (lintCheck.passed) {
                result.summary.passed++;
            } else {
                result.summary.failed++;
                result.passed = false;
            }
        } catch (error) {
            result.checks.lint = {
                name: 'Lint',
                passed: true,
                skipped: true,
            };
            result.summary.skipped++;
        }
    }

    // 3. Type Check
    if (!options.skipTypes && tools.hasTypeScript) {
        try {
            const typeCheck = await runTypeCheck(projectPath);
            result.checks.types = typeCheck;
            result.summary.total++;

            if (typeCheck.passed) {
                result.summary.passed++;
            } else {
                result.summary.failed++;
                result.passed = false;
            }
        } catch (error) {
            result.checks.types = {
                name: 'TypeScript',
                passed: true,
                skipped: true,
            };
            result.summary.skipped++;
        }
    }

    // 4. Tests (optional, can be slow)
    if (!options.skipTests && tools.testCommand) {
        try {
            const testCheck = await runTests(projectPath, tools.testCommand);
            result.checks.tests = testCheck;
            result.summary.total++;

            if (testCheck.passed) {
                result.summary.passed++;
            } else {
                result.summary.failed++;
                result.passed = false;
            }
        } catch (error) {
            result.checks.tests = {
                name: 'Tests',
                passed: true,
                skipped: true,
            };
            result.summary.skipped++;
        }
    }

    result.duration = Date.now() - startTime;
    return result;
}

/**
 * Format validation result as human-readable string
 */
export function formatValidationResult(result: ValidationResult): string {
    const lines: string[] = [];

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`📊 VALIDATION RESULTS (${(result.duration / 1000).toFixed(1)}s)`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');

    // Summary
    lines.push(`Total: ${result.summary.total} checks`);
    lines.push(`✅ Passed: ${result.summary.passed}`);
    lines.push(`❌ Failed: ${result.summary.failed}`);
    lines.push(`⏭️  Skipped: ${result.summary.skipped}`);
    lines.push('');

    // Individual check details
    for (const [key, check] of Object.entries(result.checks)) {
        if (check.skipped) {
            lines.push(`⏭️  ${check.name}: SKIPPED`);
        } else if (check.passed) {
            lines.push(`✅ ${check.name}: PASSED${check.duration ? ` (${(check.duration / 1000).toFixed(1)}s)` : ''}`);
        } else {
            lines.push(`❌ ${check.name}: FAILED`);
            if (check.errors) {
                check.errors.forEach(err => {
                    const preview = err.slice(0, 200);
                    lines.push(`   ${preview}${err.length > 200 ? '...' : ''}`);
                });
            }
            if (check.warnings) {
                check.warnings.forEach(warn => {
                    lines.push(`   ⚠️  ${warn}`);
                });
            }
        }
    }

    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (result.passed) {
        lines.push('✅ All checks PASSED');
    } else {
        lines.push('❌ Some checks FAILED - please review errors above');
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return lines.join('\n');
}
