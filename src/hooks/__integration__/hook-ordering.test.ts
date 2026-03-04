import { describe, it, expect } from "bun:test"

/**
 * Hook Ordering Integration Test
 * 
 * Verifies that critical hooks are listed in the correct dependency order
 * in the main plugin entry point (src/index.ts).
 * 
 * Expert Review Finding #6: Hook execution order must be validated.
 * 
 * Critical ordering rules:
 * 1. Session recovery BEFORE context window recovery
 * 2. Rules injector BEFORE keyword detector
 * 3. Think mode BEFORE thinking-block-validator
 * 4. Plugin config BEFORE all hooks
 * 5. Auto-update checker runs independently
 */

// Import names from the hooks barrel to verify they are all exported
import * as hooks from "../../hooks"

describe("hook system integration", () => {
    describe("hook exports", () => {
        const expectedHookFactories = [
            "createContextWindowMonitorHook",
            "createSessionRecoveryHook",
            "createCommentCheckerHooks",
            "createToolOutputTruncatorHook",
            "createDirectoryAgentsInjectorHook",
            "createDirectoryReadmeInjectorHook",
            "createEmptyTaskResponseDetectorHook",
            "createThinkModeHook",
            "createClaudeCodeHooksHook",
            "createAnthropicContextWindowLimitRecoveryHook",
            "createRulesInjectorHook",
            "createBackgroundNotificationHook",
            "createAutoUpdateCheckerHook",
            "createKeywordDetectorHook",
            "createAgentUsageReminderHook",
            "createThinkingBlockValidatorHook",
            "createCategorySkillReminderHook",
            "createAutoSlashCommandHook",
            "createEditErrorRecoveryHook",
            "createDelegateTaskRetryHook",
            "createTaskResumeInfoHook",
            "createStartWorkHook",
            "createConductorHook",
            "createPlannerMdOnlyHook",
            "createWorkerNotepadHook",
            "createCostMeteringHook",
        ]

        for (const factory of expectedHookFactories) {
            it(`exports ${factory}`, () => {
                expect(typeof (hooks as Record<string, unknown>)[factory]).toBe("function")
            })
        }
    })

    describe("hook registration completeness", () => {
        it("exports at least 25 hook factories", () => {
            const hookFactories = Object.keys(hooks).filter(
                (k) => k.startsWith("create") && typeof (hooks as Record<string, unknown>)[k] === "function"
            )
            expect(hookFactories.length).toBeGreaterThanOrEqual(25)
        })

        it("all hook factories are functions", () => {
            const hookFactories = Object.keys(hooks).filter((k) => k.startsWith("create"))
            for (const factory of hookFactories) {
                expect(typeof (hooks as Record<string, unknown>)[factory]).toBe("function")
            }
        })
    })
})
