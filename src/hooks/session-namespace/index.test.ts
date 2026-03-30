import { describe, it, expect, beforeEach } from "vitest"
import {
    createSessionPolicy, getSessionPolicy, getSessionUsage,
    validateToolCall, recordToolExecution, trackConcurrentStart, trackConcurrentEnd,
    clearAll, clearSession, createSessionNamespaceHook,
} from "./index"

describe("Session Namespace Isolation", () => {
    beforeEach(() => { clearAll() })

    describe("createSessionPolicy", () => {
        it("creates policy with defaults", () => {
            const policy = createSessionPolicy("s1", "test-session", "user1")
            expect(policy.sessionID).toBe("s1")
            expect(policy.name).toBe("test-session")
            expect(policy.owner).toBe("user1")
            expect(policy.maxToolCalls).toBe(200)
        })

        it("accepts overrides", () => {
            const policy = createSessionPolicy("s1", "restricted", "user1", {
                maxToolCalls: 10,
                toolBlocklist: ["sandbox_exec", "write_file"],
            })
            expect(policy.maxToolCalls).toBe(10)
            expect(policy.toolBlocklist).toContain("write_file")
        })
    })

    describe("getSessionPolicy", () => {
        it("returns default for unknown session", () => {
            const policy = getSessionPolicy("unknown")
            expect(policy.name).toBe("default")
        })
        it("returns custom policy", () => {
            createSessionPolicy("s1", "custom", "user1")
            expect(getSessionPolicy("s1").name).toBe("custom")
        })
    })

    describe("validateToolCall", () => {
        it("allows normal tool calls", () => {
            createSessionPolicy("s1", "test", "user1")
            const result = validateToolCall("s1", "read_file", { path: "/tmp/test.txt" })
            expect(result.allowed).toBe(true)
        })

        it("blocks tools in blocklist", () => {
            createSessionPolicy("s1", "test", "user1", {
                toolBlocklist: ["sandbox_exec", "dangerous_tool"],
            })
            const result = validateToolCall("s1", "sandbox_exec", {})
            expect(result.allowed).toBe(false)
            expect(result.violatedConstraint).toBe("toolBlocklist")
        })

        it("blocks tools not in allowlist", () => {
            createSessionPolicy("s1", "test", "user1", {
                toolAllowlist: ["read_file", "grep_search"],
            })
            const result = validateToolCall("s1", "write_file", {})
            expect(result.allowed).toBe(false)
            expect(result.violatedConstraint).toBe("toolAllowlist")
        })

        it("enforces max tool calls", () => {
            createSessionPolicy("s1", "test", "user1", { maxToolCalls: 2 })
            recordToolExecution("s1", "tool1", 100)
            recordToolExecution("s1", "tool2", 100)

            const result = validateToolCall("s1", "tool3", {})
            expect(result.allowed).toBe(false)
            expect(result.violatedConstraint).toBe("maxToolCalls")
        })

        it("enforces max output size", () => {
            createSessionPolicy("s1", "test", "user1", { maxOutputSize: 100 })
            recordToolExecution("s1", "tool1", 101)

            const result = validateToolCall("s1", "tool2", {})
            expect(result.allowed).toBe(false)
            expect(result.violatedConstraint).toBe("maxOutputSize")
        })

        it("enforces max concurrent", () => {
            createSessionPolicy("s1", "test", "user1", { maxConcurrent: 1 })
            trackConcurrentStart("s1")

            const result = validateToolCall("s1", "tool2", {})
            expect(result.allowed).toBe(false)
            expect(result.violatedConstraint).toBe("maxConcurrent")
        })

        it("blocks banned domains in network tools", () => {
            createSessionPolicy("s1", "test", "user1")
            const result = validateToolCall("s1", "web_crawl", { url: "http://localhost:8080" })
            expect(result.allowed).toBe(false)
            expect(result.violatedConstraint).toBe("networkPolicy.blockedDomains")
        })

        it("allows permitted domains", () => {
            createSessionPolicy("s1", "test", "user1")
            const result = validateToolCall("s1", "web_crawl", { url: "https://example.com" })
            expect(result.allowed).toBe(true)
        })

        it("blocks access to sensitive paths", () => {
            createSessionPolicy("s1", "test", "user1")
            const result = validateToolCall("s1", "read_file", { path: "/etc/shadow" })
            expect(result.allowed).toBe(false)
            expect(result.violatedConstraint).toBe("fsPolicy.blockedPaths")
        })

        it("blocks oversized writes", () => {
            createSessionPolicy("s1", "test", "user1", {
                fsPolicy: {
                    readPaths: ["**/*"],
                    writePaths: ["**/*"],
                    blockedPaths: [],
                    maxWriteSize: 10,
                },
            })
            const result = validateToolCall("s1", "write_file", {
                path: "/tmp/test.txt",
                content: "x".repeat(20),
            })
            expect(result.allowed).toBe(false)
            expect(result.violatedConstraint).toBe("fsPolicy.maxWriteSize")
        })

        it("respects enforceMode=false (log only)", () => {
            createSessionPolicy("s1", "test", "user1", {
                toolBlocklist: ["sandbox_exec"],
            })
            const result = validateToolCall("s1", "sandbox_exec", {}, { enforceMode: false })
            expect(result.allowed).toBe(true)
            expect(result.reason).toBeDefined()
        })
    })

    describe("usage tracking", () => {
        it("tracks tool calls", () => {
            recordToolExecution("s1", "nmap", 500)
            recordToolExecution("s1", "nmap", 300)
            recordToolExecution("s1", "grep", 100)

            const usage = getSessionUsage("s1")
            expect(usage.toolCalls).toBe(3)
            expect(usage.totalOutputSize).toBe(900)
            expect(usage.toolCallsByName.get("nmap")).toBe(2)
            expect(usage.toolCallsByName.get("grep")).toBe(1)
        })

        it("tracks concurrent execution", () => {
            trackConcurrentStart("s1")
            trackConcurrentStart("s1")
            expect(getSessionUsage("s1").activeConcurrent).toBe(2)

            trackConcurrentEnd("s1")
            expect(getSessionUsage("s1").activeConcurrent).toBe(1)
        })

        it("does not go below 0 concurrent", () => {
            trackConcurrentEnd("s1")
            expect(getSessionUsage("s1").activeConcurrent).toBe(0)
        })
    })

    describe("session cleanup", () => {
        it("clears session state", () => {
            createSessionPolicy("s1", "test", "user1")
            recordToolExecution("s1", "tool", 100)
            clearSession("s1")

            expect(getSessionUsage("s1").toolCalls).toBe(0)
            expect(getSessionPolicy("s1").name).toBe("default")
        })
    })

    describe("createSessionNamespaceHook", () => {
        it("returns hook when enabled", () => {
            const hook = createSessionNamespaceHook()
            expect(hook).not.toBeNull()
            expect(hook!["tool.execute.before"]).toBeDefined()
            expect(hook!["tool.execute.after"]).toBeDefined()
        })
        it("returns null when disabled", () => {
            expect(createSessionNamespaceHook({ enabled: false })).toBeNull()
        })
    })
})
