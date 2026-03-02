/**
 * @module shared/sdk-types.test
 *
 * Compile-time verification tests for SDK type adapters.
 * These tests verify that types are properly exported and structurally correct.
 */

import { describe, test, expect } from "bun:test"
import type {
    OpencodeClient,
    SessionCreateBody,
    MessageWithParts,
    TuiClientExtension,
} from "./sdk-types"

describe("sdk-types", () => {
    test("SessionCreateBody has correct shape", () => {
        const body: SessionCreateBody = {
            parentID: "parent-123",
            title: "Test Session",
            permission: [
                { permission: "write", action: "allow", pattern: "**/*.ts" },
            ],
        }

        expect(body.parentID).toBe("parent-123")
        expect(body.title).toBe("Test Session")
        expect(body.permission).toHaveLength(1)
        expect(body.permission![0].action).toBe("allow")
    })

    test("SessionCreateBody allows minimal construction", () => {
        const minimal: SessionCreateBody = {}
        expect(minimal.parentID).toBeUndefined()
        expect(minimal.title).toBeUndefined()
        expect(minimal.permission).toBeUndefined()
    })

    test("MessageWithParts has correct structure", () => {
        const msg: MessageWithParts = {
            info: {
                role: "assistant",
                time: { created: Date.now() },
            },
            parts: [
                { type: "text", text: "Hello world" },
                { type: "thinking", thinking: "I need to think..." },
            ],
        }

        expect(msg.info.role).toBe("assistant")
        expect(msg.parts).toHaveLength(2)
        expect(msg.parts[0].type).toBe("text")
        expect(msg.parts[0].text).toBe("Hello world")
        expect(msg.parts[1].thinking).toBe("I need to think...")
    })

    test("TuiClientExtension tui property is optional", () => {
        const noTui: TuiClientExtension = {}
        expect(noTui.tui).toBeUndefined()

        const withTui: TuiClientExtension = {
            tui: {
                showToast: async () => true,
            },
        }
        expect(withTui.tui).toBeDefined()
        expect(withTui.tui!.showToast).toBeFunction()
    })

    test("re-exported SDK types are importable", async () => {
        // Verify re-exports work by dynamically importing the module
        const mod = await import("./sdk-types")
        // These are type-only re-exports, so the module itself just has interfaces
        expect(mod).toBeDefined()
    })

    test("role union type accepts valid values", () => {
        const roles: Array<MessageWithParts["info"]["role"]> = [
            "user",
            "assistant",
            "tool",
        ]
        expect(roles).toHaveLength(3)
    })
})
