/**
 * privacy-block - Block access to sensitive files unless user-approved
 * 
 * Prevents agents from reading sensitive files (.env, credentials, keys)
 * without explicit user permission.
 * 
 * Flow:
 * 1. Agent tries: read_file(".env") → BLOCKED
 * 2. Agent asks user for permission via ask_user
 * 3. User approves
 * 4. Agent retries: read_file("APPROVED:.env") → ALLOWED
 */

import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import { log } from "../../shared";
import { checkPrivacy, hasApprovalPrefix, stripApprovalPrefix } from "./checker";

interface ToolExecuteInput {
    tool: string;
    sessionID: string;
    callID: string;
}

interface ToolExecuteBeforeOutput {
    args: unknown;
}

interface ToolExecuteOutput {
    title: string;
    output: string;
    metadata: unknown;
}

const MONITORED_TOOLS = ["read_file", "view_file", "read", "bash"];

export function createPrivacyBlockHook(ctx: PluginInput): Hooks {
    /**
     * Hook that runs before tool execution
     * Blocks access to sensitive files
     */
    const toolExecuteBefore = async (
        input: ToolExecuteInput,
        output: ToolExecuteBeforeOutput
    ) => {
        const toolName = input.tool.toLowerCase();

        // Only check monitored tools
        if (!MONITORED_TOOLS.includes(toolName)) return;

        const args = output.args as Record<string, unknown> | undefined;
        if (!args) return;

        // Check privacy
        const result = checkPrivacy(toolName, args);

        if (result.approved) {
            // User approved - allow access
            if (result.suspicious) {
                const filePath = result.filePath ?? 'unknown';
                log("[privacy-block] Approved path is suspicious", { filePath });
            }
            return;
        }

        if (result.blocked) {
            // Block access - throw error with instructions
            const filePath = result.filePath ?? 'unknown';
            const basename = filePath.split('/').pop() ?? filePath;

            const errorMessage = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 PRIVACY BLOCK: Sensitive File Access Requires User Approval
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

File: ${filePath}

This file may contain sensitive data (API keys, passwords, tokens).

To proceed:
1. Use ask_user tool to request permission:
   {
     "questions": [{
       "question": "I need to read '${basename}' which may contain sensitive data. Do you approve?",
       "options": ["Yes, approve access", "No, skip this file"]
     }]
   }

2. If user approves, retry with APPROVED: prefix:
   read_file("APPROVED:${filePath}")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

            throw new Error(errorMessage);
        }
    };

    /**
     * Hook that runs after tool execution
     * Logs approved access
     */
    const toolExecuteAfter = async (
        input: ToolExecuteInput,
        output: ToolExecuteOutput
    ) => {
        const toolName = input.tool.toLowerCase();

        if (!MONITORED_TOOLS.includes(toolName)) return;

        // Check if this was an approved access
        const title = output.title ?? '';
        if (hasApprovalPrefix(title)) {
            // Access completed successfully
        }
    };

    return {
        "tool.execute.before": toolExecuteBefore,
        "tool.execute.after": toolExecuteAfter,
    };
}
