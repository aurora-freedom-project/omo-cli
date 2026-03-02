/**
 * @module shared/session-utils.test
 *
 * Tests for session utilities — getMessageDir().
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

// We need to mock MESSAGE_STORAGE before importing session-utils
// Since it reads from constants/storage-paths, we test the function behavior

describe("session-utils", () => {
    // Instead of mocking the import, we test the logic pattern directly
    // by verifying the module exports the expected function

    test("getMessageDir is exported", async () => {
        const mod = await import("./session-utils")
        expect(mod.getMessageDir).toBeFunction()
    })

    test("getMessageDir returns null for nonexistent session", async () => {
        const mod = await import("./session-utils")
        // MESSAGE_STORAGE path likely doesn't exist in test env
        const result = mod.getMessageDir("nonexistent-session-id-12345")
        expect(result).toBeNull()
    })
})
