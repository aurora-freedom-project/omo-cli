/**
 * Output Content Gate — Tests
 * All patterns verified ReDoS-safe with bounded quantifiers.
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    scanContent,
    evaluateGate,
    gateCheck,
    getSessionStats,
    resetSession,
    CONTENT_PATTERNS,
    createOutputContentGateHook,
    type ContentViolation,
} from "./index"

describe("Output Content Gate", () => {
    beforeEach(() => {
        resetSession("test-session")
    })

    // ── Pattern Coverage ────────────────────────────────────────────────

    describe("pattern coverage", () => {
        it("has patterns for all 8 categories", () => {
            const categories = new Set(CONTENT_PATTERNS.map(p => p.category))
            expect(categories.size).toBe(8)
        })

        it("has both input and output direction patterns", () => {
            const hasInput = CONTENT_PATTERNS.some(p => p.direction === "input" || p.direction === "both")
            const hasOutput = CONTENT_PATTERNS.some(p => p.direction === "output" || p.direction === "both")
            expect(hasInput).toBe(true)
            expect(hasOutput).toBe(true)
        })

        it("total pattern count >= 20", () => {
            expect(CONTENT_PATTERNS.length).toBeGreaterThanOrEqual(20)
        })
    })

    // ── Dangerous Command Detection ─────────────────────────────────────

    describe("dangerous command detection (input)", () => {
        it("detects rm -rf /", () => {
            const v = scanContent("rm -rf / ", "bash", "input")
            expect(v.some(x => x.category === "dangerous_command")).toBe(true)
        })

        it("detects dd to disk", () => {
            const v = scanContent("dd if=/dev/zero of=/dev/sda", "bash", "input")
            expect(v.some(x => x.category === "dangerous_command")).toBe(true)
        })

        it("detects chmod 777 /", () => {
            const v = scanContent("chmod 777 /", "bash", "input")
            expect(v.some(x => x.category === "dangerous_command")).toBe(true)
        })

        it("allows normal commands", () => {
            const v = scanContent("ls -la /tmp", "bash", "input")
            expect(v.length).toBe(0)
        })
    })

    // ── Secret Leakage Detection ────────────────────────────────────────

    describe("secret leakage detection (output)", () => {
        it("detects AWS access keys", () => {
            const v = scanContent("AKIAIOSFODNN7EXAMPLE", "grep_search", "output")
            expect(v.some(x => x.category === "secret_leakage")).toBe(true)
        })

        it("detects OpenAI API keys", () => {
            const v = scanContent("sk-abcdefghijklmnopqrstuvwxyz12345678", "grep_search", "output")
            expect(v.some(x => x.category === "secret_leakage")).toBe(true)
        })

        it("detects GitHub tokens", () => {
            const v = scanContent("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYz123456789a", "grep_search", "output")
            expect(v.some(x => x.category === "secret_leakage")).toBe(true)
        })

        it("detects private keys", () => {
            const v = scanContent("-----BEGIN RSA PRIVATE KEY-----", "grep_search", "output")
            expect(v.some(x => x.category === "secret_leakage")).toBe(true)
        })

        it("detects password assignments", () => {
            const v = scanContent('password: "supersecret123"', "grep_search", "output")
            expect(v.some(x => x.category === "secret_leakage")).toBe(true)
        })

        it("does not flag normal text", () => {
            const v = scanContent("Hello, world!", "echo", "output")
            expect(v.length).toBe(0)
        })
    })

    // ── PII Detection ───────────────────────────────────────────────────

    describe("pii exposure detection (output)", () => {
        it("detects SSN patterns", () => {
            const v = scanContent("SSN: 123-45-6789", "db", "output")
            expect(v.some(x => x.category === "pii_exposure")).toBe(true)
        })

        it("detects Visa card numbers", () => {
            const v = scanContent("Card: 4111111111111111", "db", "output")
            expect(v.some(x => x.category === "pii_exposure")).toBe(true)
        })
    })

    // ── Path Traversal Detection ────────────────────────────────────────

    describe("path traversal detection (input)", () => {
        it("detects deep traversal", () => {
            const v = scanContent("../../../../etc/passwd", "bash", "input")
            expect(v.some(x => x.category === "path_traversal")).toBe(true)
        })

        it("detects /etc/shadow", () => {
            const v = scanContent("/etc/shadow", "bash", "input")
            expect(v.some(x => x.category === "path_traversal")).toBe(true)
        })
    })

    // ── Injection Detection ─────────────────────────────────────────────

    describe("injection detection (input)", () => {
        it("detects command injection via semicolon", () => {
            const v = scanContent("echo test; rm all", "bash", "input")
            expect(v.some(x => x.category === "injection")).toBe(true)
        })

        it("detects SQL injection", () => {
            const v = scanContent("' OR 1=1", "db", "input")
            expect(v.some(x => x.category === "injection")).toBe(true)
        })
    })

    // ── Privilege Abuse Detection ───────────────────────────────────────

    describe("privilege abuse detection (input)", () => {
        it("detects sudo su", () => {
            const v = scanContent("sudo su", "bash", "input")
            expect(v.some(x => x.category === "privilege_abuse")).toBe(true)
        })

        it("detects docker privileged", () => {
            const v = scanContent("docker run --privileged ubuntu", "bash", "input")
            expect(v.some(x => x.category === "privilege_abuse")).toBe(true)
        })
    })

    // ── Exempt Tools ────────────────────────────────────────────────────

    describe("exempt tools", () => {
        it("skips scanning for exempt tools", () => {
            const v = scanContent("AKIAIOSFODNN7EXAMPLE", "read_file", "output")
            expect(v.length).toBe(0)
        })

        it("scans non-exempt tools", () => {
            const v = scanContent("AKIAIOSFODNN7EXAMPLE", "grep_search", "output")
            expect(v.length).toBeGreaterThan(0)
        })
    })

    // ── Gate Evaluation ─────────────────────────────────────────────────

    describe("evaluateGate", () => {
        it("passes when no violations", () => {
            const r = evaluateGate([])
            expect(r.allowed).toBe(true)
            expect(r.action).toBe("pass")
        })

        it("warns on violations in warn mode", () => {
            const violations: ContentViolation[] = [{
                id: "t1", category: "dangerous_command", severity: "high",
                description: "test", evidence: "t", toolName: "bash",
                direction: "input", timestamp: Date.now(),
            }]
            const r = evaluateGate(violations)
            expect(r.allowed).toBe(true)
            expect(r.action).toBe("warned")
        })

        it("blocks critical in block mode", () => {
            const violations: ContentViolation[] = [{
                id: "t2", category: "dangerous_command", severity: "critical",
                description: "test", evidence: "t", toolName: "bash",
                direction: "input", timestamp: Date.now(),
            }]
            const r = evaluateGate(violations, { action: "block" })
            expect(r.allowed).toBe(false)
            expect(r.action).toBe("blocked")
        })
    })

    // ── Full Gate Check ─────────────────────────────────────────────────

    describe("gateCheck (integrated)", () => {
        it("scans and updates session state", () => {
            const r = gateCheck("test-session", "bash", "sudo su", "input")
            expect(r.violations.length).toBeGreaterThan(0)
            const stats = getSessionStats("test-session")
            expect(stats.totalScanned).toBe(1)
        })

        it("accumulates stats", () => {
            gateCheck("test-session", "bash", "rm -rf / ", "input")
            gateCheck("test-session", "grep_search", "AKIAIOSFODNN7EXAMPLE", "output")
            gateCheck("test-session", "echo", "Normal output", "output")
            const stats = getSessionStats("test-session")
            expect(stats.totalScanned).toBe(3)
        })
    })

    // ── Direction Filtering ─────────────────────────────────────────────

    describe("direction filtering", () => {
        it("output patterns ignored on input scan", () => {
            const v = scanContent("AKIAIOSFODNN7EXAMPLE", "bash", "input")
            expect(v.filter(x => x.category === "secret_leakage").length).toBe(0)
        })

        it("input patterns ignored on output scan", () => {
            const v = scanContent("sudo su", "bash", "output")
            expect(v.filter(x => x.category === "privilege_abuse").length).toBe(0)
        })
    })

    // ── Config Options ──────────────────────────────────────────────────

    describe("config options", () => {
        it("respects disabled state", () => {
            const v = scanContent("AKIAIOSFODNN7EXAMPLE", "grep_search", "output", { enabled: false })
            expect(v.length).toBe(0)
        })

        it("respects category filtering", () => {
            const v = scanContent("AKIAIOSFODNN7EXAMPLE", "grep_search", "output", { enforced: ["dangerous_command"] })
            expect(v.length).toBe(0)
        })
    })

    // ── Session Reset ───────────────────────────────────────────────────

    describe("session management", () => {
        it("resets session state", () => {
            gateCheck("test-session", "bash", "sudo su", "input")
            resetSession("test-session")
            const after = getSessionStats("test-session")
            expect(after.totalScanned).toBe(0)
        })
    })

    // ── Hook Creation ───────────────────────────────────────────────────

    describe("createOutputContentGateHook", () => {
        it("returns hook when enabled", () => {
            const hook = createOutputContentGateHook()
            expect(hook).not.toBeNull()
            expect(hook!["tool.execute.before"]).toBeDefined()
            expect(hook!["tool.execute.after"]).toBeDefined()
        })

        it("returns null when disabled", () => {
            expect(createOutputContentGateHook({ enabled: false })).toBeNull()
        })

        it("before handler runs without error", async () => {
            const hook = createOutputContentGateHook()!
            await hook["tool.execute.before"](
                { sessionID: "t", tool: "bash", args: { command: "ls" } }, {},
            )
        })

        it("after handler runs without error", async () => {
            const hook = createOutputContentGateHook()!
            await hook["tool.execute.after"](
                { sessionID: "t", tool: "bash", args: { command: "ls" } },
                { result: "file1.txt\nfile2.txt" },
            )
        })
    })

    // ── Violation IDs ───────────────────────────────────────────────────

    describe("violation IDs", () => {
        it("consistent IDs for same input", () => {
            const v1 = scanContent("sudo su", "bash", "input")
            const v2 = scanContent("sudo su", "bash", "input")
            if (v1.length > 0 && v2.length > 0) {
                expect(v1[0].id).toBe(v2[0].id)
            }
        })
    })
})
