import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    detectLinter,
    hasTypeScript,
    detectTestCommand,
    detectProjectTools,
} from "./detectors";

describe("validation/detectors", () => {
    let testDir: string;

    beforeAll(() => {
        // Create temp directory for tests
        testDir = mkdtempSync(join(tmpdir(), 'validation-test-'));
    });

    afterAll(() => {
        // Cleanup
        rmSync(testDir, { recursive: true, force: true });
    });

    describe("detectLinter", () => {
        it("should detect Biome via biome.json", () => {
            writeFileSync(join(testDir, 'biome.json'), '{}');
            expect(detectLinter(testDir)).toBe('biome');
        });

        it("should detect ESLint via .eslintrc.json", () => {
            rmSync(join(testDir, 'biome.json'), { force: true });
            writeFileSync(join(testDir, '.eslintrc.json'), '{}');
            expect(detectLinter(testDir)).toBe('eslint');
        });

        it("should return null when no linter found", () => {
            const emptyDir = mkdtempSync(join(tmpdir(), 'empty-'));
            expect(detectLinter(emptyDir)).toBe(null);
            rmSync(emptyDir, { recursive: true });
        });
    });

    describe("hasTypeScript", () => {
        it("should detect TypeScript via tsconfig.json", () => {
            writeFileSync(join(testDir, 'tsconfig.json'), '{}');
            expect(hasTypeScript(testDir)).toBe(true);
        });

        it("should return false when no tsconfig.json", () => {
            const noTsDir = mkdtempSync(join(tmpdir(), 'no-ts-'));
            expect(hasTypeScript(noTsDir)).toBe(false);
            rmSync(noTsDir, { recursive: true });
        });
    });

    describe("detectTestCommand", () => {
        it("should detect test script", () => {
            const pkg = {
                scripts: {
                    test: 'bun test'
                }
            };
            writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg));
            expect(detectTestCommand(testDir)).toBe('test');
        });

        it("should detect test:unit script", () => {
            const pkg = {
                scripts: {
                    test: 'echo "Error: no test specified" && exit 1',
                    'test:unit': 'bun test'
                }
            };
            writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg));
            expect(detectTestCommand(testDir)).toBe('test:unit');
        });

        it("should return null when no test script", () => {
            const pkg = {
                scripts: {
                    build: 'tsc'
                }
            };
            writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg));
            expect(detectTestCommand(testDir)).toBe(null);
        });
    });

    describe("detectProjectTools", () => {
        it("should detect all tools", () => {
            // Setup project with all tools
            writeFileSync(join(testDir, 'biome.json'), '{}');
            writeFileSync(join(testDir, 'tsconfig.json'), '{}');
            const pkg = {
                scripts: {
                    test: 'bun test'
                }
            };
            writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg));

            const tools = detectProjectTools(testDir);

            expect(tools.hasBiome).toBe(true);
            expect(tools.hasTypeScript).toBe(true);
            expect(tools.hasPackageJson).toBe(true);
            expect(tools.testCommand).toBe('test');
        });
    });
});
