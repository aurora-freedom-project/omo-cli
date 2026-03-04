/**
 * Shared test helpers — typed mock factories.
 *
 * Provides properly-typed mock constructors for common SDK types
 * to eliminate `as any` casts in test files.
 *
 * Usage:
 *   import { createMockToolContext, createMockPluginInput } from "../test-helpers"
 */

import type { ToolContext } from "@opencode-ai/plugin/tool"
import type { PluginInput } from "@opencode-ai/plugin"

// ─── ToolContext ────────────────────────────────────────────────────────────

/**
 * Creates a properly-typed mock ToolContext.
 *
 * ToolContext shape (from @opencode-ai/plugin/tool):
 *   sessionID, messageID, agent, directory, worktree, abort, metadata(), ask()
 */
export function createMockToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: "/test/project",
        worktree: "/test/project",
        abort: new AbortController().signal,
        metadata: (() => { }) as ToolContext["metadata"],
        ask: (async () => { }) as ToolContext["ask"],
        ...overrides,
    }
}

// ─── PluginInput ────────────────────────────────────────────────────────────

/**
 * Partial PluginInput type for testing hooks.
 * The full PluginInput requires a real OpencodeClient + BunShell,
 * so tests typically only need `client` and `directory`.
 */
export type TestPluginInput = {
    client: Record<string, unknown>
    directory: string
    worktree?: string
    project?: Record<string, unknown>
    serverUrl?: URL
}

/**
 * Creates a mock PluginInput-compatible object.
 * Cast result to PluginInput when passing to hook constructors.
 */
export function createMockPluginInput(overrides: Partial<TestPluginInput> = {}): TestPluginInput {
    return {
        client: {},
        directory: "/test/project",
        worktree: "/test/project",
        project: {},
        ...overrides,
    }
}

// ─── OpencodeClient (partial mock) ──────────────────────────────────────────

/**
 * Standard mock client shape for delegate-task, providers-cache, and session tests.
 * Matches the subset of ReturnType<typeof createOpencodeClient> used in tests.
 */
export interface MockOpencodeClient {
    session: {
        get: ReturnType<typeof import("bun:test").mock>
        create: ReturnType<typeof import("bun:test").mock>
        prompt: ReturnType<typeof import("bun:test").mock>
        messages: ReturnType<typeof import("bun:test").mock>
        status?: ReturnType<typeof import("bun:test").mock>
    }
    app?: {
        agents: ReturnType<typeof import("bun:test").mock>
    }
    config?: {
        get: ReturnType<typeof import("bun:test").mock>
    }
    provider?: {
        list: ReturnType<typeof import("bun:test").mock>
    }
    model?: {
        list: ReturnType<typeof import("bun:test").mock>
    }
}

// ─── Hook Test Helpers ──────────────────────────────────────────────────────

/**
 * Creates a typed hook input for `tool.execute.before` / `tool.execute.after`.
 */
export function createMockToolHookInput(overrides: Record<string, unknown> = {}) {
    return {
        tool: "test-tool",
        sessionID: "test-session",
        callID: "call-1",
        ...overrides,
    }
}

/**
 * Creates a typed hook output for `tool.execute.before`.
 */
export function createMockToolHookOutput(overrides: Record<string, unknown> = {}) {
    return {
        args: {},
        ...overrides,
    }
}

/**
 * Creates a typed hook input for `chat.message`.
 */
export function createMockChatMessageInput(overrides: Record<string, unknown> = {}) {
    return {
        sessionID: "test-session",
        agent: "orchestrator",
        ...overrides,
    }
}

/**
 * Creates a typed hook output for `chat.message`.
 */
export function createMockChatMessageOutput(texts: string[]) {
    return {
        message: {} as Record<string, unknown>,
        parts: texts.map((text) => ({ type: "text" as const, text })),
    }
}

// ─── Config Mocks ───────────────────────────────────────────────────────────

/**
 * Creates a partial tmux config for tests.
 * Matches the full TmuxConfig shape expected by tmux-utils functions.
 */
export function createMockTmuxConfig(overrides: Record<string, unknown> = {}) {
    return {
        enabled: true,
        layout: "main-vertical" as const,
        main_pane_size: 50,
        main_pane_min_width: 80,
        agent_pane_min_width: 40,
        ...overrides,
    }
}
