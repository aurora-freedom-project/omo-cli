import { describe, it, expect } from "bun:test"
import { isHookDisabled } from "./hook-disabled"
import type { PluginConfig } from "./types/hook-types"

describe("hook-disabled", () => {
    it("returns false when disabledHooks is undefined", () => {
        const config: PluginConfig = { disabledHooks: undefined }
        expect(isHookDisabled(config, "PreToolUse")).toBe(false)
    })

    it("returns true when disabledHooks is true (all disabled)", () => {
        const config: PluginConfig = { disabledHooks: true }
        expect(isHookDisabled(config, "PreToolUse")).toBe(true)
    })

    it("returns true when hookType is in disabled array", () => {
        const config: PluginConfig = { disabledHooks: ["PreToolUse", "PostToolUse"] }
        expect(isHookDisabled(config, "PreToolUse")).toBe(true)
    })

    it("returns false when hookType is NOT in disabled array", () => {
        const config: PluginConfig = { disabledHooks: ["PostToolUse"] }
        expect(isHookDisabled(config, "PreToolUse")).toBe(false)
    })

    it("returns false for empty array", () => {
        const config: PluginConfig = { disabledHooks: [] }
        expect(isHookDisabled(config, "PreToolUse")).toBe(false)
    })
})
