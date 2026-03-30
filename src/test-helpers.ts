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
import type { BackgroundManager } from "./features/background-agent"

/** The SDK client type used throughout omo-cli */
export type OpencodeClient = PluginInput["client"]

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

// ─── Session Client (for session-poller / session-resume tests) ─────────────

/**
 * Lightweight mock client for tests that only need session.messages() and session.status().
 * Returns OpencodeClient type so consuming tests don't need to cast.
 *
 * Usage:
 *   const client = createMockSessionClient({
 *       messages: async () => ({ data: [{ id: 1 }] }),
 *   })
 */
interface MockSessionShape {
    messages: (...args: unknown[]) => Promise<{ data?: unknown[]; error?: string }>
    status?: (...args: unknown[]) => Promise<{ data: unknown }>
    prompt?: (...args: unknown[]) => Promise<{ data: unknown }>
    get?: (...args: unknown[]) => Promise<{ data: unknown }>
    create?: (...args: unknown[]) => Promise<{ data: unknown }>
}

/**
 * Creates a typed mock client for session-poller / session-resume tests.
 * Returns `OpencodeClient` to satisfy TypeScript strict checks in consumers.
 */
export function createMockSessionClient(
    sessionOverrides: Partial<MockSessionShape> = {}
): OpencodeClient {
    return {
        session: {
            messages: async () => ({ data: [] }),
            status: async () => ({ data: {} }),
            prompt: async () => ({ data: {} }),
            ...sessionOverrides,
        },
    } as unknown as OpencodeClient
}

// ─── Background Manager Mock ────────────────────────────────────────────────

/**
 * Shape for mock BackgroundManager overrides.
 */
interface MockBackgroundManagerShape {
    resume: (input: Record<string, unknown>) => Promise<{
        id: string
        sessionID: string
        description: string
        agent: string
        status: string
    }>
    launch: (...args: unknown[]) => Promise<unknown>
}

/**
 * Creates a typed mock BackgroundManager.
 * Returns `BackgroundManager` to satisfy TypeScript strict checks in consumers.
 */
export function createMockBackgroundManager(
    overrides: Partial<MockBackgroundManagerShape> = {}
): BackgroundManager {
    return {
        resume: async (input: Record<string, unknown>) => ({
            id: "task-bg-123",
            sessionID: (input.sessionId as string) ?? "mock-session",
            description: "Resumed task",
            agent: "explorer",
            status: "running",
        }),
        launch: async () => ({}),
        ...overrides,
    } as unknown as BackgroundManager
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

