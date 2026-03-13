import type { PluginInput } from "@opencode-ai/plugin";
import {
  loadAgentUsageState,
  saveAgentUsageState,
  clearAgentUsageState,
} from "./storage";
import { TARGET_TOOLS, AGENT_TOOLS, REMINDER_MESSAGE } from "./constants";
import type { AgentUsageState } from "./types";
import {
  type ContextBudget,
  InjectionPriority,
  estimateTokens,
} from "../../shared/context-budget";

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

interface EventInput {
  event: {
    type: string;
    properties?: unknown;
  };
}

export function createAgentUsageReminderHook(_ctx: PluginInput, budget?: ContextBudget) {
  const sessionStates = new Map<string, AgentUsageState>();

  function getOrCreateState(sessionID: string): AgentUsageState {
    if (!sessionStates.has(sessionID)) {
      const persisted = loadAgentUsageState(sessionID);
      const state: AgentUsageState = persisted ?? {
        sessionID,
        agentUsed: false,
        reminderCount: 0,
        updatedAt: Date.now(),
      };
      sessionStates.set(sessionID, state);
    }
    return sessionStates.get(sessionID)!;
  }

  function markAgentUsed(sessionID: string): void {
    const state = getOrCreateState(sessionID);
    state.agentUsed = true;
    state.updatedAt = Date.now();
    saveAgentUsageState(state);
  }

  function resetState(sessionID: string): void {
    sessionStates.delete(sessionID);
    clearAgentUsageState(sessionID);
  }

  const toolExecuteAfter = async (
    input: ToolExecuteInput,
    output: ToolExecuteOutput,
  ) => {
    const { tool, sessionID } = input;
    const toolLower = tool.toLowerCase();

    if (AGENT_TOOLS.has(toolLower)) {
      markAgentUsed(sessionID);
      return;
    }

    if (!TARGET_TOOLS.has(toolLower)) {
      return;
    }

    const state = getOrCreateState(sessionID);

    if (state.agentUsed) {
      return;
    }

    // Budget check: usage reminder is LOW priority — skip when budget tight
    if (budget) {
      const tokens = estimateTokens(REMINDER_MESSAGE);
      const allocation = budget.requestAllocation(
        "agent-usage-reminder", InjectionPriority.LOW, tokens, sessionID
      );
      if (!allocation.allowed) return;
      budget.recordInjection("agent-usage-reminder", tokens, sessionID);
    }

    output.output += REMINDER_MESSAGE;
    state.reminderCount++;
    state.updatedAt = Date.now();
    saveAgentUsageState(state);
  };

  const eventHandler = async ({ event }: EventInput) => {
    const props = event.properties as Record<string, unknown> | undefined;

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined;
      if (sessionInfo?.id) {
        resetState(sessionInfo.id);
      }
    }

    if (event.type === "session.compacted") {
      const sessionID = (props?.sessionID ??
        (props?.info as { id?: string } | undefined)?.id) as string | undefined;
      if (sessionID) {
        resetState(sessionID);
      }
    }
  };

  return {
    "tool.execute.after": toolExecuteAfter,
    event: eventHandler,
  };
}
