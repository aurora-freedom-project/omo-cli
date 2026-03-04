import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test"

// Mock the storage functions before importing the unit under test
const mockStorage = {
  findEmptyMessages: mock(),
  findEmptyMessageByIndex: mock(),
  findMessageByIndexNeedingThinking: mock(),
  findMessagesWithEmptyTextParts: mock(),
  findMessagesWithOrphanThinking: mock(),
  findMessagesWithThinkingBlocks: mock(),
  findMessagesWithThinkingOnly: mock(),
  injectTextPart: mock(),
  prependThinkingPart: mock(),
  readParts: mock(),
  replaceEmptyTextParts: mock(),
  stripThinkingParts: mock()
}
mock.module("./storage", () => mockStorage)

import { detectErrorType, createSessionRecoveryHook } from "./index"

describe("session-recovery/index", () => {
  beforeEach(() => {
    Object.values(mockStorage).forEach(m => m.mockReset())
  })

  afterEach(() => {
    mock.restore()
  })

  describe("detectErrorType", () => {
    test("returns null for non-matching strings or objects", () => {
      expect(detectErrorType("unknown error")).toBeNull()
      expect(detectErrorType(null)).toBeNull()
      expect(detectErrorType({ some: "garbage" })).toBeNull()
      // cyclical objects for getErrorMessage's stringify catch
      const obj: any = {}; obj.a = obj;
      expect(detectErrorType(obj)).toBeNull()
    })

    test("parses string error types accurately", () => {
      expect(detectErrorType("thinking block must start with")).toBe("thinking_block_order")
      expect(detectErrorType("expected thinking but found text")).toBe("thinking_block_order")
      expect(detectErrorType("thinking is disabled but cannot contain thinking")).toBe("thinking_disabled_violation")
      expect(detectErrorType("missing tool_use for tool_result")).toBe("tool_result_missing")
    })

    test("resolves properties in error objects across varying path patterns", () => {
      // data.message
      expect(detectErrorType({ data: { message: "thinking missing preceeding block" } })).toBe("thinking_block_order")
      // error.message
      expect(detectErrorType({ error: { message: "tool_use tool_result" } })).toBe("tool_result_missing")
      // root message
      expect(detectErrorType({ message: "thinking is disabled cannot contain" })).toBe("thinking_disabled_violation")
      // data.error.message
      expect(detectErrorType({ data: { error: { message: "final block cannot be thinking" } } })).toBe("thinking_block_order")
    })
  })

  describe("createSessionRecoveryHook", () => {
    const createMockClient = (msgsMock: any, abortMock: any, promptMock: any, toastMock: any) => ({
      session: {
        messages: msgsMock,
        abort: abortMock,
        prompt: promptMock
      },
      tui: {
        showToast: toastMock
      }
    })
    const mockDirectory = "/test/dir"
    const DUMMY_SESSION = "sess1"
    const DUMMY_ERR_TOOL = { message: "missing tool_use for tool_result messages.3" }
    const DUMMY_ERR_THINK = { message: "thinking must start with messages.5" }
    const DUMMY_ERR_THINK_DIS = { message: "thinking is disabled cannot contain" }

    const makeInput = (client: unknown) => ({ client, directory: mockDirectory } as any)
    const makeInputWithConfig = (client: unknown, config: Record<string, unknown>) => [makeInput(client), config as any] as const

    test("isRecoverableError aliases detectErrorType properly", () => {
      const hook = createSessionRecoveryHook(makeInput({}))
      expect(hook.isRecoverableError("missing tool_use for tool_result")).toBe(true)
      expect(hook.isRecoverableError("random parsing issue")).toBe(false)
    })

    test("handleSessionRecovery returns false on invalid info states", async () => {
      const hook = createSessionRecoveryHook(makeInput({}))
      // Non-assistant or missing error states
      expect(await hook.handleSessionRecovery(null as any)).toBe(false)
      expect(await hook.handleSessionRecovery({ role: "user", error: DUMMY_ERR_TOOL })).toBe(false)
      expect(await hook.handleSessionRecovery({ role: "assistant" })).toBe(false)
      expect(await hook.handleSessionRecovery({ role: "assistant", error: "not-handled" })).toBe(false)
      // Missing sessionID or agent ID
      expect(await hook.handleSessionRecovery({ role: "assistant", error: DUMMY_ERR_TOOL })).toBe(false)
      expect(await hook.handleSessionRecovery({ role: "assistant", error: DUMMY_ERR_TOOL, sessionID: "s1" })).toBe(false)
    })

    test("caches ongoing processing to prevent duplication", async () => {
      const abortMock = mock().mockResolvedValue({})
      const msgsMock = mock().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)))
      const client = createMockClient(msgsMock, abortMock, mock(), mock().mockResolvedValue({}))
      const hook = createSessionRecoveryHook(makeInput(client))

      const p1 = hook.handleSessionRecovery({ role: "assistant", sessionID: "s1", id: "msg1", error: DUMMY_ERR_TOOL })
      const p2 = hook.handleSessionRecovery({ role: "assistant", sessionID: "s1", id: "msg1", error: DUMMY_ERR_TOOL })

      const [r1, r2] = await Promise.all([p1, p2])
      // It early exits before abort logic via processingErrors.has() cache returns false.
      expect(r2).toBe(false)
      // R1 will try to run then fail naturally (returns false) because msgs endpoint returns empty.
      expect(r1).toBe(false)
    })

    test("invokes callbacks cleanly via try/finally", async () => {
      const client = createMockClient(
        mock().mockResolvedValue({ data: [] }),
        mock().mockResolvedValue({}), mock(), mock().mockResolvedValue({}))
      const hook = createSessionRecoveryHook(makeInput(client))

      let abortCalled = false
      let completeCalled = false
      hook.setOnAbortCallback((s) => { abortCalled = true; expect(s).toBe(DUMMY_SESSION) })
      hook.setOnRecoveryCompleteCallback((s) => { completeCalled = true; expect(s).toBe(DUMMY_SESSION) })

      await hook.handleSessionRecovery({ role: "assistant", sessionID: DUMMY_SESSION, id: "msg1", error: DUMMY_ERR_TOOL })
      expect(abortCalled).toBe(true)
      expect(completeCalled).toBe(true)
    })

    test("recoverToolResultMissing path with SDK API parts payload fallback", async () => {
      const promptMock = mock().mockResolvedValue({})
      const msgs = [{ info: { id: "msg1", role: "assistant" }, parts: [{ type: "tool_use", id: "tu-1" }, { type: "text" }] }]
      const client = createMockClient(mock().mockResolvedValue({ data: msgs }), mock().mockResolvedValue({}), promptMock, mock().mockResolvedValue({}))
      const hook = createSessionRecoveryHook(makeInput(client))

      const result = await hook.handleSessionRecovery({ role: "assistant", sessionID: DUMMY_SESSION, id: "msg1", error: DUMMY_ERR_TOOL })

      expect(result).toBe(true)
      expect(promptMock).toHaveBeenCalledWith({
        path: { id: DUMMY_SESSION },
        body: { parts: [{ type: "tool_result", tool_use_id: "tu-1", content: expect.any(String) }] }
      })
    })

    test("recoverToolResultMissing path with storage disk fallback if API parts empty", async () => {
      mockStorage.readParts.mockReturnValue([{ type: "tool", callID: "disk-tu-1", state: { input: {} } }])
      const promptMock = mock().mockResolvedValue({})
      const msgs = [{ info: { id: "msg1", role: "assistant" } }] // empty parts natively
      const client = createMockClient(mock().mockResolvedValue({ data: msgs }), mock().mockResolvedValue({}), promptMock, mock().mockResolvedValue({}))

      const hook = createSessionRecoveryHook(makeInput(client))
      const result = await hook.handleSessionRecovery({ role: "assistant", sessionID: DUMMY_SESSION, id: "msg1", error: DUMMY_ERR_TOOL })

      expect(result).toBe(true)
      expect(mockStorage.readParts).toHaveBeenCalledWith("msg1")
    })

    test("recoverThinkingBlockOrder applies targeted fix by index and tests experimental autoResume triggers", async () => {
      mockStorage.findMessageByIndexNeedingThinking.mockReturnValue("msg-idx-fail")
      mockStorage.prependThinkingPart.mockReturnValue(true)

      const promptMock = mock().mockResolvedValue({})
      const msgs = [{ info: { id: "msg-last", role: "user", agent: "agentX", model: "modelY" } }, { info: { id: "msg1", role: "assistant" } }]
      const client = createMockClient(mock().mockResolvedValue({ data: msgs }), mock().mockResolvedValue({}), promptMock, mock().mockResolvedValue({}))

      const hook = createSessionRecoveryHook(...makeInputWithConfig(client, { experimental: { auto_resume: true } }))
      // messages.5 extracted index
      const result = await hook.handleSessionRecovery({ role: "assistant", sessionID: DUMMY_SESSION, id: "msg1", error: DUMMY_ERR_THINK })

      expect(result).toBe(true)
      expect(mockStorage.findMessageByIndexNeedingThinking).toHaveBeenCalledWith(DUMMY_SESSION, 5)
      expect(mockStorage.prependThinkingPart).toHaveBeenCalledWith(DUMMY_SESSION, "msg-idx-fail")

      expect(promptMock).toHaveBeenCalledWith({
        path: { id: DUMMY_SESSION },
        body: { parts: [{ type: "text", text: expect.stringContaining("recovered - continuing pre") }], agent: "agentX", model: "modelY" }
      })
    })

    test("recoverThinkingBlockOrder fails index and cascades to orphan fixes", async () => {
      mockStorage.findMessageByIndexNeedingThinking.mockReturnValue(null) // skip index based
      mockStorage.findMessagesWithOrphanThinking.mockReturnValue(["orph1", "orph2"])
      mockStorage.prependThinkingPart.mockImplementation((s, m) => m === "orph2") // second one works

      const msgs = [{ info: { id: "msg1", role: "assistant" } }]
      const client = createMockClient(mock().mockResolvedValue({ data: msgs }), mock().mockResolvedValue({}), mock(), mock().mockResolvedValue({}))
      const hook = createSessionRecoveryHook(makeInput(client))

      const result = await hook.handleSessionRecovery({ role: "assistant", sessionID: DUMMY_SESSION, id: "msg1", error: DUMMY_ERR_THINK })
      expect(result).toBe(true)
      expect(mockStorage.findMessagesWithOrphanThinking).toHaveBeenCalled()
      expect(mockStorage.prependThinkingPart).toHaveBeenCalledTimes(2)
    })

    test("recoverThinkingDisabledViolation cleans out strip boundaries with autoResume logic checks", async () => {
      mockStorage.findMessagesWithThinkingBlocks.mockReturnValue(["think-msg1"])
      mockStorage.stripThinkingParts.mockReturnValue(true) // success modification

      const promptMock = mock().mockResolvedValue({})
      const msgs = [{ info: { id: "msglast", role: "user" } }, { info: { id: "msg1", role: "assistant" } }]
      const client = createMockClient(mock().mockResolvedValue({ data: msgs }), mock().mockResolvedValue({}), promptMock, mock().mockResolvedValue({}))
      const hook = createSessionRecoveryHook(...makeInputWithConfig(client, { experimental: { auto_resume: true } }))

      const result = await hook.handleSessionRecovery({ role: "assistant", sessionID: DUMMY_SESSION, id: "msg1", error: DUMMY_ERR_THINK_DIS })

      expect(result).toBe(true)
      expect(mockStorage.findMessagesWithThinkingBlocks).toHaveBeenCalledWith(DUMMY_SESSION)
      // should trigger auto-resume prompt request as experimental is enabled
      expect(promptMock).toHaveBeenCalled()
    })

    test("recoverToolResultMissing failure conditions", async () => {
      const client = createMockClient(mock().mockResolvedValue({ data: [{ info: { id: "msg1", role: "assistant" } }] }), mock().mockResolvedValue({}), mock().mockRejectedValue(new Error("fail")), mock().mockResolvedValue({}))
      const hook = createSessionRecoveryHook(makeInput(client))

      // 1. no tool ids -> false
      mockStorage.readParts.mockReturnValue([])
      expect(await hook.handleSessionRecovery({ role: "assistant", sessionID: DUMMY_SESSION, id: "msg1", error: DUMMY_ERR_TOOL })).toBe(false)

      // 2. prompt throws -> false
      mockStorage.readParts.mockReturnValue([{ type: "tool_use", id: "t1" }])
      expect(await hook.handleSessionRecovery({ role: "assistant", sessionID: DUMMY_SESSION, id: "msg1", error: DUMMY_ERR_TOOL })).toBe(false)
    })

    test("thinking_block failure and empty searches", async () => {
      mockStorage.findMessageByIndexNeedingThinking.mockReturnValue(null)
      mockStorage.findMessagesWithOrphanThinking.mockReturnValue([])
      const client = createMockClient(mock().mockResolvedValue({ data: [{ info: { id: "msg1", role: "assistant" } }] }), mock().mockResolvedValue({}), mock(), mock().mockResolvedValue({}))
      const hook = createSessionRecoveryHook(makeInput(client))

      expect(await hook.handleSessionRecovery({ role: "assistant", sessionID: DUMMY_SESSION, id: "msg1", error: DUMMY_ERR_THINK })).toBe(false)
    })

    test("thinking_disabled failure and empty searches", async () => {
      mockStorage.findMessagesWithThinkingBlocks.mockReturnValue([])
      const client = createMockClient(mock().mockResolvedValue({ data: [{ info: { id: "msg1", role: "assistant" } }] }), mock().mockResolvedValue({}), mock(), mock().mockResolvedValue({}))
      const hook = createSessionRecoveryHook(makeInput(client))

      expect(await hook.handleSessionRecovery({ role: "assistant", sessionID: DUMMY_SESSION, id: "msg1", error: DUMMY_ERR_THINK_DIS })).toBe(false)
    })

    test("resumeSession rejection and empty messages handling", async () => {
      mockStorage.findMessagesWithThinkingBlocks.mockReturnValue(["think1"])
      mockStorage.stripThinkingParts.mockReturnValue(true)
      const promptMock = mock().mockRejectedValue("fail")
      const client = createMockClient(mock().mockResolvedValue({ data: [{ info: { id: "msg1", role: "assistant" } }] }), mock().mockResolvedValue({}), promptMock, mock().mockResolvedValue({}))

      const hook = createSessionRecoveryHook(...makeInputWithConfig(client, { experimental: { auto_resume: true } }))
      expect(await hook.handleSessionRecovery({ role: "assistant", sessionID: DUMMY_SESSION, id: "msg1", error: DUMMY_ERR_THINK_DIS })).toBe(true) // success is true despite resume failing
    })
  })
})
