/**
 * validation/types.ts - Type definitions for validation system
 */

export interface ValidationCheck {
    name: string;
    passed: boolean;
    errors?: string[];
    warnings?: string[];
    skipped?: boolean;
    duration?: number;
}

export interface ValidationResult {
    passed: boolean;
    checks: {
        lint?: ValidationCheck;
        types?: ValidationCheck;
        tests?: ValidationCheck;
        security?: ValidationCheck;
    };
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
    duration: number;
}

export interface ProjectTools {
    hasEslint: boolean;
    hasBiome: boolean;
    hasTypeScript: boolean;
    hasPackageJson: boolean;
    testCommand?: string;
}

export interface QuickCheckOptions {
    projectPath: string;
    skipLint?: boolean;
    skipTypes?: boolean;
    skipTests?: boolean;
    skipSecurity?: boolean;
}
