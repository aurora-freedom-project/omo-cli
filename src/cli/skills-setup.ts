/**
 * cli/skills-setup.ts — Unified skills directory management
 * 
 * Ensures ~/.config/_skills_ is the single source of truth for all skills.
 * Creates a symlink at ~/.opencode/skills → ~/.config/_skills_ so that
 * OpenCode can still discover skills via its native path while omo-cli
 * (and other tools) read/write from the central location.
 */

import { existsSync, mkdirSync, renameSync, symlinkSync, lstatSync, readlinkSync, rmSync, readdirSync, cpSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** The single source of truth for all skills */
export const UNIFIED_SKILLS_DIR = join(homedir(), ".config", "_skills_");

/** The path OpenCode natively looks for skills */
export const OPENCODE_SKILLS_DIR = join(homedir(), ".opencode", "skills");

/**
 * Ensure the unified skills directory exists and that
 * ~/.opencode/skills is a symlink pointing to it.
 * 
 * Migration logic:
 * 1. Create ~/.config/_skills_ if it doesn't exist.
 * 2. If ~/.opencode/skills is a real directory (not symlink),
 *    move its contents into ~/.config/_skills_ to preserve existing skills.
 * 3. Remove ~/.opencode/skills (directory or dangling symlink).
 * 4. Create symlink ~/.opencode/skills → ~/.config/_skills_.
 * 
 * This function is idempotent — safe to call multiple times.
 */
export function ensureUnifiedSkillsDirectory(): { migrated: number; linked: boolean } {
    let migrated = 0;

    // 1. Ensure the unified target exists
    if (!existsSync(UNIFIED_SKILLS_DIR)) {
        mkdirSync(UNIFIED_SKILLS_DIR, { recursive: true });
    }

    // 2. Ensure ~/.opencode parent exists
    const opencodeDir = join(homedir(), ".opencode");
    if (!existsSync(opencodeDir)) {
        mkdirSync(opencodeDir, { recursive: true });
    }

    // 3. Handle existing ~/.opencode/skills
    if (existsSync(OPENCODE_SKILLS_DIR) || lstatExistsSafe(OPENCODE_SKILLS_DIR)) {
        const stat = lstatSafe(OPENCODE_SKILLS_DIR);

        if (stat && stat.isSymbolicLink()) {
            // It's already a symlink — check if it points to the right place
            const target = readlinkSync(OPENCODE_SKILLS_DIR);
            if (target === UNIFIED_SKILLS_DIR) {
                // Already correctly linked
                return { migrated: 0, linked: true };
            }
            // Points somewhere else — remove it
            rmSync(OPENCODE_SKILLS_DIR);
        } else if (stat && stat.isDirectory()) {
            // It's a real directory — migrate contents
            migrated = migrateExistingSkills(OPENCODE_SKILLS_DIR, UNIFIED_SKILLS_DIR);
            // Remove the now-empty directory
            rmSync(OPENCODE_SKILLS_DIR, { recursive: true, force: true });
        }
    }

    // 4. Create the symlink
    symlinkSync(UNIFIED_SKILLS_DIR, OPENCODE_SKILLS_DIR, "dir");

    return { migrated, linked: true };
}

/**
 * Move contents from source dir into target dir, preserving existing files.
 * Returns the number of items migrated.
 */
function migrateExistingSkills(sourceDir: string, targetDir: string): number {
    let count = 0;
    try {
        const entries = readdirSync(sourceDir, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = join(sourceDir, entry.name);
            const dstPath = join(targetDir, entry.name);

            if (!existsSync(dstPath)) {
                // Move (copy + original will be removed with parent)
                if (entry.isDirectory()) {
                    cpSync(srcPath, dstPath, { recursive: true });
                } else {
                    cpSync(srcPath, dstPath);
                }
                count++;
            }
            // If destination already exists, skip (unified dir wins)
        }
    } catch {
        // If migration fails, we still proceed with the symlink
    }
    return count;
}

/** Safe lstat that returns null instead of throwing */
function lstatSafe(path: string) {
    try {
        return lstatSync(path);
    } catch {
        return null;
    }
}

/** Check if a path exists at the lstat level (sees broken symlinks) */
function lstatExistsSafe(path: string): boolean {
    return lstatSafe(path) !== null;
}
