/**
 * pre-completion-validation - Run validation before task completion
 * 
 * Automatically runs quick checks before delegate_task returns results.
 * Alerts user to any issues found during validation.
 */

import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import { log } from "../../shared";
import { runQuickCheck, formatValidationResult } from "../../shared/validation";

interface ToolExecuteInput {
    tool: string;
    sessionID: string;
    callID: string;
}

interface ToolExecuteOutput {
    title: string;
    output: string;
    metadata: unknown;
}

const DELEGATE_TASK_TOOL = "delegate_task";

export function createPreCompletionValidationHook(ctx: PluginInput): Hooks {
    /**
     * Hook that runs after delegate_task completes
     * Runs validation and appends results to output
     */
    const toolExecuteAfter = async (
        input: ToolExecuteInput,
        output: ToolExecuteOutput
    ) => {
        const toolName = input.tool.toLowerCase();

        // Only run for delegate_task
        if (toolName !== DELEGATE_TASK_TOOL) return;

        // Run quick validation
        try {
            const result = await runQuickCheck({
                projectPath: ctx.directory,
                skipTests: true, // Skip tests to keep it quick (~10s instead of 2min)
            });

            // Format results
            const formatted = formatValidationResult(result);

            // Append to output
            output.output += `\n\n${formatted}\n`;

            // If validation failed, add warning to title
            if (!result.passed) {
                output.output += `\n⚠️  **Note**: Some validation checks failed. Please review the errors above before proceeding.\n`;
            }
        } catch (error) {
            // Don't block task completion if validation fails
            log("[pre-completion-validation] Validation failed", { error });
        }
    };

    return {
        "tool.execute.after": toolExecuteAfter,
    };
}
