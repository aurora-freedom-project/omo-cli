/**
 * Derive a per-project DB name from a project string.
 * Mirrors Omni Rust's `derive_project_db()` from index_code.rs.
 *
 * Both omni (Rust) and omo-cli (TS) MUST use the same derivation
 * so they read/write to the same per-project database.
 */

/**
 * Sanitize a string into a valid SurrealDB database name.
 * Only alphanumeric + underscore allowed.
 */
function sanitize(input: string): string {
    return input
        .replace(/[-\s]/g, "_")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
}

/**
 * Derive a per-project DB name.
 * Falls back to `fallbackDir` (typically current directory name) if project is "default" or empty.
 *
 * @param project - Project name (from config or CLI arg)
 * @param fallbackDir - Fallback directory name (e.g., basename of cwd)
 * @returns Sanitized database name
 */
export function deriveProjectDb(project: string, fallbackDir?: string): string {
    const sanitized = sanitize(project)

    if (sanitized && sanitized !== "default") {
        return sanitized
    }

    return sanitize(fallbackDir ?? "default_project")
}
