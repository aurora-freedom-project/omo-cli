/**
 * Output Guard — Post-processing safety filter for model outputs.
 *
 * Completes the 3-layer guardrail model from CAI (aliasrobotics):
 *   Layer 1: Input Guard (pre-processing) ✅ Exists
 *   Layer 2: Processing Guard (drift detector) ✅ Exists
 *   Layer 3: Output Guard (post-processing) ← THIS MODULE
 *
 * Detects dangerous patterns in model-generated output:
 * - Reverse shells / bind shells
 * - Credential dumps / password hashes
 * - Internal/private IP addresses
 * - Base64-encoded suspicious payloads
 * - Exfiltration commands (curl data out)
 * - Privilege escalation commands
 *
 * Sources: CAI (aliasrobotics), AI-Infra-Guard (Tencent)
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export interface OutputGuardResult {
    /** Whether the output is safe. */
    safe: boolean
    /** Severity of the most severe finding. */
    maxSeverity: "critical" | "high" | "medium" | "low" | "none"
    /** List of detected issues. */
    findings: OutputFinding[]
    /** Sanitized output (dangerous parts redacted). */
    sanitized: string
}

export interface OutputFinding {
    category: string
    description: string
    severity: "critical" | "high" | "medium" | "low"
    matchedPattern: string
    position: number
}

export interface OutputGuardConfig {
    /** Enable/disable output guard. */
    enabled: boolean
    /** Block output on critical findings. */
    blockOnCritical: boolean
    /** Redact dangerous parts instead of blocking. */
    redactMode: boolean
    /** Categories to check. */
    categories: string[]
}

// ── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: OutputGuardConfig = {
    enabled: true,
    blockOnCritical: false,
    redactMode: true,
    categories: [
        "reverse_shell", "credential_dump", "private_ip",
        "exfiltration", "priv_escalation", "malicious_payload",
    ],
}

// ── Pattern Definitions ────────────────────────────────────────────────────

interface OutputPattern {
    category: string
    severity: "critical" | "high" | "medium" | "low"
    pattern: RegExp
    description: string
}

