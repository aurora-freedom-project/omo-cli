/**
 * dev-rules-reminder - Inject development rules into conversation context
 * 
 * Automatically loads and injects development rules (YAGNI, KISS, DRY)
 * at conversation start or when relevant files are modified.
 */

import type { PluginInput } from "@opencode-ai/plugin";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "../../shared";

interface ConversationStartInput {
    conversationID: string;
    sessionID: string;
}

interface ConversationStartOutput {
    systemPrompt?: string;
}

const RULES_PATHS = [
    ".agent/rules/development-rules.md",
    ".claude/rules/development-rules.md",
    ".gemini/rules/development-rules.md",
    "assets/default-rules.md",
];

/**
 * Find and read development rules file
 */
function loadDevelopmentRules(projectPath: string): string | null {
    // Try project-specific rules first
    for (const rulePath of RULES_PATHS.slice(0, -1)) {
        const fullPath = join(projectPath, rulePath);
        if (existsSync(fullPath)) {
            try {
                const content = readFileSync(fullPath, 'utf-8');
                return content;
            } catch (error) {
                log("[dev-rules-reminder] Failed to read rules", { fullPath, error });
            }
        }
    }

    // Fallback to default rules (bundled in assets)
    const defaultRulesPath = join(__dirname, "../..", RULES_PATHS[RULES_PATHS.length - 1]);
    if (existsSync(defaultRulesPath)) {
        try {
            const content = readFileSync(defaultRulesPath, 'utf-8');
            return content;
        } catch (error) {
            log("[dev-rules-reminder] Failed to read default rules", { error });
        }
    }

    return null;
}

/**
 * Format rules for system prompt injection
 */
function formatRulesForPrompt(rulesContent: string): string {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DEVELOPMENT RULES REMINDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${rulesContent}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**IMPORTANT**: Always follow these development rules throughout this conversation.
Apply YAGNI, KISS, and DRY principles to all code you write.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

export function createDevRulesReminderHook(ctx: PluginInput) {
    /**
     * Hook that runs at conversation start
     * Injects development rules into system prompt
     */
    const conversationStart = async (
        input: ConversationStartInput,
        output: ConversationStartOutput
    ) => {
        // Load development rules
        const rulesContent = loadDevelopmentRules(ctx.directory);

        if (!rulesContent) {
            // No rules found, skip injection
            return;
        }

        // Format and inject rules
        const formattedRules = formatRulesForPrompt(rulesContent);

        // Append to existing system prompt or create new one
        if (output.systemPrompt) {
            output.systemPrompt += `\n\n${formattedRules}`;
        } else {
            output.systemPrompt = formattedRules;
        }
    };

    return {
        "conversation.start": conversationStart,
    };
}
