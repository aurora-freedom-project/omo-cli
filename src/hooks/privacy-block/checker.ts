/**
 * privacy-block/checker.ts - Privacy pattern matching logic
 * 
 * Core logic for detecting sensitive file access patterns
 */

export const APPROVED_PREFIX = 'APPROVED:';

// Safe file patterns - exempt from privacy checks
export const SAFE_PATTERNS = [
    /\.example$/i,   // .env.example, config.example
    /\.sample$/i,    // .env.sample
    /\.template$/i,  // .env.template
];

// Privacy-sensitive patterns
export const PRIVACY_PATTERNS = [
    /^\.env$/,              // .env
    /^\.env\./,             // .env.local, .env.production
    /\.env$/,               // path/to/.env
    /\/\.env\./,            // path/to/.env.local
    /credentials/i,         // credentials.json
    /secrets?\.ya?ml$/i,    // secrets.yaml, secret.yml
    /\.pem$/,               // Private keys
    /\.key$/,               // Private keys
    /id_rsa/,               // SSH keys
    /id_ed25519/,           // SSH keys
    /\.p12$/,               // PKCS12 files
    /\.pfx$/,               // PFX files
];

/**
 * Check if path is a safe file (example/sample/template)
 */
export function isSafeFile(testPath: string): boolean {
    if (!testPath) return false;
    const basename = testPath.split('/').pop() ?? '';
    return SAFE_PATTERNS.some(p => p.test(basename));
}

/**
 * Check if path has APPROVED: prefix
 */
export function hasApprovalPrefix(testPath: string): boolean {
    return testPath?.startsWith(APPROVED_PREFIX) ?? false;
}

/**
 * Strip APPROVED: prefix from path
 */
export function stripApprovalPrefix(testPath: string): string {
    if (hasApprovalPrefix(testPath)) {
        return testPath.slice(APPROVED_PREFIX.length);
    }
    return testPath;
}

/**
 * Check if stripped path is suspicious (path traversal or absolute)
 */
export function isSuspiciousPath(strippedPath: string): boolean {
    return strippedPath.includes('..') || strippedPath.startsWith('/');
}

/**
 * Check if path matches privacy patterns
 */
export function isPrivacySensitive(testPath: string): boolean {
    if (!testPath) return false;

    // Strip prefix for pattern matching
    const cleanPath = stripApprovalPrefix(testPath);
    const normalized = cleanPath.replace(/\\/g, '/');

    // Check safe patterns first
    if (isSafeFile(normalized)) {
        return false;
    }

    const basename = normalized.split('/').pop() ?? '';

    for (const pattern of PRIVACY_PATTERNS) {
        if (pattern.test(basename) || pattern.test(normalized)) {
            return true;
        }
    }
    return false;
}

/**
 * Extract file paths from tool parameters
 */
export function extractPaths(toolParams: Record<string, unknown>): string[] {
    const paths: string[] = [];

    // Common file path parameter names
    if (typeof toolParams.file_path === 'string') paths.push(toolParams.file_path);
    if (typeof toolParams.filePath === 'string') paths.push(toolParams.filePath);
    if (typeof toolParams.path === 'string') paths.push(toolParams.path);
    if (typeof toolParams.targetFile === 'string') paths.push(toolParams.targetFile);

    // For Bash commands
    if (typeof toolParams.command === 'string') {
        // Look for APPROVED: patterns
        const approvedMatch = toolParams.command.match(/APPROVED:[^\s]+/g) || [];
        paths.push(...approvedMatch);

        // If no APPROVED: version, look for .env patterns
        if (approvedMatch.length === 0) {
            const envMatch = toolParams.command.match(/\.env[^\s]*/g) || [];
            paths.push(...envMatch);
        }
    }

    return paths.filter(Boolean);
}

export interface PrivacyCheckResult {
    blocked: boolean;
    filePath?: string;
    reason?: string;
    approved?: boolean;
    suspicious?: boolean;
}

/**
 * Check if a tool call accesses privacy-sensitive files
 */
export function checkPrivacy(
    toolName: string,
    toolParams: Record<string, unknown>
): PrivacyCheckResult {
    const paths = extractPaths(toolParams);

    for (const testPath of paths) {
        if (!isPrivacySensitive(testPath)) continue;

        // Check for approval prefix
        if (hasApprovalPrefix(testPath)) {
            const strippedPath = stripApprovalPrefix(testPath);
            return {
                blocked: false,
                approved: true,
                filePath: strippedPath,
                suspicious: isSuspiciousPath(strippedPath),
            };
        }

        // Block - sensitive file without approval
        return {
            blocked: true,
            filePath: testPath,
            reason: 'Sensitive file access requires user approval',
        };
    }

    // No sensitive paths found
    return { blocked: false };
}