const OUTPUT_PATTERNS: OutputPattern[] = [
    // ── Reverse Shell ──────────────────────────────────────────────
    {
        category: "reverse_shell",
        severity: "critical",
        pattern: /(?:bash\s+-i\s+>&|\/dev\/tcp\/|nc\s+-[el]|ncat\s+-[el]|socat\s+exec|python[23]?\s+-c\s+['"]import\s+(?:socket|os|subprocess))/gi,
        description: "Reverse shell or bind shell command detected",
    },
    {
        category: "reverse_shell",
        severity: "critical",
        pattern: /(?:msfvenom|meterpreter|payload.*(?:reverse|bind)_tcp)/gi,
        description: "Metasploit payload generation detected",
    },
    {
        category: "reverse_shell",
        severity: "high",
        pattern: /(?:mkfifo\s+\/tmp\/|exec\s+\d+<>\/dev\/tcp)/gi,
        description: "Named pipe reverse shell pattern",
    },

    // ── Credential Dump ────────────────────────────────────────────
    {
        category: "credential_dump",
        severity: "critical",
        pattern: /(?:\/etc\/shadow|\/etc\/passwd.*root|mimikatz|LaZagne|hashdump|sam\s+dump|secretsdump)/gi,
        description: "Credential harvesting/dumping command",
    },
    {
        category: "credential_dump",
        severity: "high",
        pattern: /(?:\$[1256]\$[a-zA-Z0-9./]{8,}\$|\$2[aby]\$\d+\$[a-zA-Z0-9./]+)/g,
        description: "Password hash format detected (MD5/SHA/bcrypt crypt)",
    },
    {
        category: "credential_dump",
        severity: "high",
        pattern: /(?:AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{32,}|ghp_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9-]{20})/g,
        description: "API key or access token detected in output",
    },

    // ── Private IP Leakage ─────────────────────────────────────────
    {
        category: "private_ip",
        severity: "medium",
        pattern: /(?:(?:^|\s|=|:\/\/)(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?:\s|:|\/|$))/gm,
        description: "Private/internal IP address in output",
    },

    // ── Exfiltration ───────────────────────────────────────────────
    {
        category: "exfiltration",
        severity: "high",
        pattern: /(?:curl\s+.*-(?:d|X\s*POST|F).*(?:ngrok|requestbin|webhook\.site|burpcollaborator)|wget\s+.*--post-(?:data|file))/gi,
        description: "Data exfiltration via HTTP POST to external service",
    },
    {
        category: "exfiltration",
        severity: "high",
        pattern: /(?:xxd|base64)\s+.*\|\s*(?:curl|wget|nc)/gi,
        description: "Encoded data piped to network tool",
    },
    {
        category: "exfiltration",
        severity: "medium",
        pattern: /(?:dns.*exfil|(?:nslookup|dig)\s+.*`.*`)/gi,
        description: "DNS-based exfiltration pattern",
    },

    // ── Privilege Escalation ───────────────────────────────────────
    {
        category: "priv_escalation",
        severity: "high",
        pattern: /(?:chmod\s+[47]?[47]\d\d|chmod\s+u\+s|chown\s+root|SUID|setuid|setgid)/gi,
        description: "SUID/permission escalation command",
    },
    {
        category: "priv_escalation",
        severity: "high",
        pattern: /(?:sudo\s+(?:ALL|NOPASSWD)|visudo|(?:echo|cat).*sudoers)/gi,
        description: "Sudoers modification attempt",
    },

    // ── Malicious Payload ──────────────────────────────────────────
    {
        category: "malicious_payload",
        severity: "high",
        pattern: /(?:eval\(atob\(|eval\(Buffer\.from\(|eval\(String\.fromCharCode\(|new\s+Function\s*\(\s*atob)/gi,
        description: "Encoded eval payload (obfuscated code execution)",
    },
    {
        category: "malicious_payload",
        severity: "medium",
        pattern: /(?:powershell\s+-(?:enc|e|EncodedCommand)\s+[A-Za-z0-9+/=]{20,})/gi,
        description: "Encoded PowerShell command",
    },
]

// ── Core Logic ─────────────────────────────────────────────────────────────

/**
 * Check model output for dangerous patterns.
 *
 * Pure function — no side effects.
 */
export function checkOutput(
    output: string,
    config?: Partial<OutputGuardConfig>,
): OutputGuardResult {
    const cfg = { ...DEFAULT_CONFIG, ...config }

    if (!cfg.enabled || !output || output.length === 0) {
        return { safe: true, maxSeverity: "none", findings: [], sanitized: output }
    }

    const findings: OutputFinding[] = []
    const enabledCategories = new Set(cfg.categories)

    for (const pat of OUTPUT_PATTERNS) {
        if (!enabledCategories.has(pat.category)) continue

        // Reset lastIndex for global regexes
        pat.pattern.lastIndex = 0
        let match: RegExpExecArray | null

        while ((match = pat.pattern.exec(output)) !== null) {
            findings.push({
                category: pat.category,
                description: pat.description,
                severity: pat.severity,
                matchedPattern: match[0].slice(0, 100), // Cap match length
                position: match.index,
            })
        }
    }

    // Determine severity
    const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
    const maxSeverity = findings.length === 0 ? "none" as const
        : findings.reduce((max, f) =>
            (severityOrder[f.severity] > severityOrder[max.severity]) ? f : max,
        ).severity

    // Sanitize if needed
    let sanitized = output
    if (cfg.redactMode && findings.length > 0) {
        sanitized = redactOutput(output, findings)
    }

    const safe = findings.length === 0

    if (!safe) {
        log("[output-guard] Findings detected", {
            total: findings.length,
            maxSeverity,
            categories: [...new Set(findings.map(f => f.category))],
        })
    }

    return { safe, maxSeverity, findings, sanitized }
}

/**
 * Redact dangerous parts from output, replacing with [REDACTED].
 */
function redactOutput(output: string, findings: OutputFinding[]): string {
    // Sort findings by position (descending) to replace from end to start
    const sorted = [...findings].sort((a, b) => b.position - a.position)

    let result = output
    for (const f of sorted) {
        const matchLen = f.matchedPattern.length
        const before = result.slice(0, f.position)
        const after = result.slice(f.position + matchLen)
        result = `${before}[REDACTED: ${f.category}]${after}`
    }

    return result
}

/**
 * Get total pattern count (for testing).
 */
export function getPatternCount(): number {
    return OUTPUT_PATTERNS.length
}

/**
 * Format output guard results for display.
 */
export function formatGuardResult(result: OutputGuardResult): string {
    if (result.safe) return "✅ Output Guard: SAFE"

    const lines = [
        `⚠️ Output Guard: ${result.findings.length} issue(s) found [${result.maxSeverity}]`,
    ]

    for (const f of result.findings) {
        const icon = f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : "🟡"
        lines.push(`  ${icon} [${f.severity}] ${f.description}`)
        lines.push(`    Match: "${f.matchedPattern.slice(0, 60)}"`)
    }

    return lines.join("\n")
}

// ── Hook Factory ─────────────────────────────────────────────────────────────

export function createOutputGuardHook(config?: Partial<OutputGuardConfig>): Record<string, Function> | null {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    if (!cfg.enabled) return null

    return {
        "tool.execute.after": async (ctx: Record<string, unknown>, output: any) => {
            // Check text parts in the output
            if (!output || !output.parts) return
            
            for (const part of output.parts) {
                if (part.type === "text" && typeof part.text === "string") {
                    const result = checkOutput(part.text, cfg)
                    if (!result.safe) {
                        // Redact or block based on config
                        if (cfg.blockOnCritical && result.maxSeverity === "critical") {
                            part.text = `[ERROR: Output blocked by Security Gate due to critical ${result.findings[0]?.category} finding]`
                        } else if (cfg.redactMode) {
                            part.text = result.sanitized
                        }
                    }
                }
            }
        },
    }
}
