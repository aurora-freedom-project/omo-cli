import { describe, it, expect } from "bun:test"
import {
    jaccardSimilarity,
    extractKeywords,
    checkDrift,
    detectPingPong,
    countPingPongRepeats,
    computeHash,
    computeOutcomeHash,
    isPollCall,
    loopGuardCheck,
    recordOutcome,
    getState,
    type SessionDriftState,
} from "./index"

describe("Drift Detector + Loop Guard", () => {
    // ════════════════════════════════════════════════════════════════════════
    // Drift Scoring (from Omni's drift.rs)
    // ════════════════════════════════════════════════════════════════════════

    describe("jaccardSimilarity", () => {
        it("returns 1 for identical strings", () => {
            expect(jaccardSimilarity("hello world test", "hello world test")).toBe(1)
        })

        it("returns 0 for completely different strings", () => {
            const sim = jaccardSimilarity("alpha beta gamma", "delta epsilon zeta")
            expect(sim).toBe(0)
        })

        it("returns partial similarity for overlapping words", () => {
            const sim = jaccardSimilarity("hello world test", "hello world other")
            expect(sim).toBeGreaterThan(0.3)
            expect(sim).toBeLessThan(1)
        })

        it("ignores short words (<3 chars)", () => {
            expect(jaccardSimilarity("a b c hello", "a b c world")).toBe(0)
        })

        it("handles empty strings", () => {
            expect(jaccardSimilarity("", "")).toBe(1)
            expect(jaccardSimilarity("", "hello")).toBe(0)
        })
    })

    describe("extractKeywords", () => {
        it("extracts meaningful words", () => {
            const keywords = extractKeywords("implement JWT authentication system")
            expect(keywords.has("implement")).toBe(true)
            expect(keywords.has("authentication")).toBe(true)
            expect(keywords.has("system")).toBe(true)
        })

        it("filters stop words", () => {
            const keywords = extractKeywords("the quick brown fox is a test")
            expect(keywords.has("the")).toBe(false)
            expect(keywords.has("quick")).toBe(true)
        })
    })

    describe("checkDrift — drift scoring", () => {
        function createState(overrides: Partial<SessionDriftState> = {}): SessionDriftState {
            return {
                recentToolCalls: [],
                recentOutputs: [],
                consecutiveSimilar: 0,
                totalToolCalls: 0,
                driftAlerted: false,
                originalTaskKeywords: new Set(),
                callCounts: new Map(),
                outcomeCounts: new Map(),
                blockedOutcomes: new Set(),
                recentHashes: [],
                hashToTool: new Map(),
                warningsEmitted: new Map(),
                blockedCalls: 0,
                ...overrides,
            }
        }

        it("returns no drift with insufficient data", () => {
            const state = createState({ totalToolCalls: 2 })
            const result = checkDrift(state)
            expect(result.isDrifting).toBe(false)
            expect(result.severity).toBe("none")
        })

        it("detects drift from consecutive similar outputs", () => {
            const state = createState({
                totalToolCalls: 10,
                consecutiveSimilar: 3,
            })
            const result = checkDrift(state)
            expect(result.isDrifting).toBe(true)
            expect(result.score).toBeGreaterThanOrEqual(30)
        })

        it("detects drift from repetitive tool calls", () => {
            const calls = Array.from({ length: 6 }, () => ({
                tool: "read_file",
                args: JSON.stringify({ path: "/same/file.ts" }),
                hash: "abc",
                timestamp: Date.now(),
            }))
            const state = createState({
                totalToolCalls: 10,
                recentToolCalls: calls,
            })
            const result = checkDrift(state)
            expect(result.isDrifting).toBe(true)
        })

        it("no drift with varied tool calls", () => {
            const tools = ["read_file", "grep_search", "write_file", "list_dir", "ast_grep_search"]
            const calls = tools.map((t, i) => ({
                tool: t,
                args: JSON.stringify({ path: `/file${i}.ts` }),
                hash: `hash_${i}`,
                timestamp: Date.now() + i * 1000,
            }))
            const state = createState({
                totalToolCalls: 6,
                recentToolCalls: calls,
            })
            const result = checkDrift(state)
            expect(result.isDrifting).toBe(false)
        })

        it("detects critical drift with multiple signals", () => {
            const calls = Array.from({ length: 6 }, () => ({
                tool: "read_file",
                args: JSON.stringify({ path: "/same/file.ts" }),
                hash: "abc",
                timestamp: Date.now(),
            }))
            const state = createState({
                totalToolCalls: 20,
                consecutiveSimilar: 4,
                recentToolCalls: calls,
                recentOutputs: [
                    "File contents of file.ts: function hello() {}",
                    "File contents of file.ts: function hello() {}",
                    "File contents of file.ts: function hello() {}",
                ],
            })
            const result = checkDrift(state)
            expect(result.isDrifting).toBe(true)
            expect(result.severity).toBe("critical")
        })
    })

    // ════════════════════════════════════════════════════════════════════════
    // Loop Guard (from Omni's loop_guard.rs)
    // ════════════════════════════════════════════════════════════════════════

    describe("computeHash", () => {
        it("produces consistent hashes", () => {
            const h1 = computeHash("read_file", '{"path":"/test.ts"}')
            const h2 = computeHash("read_file", '{"path":"/test.ts"}')
            expect(h1).toBe(h2)
        })

        it("produces different hashes for different inputs", () => {
            const h1 = computeHash("read_file", '{"path":"/a.ts"}')
            const h2 = computeHash("read_file", '{"path":"/b.ts"}')
            expect(h1).not.toBe(h2)
        })
    })

    describe("computeOutcomeHash", () => {
        it("includes result in hash", () => {
            const h1 = computeOutcomeHash("tool", '{"a":1}', "result_A")
            const h2 = computeOutcomeHash("tool", '{"a":1}', "result_B")
            expect(h1).not.toBe(h2)
        })

        it("hashes match for identical outcomes", () => {
            const h1 = computeOutcomeHash("tool", '{"a":1}', "same_result")
            const h2 = computeOutcomeHash("tool", '{"a":1}', "same_result")
            expect(h1).toBe(h2)
        })
    })

    describe("isPollCall", () => {
        it("detects docker ps as poll", () => {
            expect(isPollCall("interactive_bash", { command: "docker ps --status" })).toBe(true)
        })

        it("detects status keyword in args", () => {
            expect(isPollCall("some_tool", { check: "status" })).toBe(true)
        })

        it("rejects non-poll tool calls", () => {
            expect(isPollCall("read_file", { path: "/test.ts" })).toBe(false)
        })
    })

    describe("detectPingPong", () => {
        it("detects A-B-A-B-A-B pattern", () => {
            const map = new Map([["a", "read_file"], ["b", "write_file"]])
            const hashes = ["a", "b", "a", "b", "a", "b"]
            const result = detectPingPong(hashes, map)
            expect(result).not.toBeNull()
            expect(result).toContain("Ping-pong")
            expect(result).toContain("read_file")
            expect(result).toContain("write_file")
        })

        it("detects A-B-C-A-B-C-A-B-C pattern", () => {
            const map = new Map([["a", "tool_a"], ["b", "tool_b"], ["c", "tool_c"]])
            const hashes = ["a", "b", "c", "a", "b", "c", "a", "b", "c"]
            const result = detectPingPong(hashes, map)
            expect(result).not.toBeNull()
            expect(result).toContain("Ping-pong")
        })

        it("returns null for no pattern", () => {
            const map = new Map<string, string>()
            const hashes = ["a", "b", "c", "d", "e", "f"]
            expect(detectPingPong(hashes, map)).toBeNull()
        })

        it("returns null for insufficient data", () => {
            expect(detectPingPong(["a", "b"], new Map())).toBeNull()
        })
    })

    describe("countPingPongRepeats", () => {
        it("counts 2-element repeats", () => {
            expect(countPingPongRepeats(["a", "b", "a", "b", "a", "b"])).toBe(3)
        })

        it("counts 3-element repeats", () => {
            expect(countPingPongRepeats(["a", "b", "c", "a", "b", "c", "a", "b", "c"])).toBe(3)
        })

        it("returns 0 for no repeats", () => {
            expect(countPingPongRepeats(["a", "b", "c", "d"])).toBe(0)
        })
    })

    describe("loopGuardCheck", () => {
        it("allows below threshold", () => {
            const state = getState("test-loop-allow")
            state.totalToolCalls = 1
            const result = loopGuardCheck(state, "read_file", '{"path":"/a.ts"}', { path: "/a.ts" })
            expect(result.verdict).toBe("allow")
        })

        it("warns at warn threshold", () => {
            const state = getState("test-loop-warn")
            const argsStr = '{"path":"/same.ts"}'
            const args = { path: "/same.ts" }
            // Calls 1-2
            state.totalToolCalls = 1; loopGuardCheck(state, "read_file", argsStr, args)
            state.totalToolCalls = 2; loopGuardCheck(state, "read_file", argsStr, args)
            // Call 3 → warn
            state.totalToolCalls = 3
            const result = loopGuardCheck(state, "read_file", argsStr, args)
            expect(result.verdict).toBe("warn")
        })

        it("blocks at block threshold", () => {
            const state = getState("test-loop-block")
            const argsStr = '{"cmd":"ls"}'
            const args = { cmd: "ls" }
            for (let i = 0; i < 4; i++) {
                state.totalToolCalls = i + 1
                loopGuardCheck(state, "shell", argsStr, args)
            }
            state.totalToolCalls = 5
            const result = loopGuardCheck(state, "shell", argsStr, args)
            expect(result.verdict).toBe("block")
        })

        it("circuit breaks at global limit", () => {
            const state = getState("test-circuit-break")
            state.totalToolCalls = 51 // > GLOBAL_CIRCUIT_BREAKER (50)
            const result = loopGuardCheck(state, "any_tool", '{"x":1}', { x: 1 })
            expect(result.verdict).toBe("circuit_break")
        })

        it("relaxes thresholds for poll tools", () => {
            const state = getState("test-poll-relax")
            const argsStr = '{"command":"docker ps --status"}'
            const args = { command: "docker ps --status" }
            // WARN_THRESHOLD * POLL_MULTIPLIER = 3 * 3 = 9
            for (let i = 0; i < 8; i++) {
                state.totalToolCalls = i + 1
                const result = loopGuardCheck(state, "interactive_bash", argsStr, args)
                expect(result.verdict).toBe("allow")
            }
        })
    })

    describe("recordOutcome", () => {
        it("returns null on first occurrence", () => {
            const state = getState("test-outcome-1")
            const result = recordOutcome(state, "read_file", '{"path":"/test"}', "content here")
            expect(result).toBeNull()
        })

        it("warns on second identical outcome", () => {
            const state = getState("test-outcome-2")
            recordOutcome(state, "read_file", '{"path":"/test"}', "same content")
            const result = recordOutcome(state, "read_file", '{"path":"/test"}', "same content")
            expect(result).not.toBeNull()
            expect(result).toContain("identical results")
        })

        it("blocks on third identical outcome", () => {
            const state = getState("test-outcome-3")
            recordOutcome(state, "read_file", '{"path":"/test"}', "same")
            recordOutcome(state, "read_file", '{"path":"/test"}', "same")
            const result = recordOutcome(state, "read_file", '{"path":"/test"}', "same")
            expect(result).toContain("isn't working")
            // Verify the call hash is now in blockedOutcomes
            expect(state.blockedOutcomes.size).toBeGreaterThan(0)
        })

        it("does not trigger for different results", () => {
            const state = getState("test-outcome-diff")
            recordOutcome(state, "read_file", '{"path":"/test"}', "content_A")
            const result = recordOutcome(state, "read_file", '{"path":"/test"}', "content_B")
            expect(result).toBeNull()
        })
    })
})
