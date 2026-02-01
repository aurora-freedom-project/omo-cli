/**
 * Privacy Awareness Hook
 * Inspired by ClaudeKit's privacy block hook.
 * 
 * Warns users when agents attempt to access sensitive files.
 */

import * as path from "path"
import type { PrivacyConfig } from "../config"

export interface PrivacyWarning {
    type: "sensitive_file"
    message: string
    filePath: string
    pattern: string
    requireConfirmation: boolean
}

/**
 * Default sensitive file patterns.
 */
export const DEFAULT_SENSITIVE_PATTERNS = [
    ".env",
    ".env.*",
    "*.key",
    "*.pem",
    "**/secrets/**",
    "**/credentials/**",
    "**/.ssh/**",
    "**/private/**",
]

/**
 * Simple glob pattern matching (no external dependencies).
 * Supports: *, **, ?, and basic patterns.
 */
function simpleGlobMatch(pattern: string, str: string): boolean {
    // Escape special regex chars except our glob chars
    let regex = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "{{GLOBSTAR}}")
        .replace(/\*/g, "[^/]*")
        .replace(/{{GLOBSTAR}}/g, ".*")
        .replace(/\?/g, ".")

    regex = "^" + regex + "$"

    try {
        return new RegExp(regex).test(str)
    } catch {
        return false
    }
}

/**
 * Check if a file path matches any sensitive pattern.
 */
export function matchesSensitivePattern(
    filePath: string,
    patterns: string[]
): string | null {
    const basename = path.basename(filePath)
    const normalized = filePath.replace(/\\/g, "/")

    for (const pattern of patterns) {
        // Check against basename first for simple patterns
        if (simpleGlobMatch(pattern, basename)) {
            return pattern
        }
        // Check against full path for path patterns
        if (simpleGlobMatch(pattern, normalized)) {
            return pattern
        }
    }

    return null
}

/**
 * Check a file access and return a warning if sensitive.
 */
export function checkFileAccess(
    filePath: string,
    config: PrivacyConfig | undefined
): PrivacyWarning | null {
    if (!config?.enabled) return null

    const patterns = config.sensitive_patterns ?? DEFAULT_SENSITIVE_PATTERNS
    const matchedPattern = matchesSensitivePattern(filePath, patterns)

    if (matchedPattern) {
        return {
            type: "sensitive_file",
            message: `⚠️ Privacy Warning: Accessing sensitive file "${path.basename(filePath)}"`,
            filePath,
            pattern: matchedPattern,
            requireConfirmation: config.require_confirmation ?? false,
        }
    }

    return null
}

/**
 * Build the privacy awareness section for hook output.
 */
export function buildPrivacyWarningMessage(warning: PrivacyWarning): string {
    return `
<PrivacyWarning>
${warning.message}
File: ${warning.filePath}
Matched Pattern: ${warning.pattern}
${warning.requireConfirmation ? "⚠️ Confirmation required before proceeding." : "Proceed with caution."}
</PrivacyWarning>
`
}

/**
 * Create the privacy awareness hook handler.
 */
export function createPrivacyAwarenessHandler(config: PrivacyConfig | undefined) {
    if (!config?.enabled) {
        return null
    }

    return {
        name: "privacy-awareness" as const,
        checkAccess: (filePath: string) => checkFileAccess(filePath, config),
        buildWarning: buildPrivacyWarningMessage,
    }
}
