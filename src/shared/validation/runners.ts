/**
 * validation/runners.ts - Execute validation checks
 */

import { spawn } from "node:child_process";
import type { ValidationCheck } from "./types";

interface RunCommandOptions {
    cwd: string;
    timeout?: number; // milliseconds
}

/**
 * Run a command and capture output
 */
async function runCommand(
    command: string,
    args: string[],
    options: RunCommandOptions
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        const timeout = options.timeout || 30000; // 30s default
        const child = spawn(command, args, {
            cwd: options.cwd,
            shell: true,
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeout);

        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({
                exitCode: timedOut ? 124 : (code ?? 1),
                stdout,
                stderr: timedOut ? 'Command timed out' : stderr,
            });
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({
                exitCode: 1,
                stdout,
                stderr: err.message,
            });
        });
    });
}

/**
 * Run lint check (ESLint or Biome)
 */
export async function runLintCheck(
    projectPath: string,
    linter: 'eslint' | 'biome'
): Promise<ValidationCheck> {
    const startTime = Date.now();

    const command = linter === 'biome' ? 'npx' : 'npx';
    const args = linter === 'biome'
        ? ['biome', 'check', '.']
        : ['eslint', '.', '--max-warnings', '0'];

    const result = await runCommand(command, args, { cwd: projectPath });
    const duration = Date.now() - startTime;

    return {
        name: `Lint (${linter})`,
        passed: result.exitCode === 0,
        errors: result.exitCode !== 0 ? [result.stderr || result.stdout] : undefined,
        duration,
    };
}

/**
 * Run TypeScript type check
 */
export async function runTypeCheck(projectPath: string): Promise<ValidationCheck> {
    const startTime = Date.now();

    const result = await runCommand('npx', ['tsc', '--noEmit'], {
        cwd: projectPath,
        timeout: 60000, // 60s for type checking
    });

    const duration = Date.now() - startTime;

    return {
        name: 'TypeScript',
        passed: result.exitCode === 0,
        errors: result.exitCode !== 0 ? [result.stdout || result.stderr] : undefined,
        duration,
    };
}

/**
 * Run tests
 */
export async function runTests(
    projectPath: string,
    testCommand: string
): Promise<ValidationCheck> {
    const startTime = Date.now();

    const result = await runCommand('npm', ['run', testCommand], {
        cwd: projectPath,
        timeout: 120000, // 2 minutes for tests
    });

    const duration = Date.now() - startTime;

    return {
        name: 'Tests',
        passed: result.exitCode === 0,
        errors: result.exitCode !== 0 ? [result.stderr || result.stdout] : undefined,
        duration,
    };
}

/**
 * Run basic security scan (check for hardcoded secrets)
 */
export async function runSecurityScan(projectPath: string): Promise<ValidationCheck> {
    const startTime = Date.now();

    // Simple grep-based security scan for common patterns
    const patterns = [
        'API_KEY=',
        'SECRET=',
        'PASSWORD=',
        'TOKEN=',
        'aws_access_key_id',
        'private_key',
    ];

    const args = [
        '-rn',
        '-E',
        patterns.join('|'),
        projectPath,
        '--exclude-dir=node_modules',
        '--exclude-dir=.git',
        '--exclude-dir=dist',
        '--exclude-dir=build',
        '--exclude=*.md',
    ];

    const result = await runCommand('grep', args, { cwd: projectPath });
    const duration = Date.now() - startTime;

    // grep returns 0 if matches found (bad), 1 if no matches (good)
    const hasSecrets = result.exitCode === 0;

    return {
        name: 'Security Scan',
        passed: !hasSecrets,
        warnings: hasSecrets
            ? ['Potential hardcoded secrets detected', result.stdout.slice(0, 500)]
            : undefined,
        duration,
    };
}
