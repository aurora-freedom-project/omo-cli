/**
 * Prompt injection detection patterns.
 *
 * Based on research from ruflo's AIDefence module (50+ patterns),
 * distilled to 17 high-precision patterns across 5 categories.
 *
 * Each pattern is anchored to avoid false positives in code contexts.
 */

export interface ThreatPattern {
    type: "instruction_override" | "jailbreak" | "role_switch" | "context_manipulation" | "pii_leak"
    severity: "critical" | "high" | "medium"
    pattern: RegExp
    description: string
}

export const THREAT_PATTERNS: ThreatPattern[] = [
    // ── Instruction Override (4 patterns) ──
    {
        type: "instruction_override",
        severity: "critical",
        pattern: /ignore\s+(all\s+)?previous\s+(instructions|rules|guidelines)/i,
        description: "Attempts to override prior instructions",
    },
    {
        type: "instruction_override",
        severity: "critical",
        pattern: /forget\s+(everything|all|your)\s+(?:\w+\s+){0,5}(rules|instructions|training)/i,
        description: "Attempts to clear instruction memory",
    },
    {
        type: "instruction_override",
        severity: "high",
        pattern: /disregard\s+(all|any|the)\s+(?:\w+\s+){0,5}(above|prior|previous)/i,
        description: "Attempts to dismiss prior context",
    },
    {
        type: "instruction_override",
        severity: "high",
        pattern: /new\s+instructions?\s*:/i,
        description: "Attempts to inject replacement instructions",
    },

    // ── Jailbreak (3 patterns) ──
    {
        type: "jailbreak",
        severity: "critical",
        pattern: /\b(DAN\s+mode|developer\s+mode|unrestricted\s+mode|god\s+mode)\b/i,
        description: "Known jailbreak mode activation",
    },
    {
        type: "jailbreak",
        severity: "critical",
        pattern: /bypass\s+(restrictions|safety|filters|guardrails)/i,
        description: "Attempts to bypass safety measures",
    },
    {
        type: "jailbreak",
        severity: "high",
        pattern: /enable\s+(jailbreak|unrestricted|unfiltered)\b/i,
        description: "Explicit jailbreak request",
    },

    // ── Role Switching (3 patterns) ──
    {
        type: "role_switch",
        severity: "high",
        pattern: /(?:^|\n)\s*you\s+are\s+now\s+(?:a|an|the)\s+/i,
        description: "Attempts to redefine agent identity",
    },
    {
        type: "role_switch",
        severity: "high",
        pattern: /(?:^|\n)\s*pretend\s+(?:to\s+be|you'?re|that\s+you)/i,
        description: "Attempts to override agent role via pretending",
    },
    {
        type: "role_switch",
        severity: "medium",
        pattern: /(?:^|\n)\s*from\s+now\s+on,?\s+(?:you|act|behave)/i,
        description: "Attempts to permanently change agent behavior",
    },

    // ── Context Manipulation (3 patterns) ──
    {
        type: "context_manipulation",
        severity: "critical",
        pattern: /\[(?:system|admin|root)\]\s*:/i,
        description: "Fake system/admin message injection",
    },
    {
        type: "context_manipulation",
        severity: "high",
        pattern: /<\|(?:im_start|system|endoftext)\|>/i,
        description: "Chat template token injection (ChatML/Llama format)",
    },
    {
        type: "context_manipulation",
        severity: "high",
        pattern: /<<SYS>>|<\|system\|>/i,
        description: "Llama/Mistral system prompt injection",
    },

    // ── PII Detection (4 patterns) ──
    {
        type: "pii_leak",
        severity: "high",
        pattern: /\b\d{3}-\d{2}-\d{4}\b/,
        description: "Social Security Number pattern",
    },
    {
        type: "pii_leak",
        severity: "high",
        pattern: /(?:sk-|api[_-]?key|secret[_-]?key|access[_-]?token)\s*[=:]\s*['"]?\S{8,}/i,
        description: "API key or secret token exposure",
    },
    {
        type: "pii_leak",
        severity: "high",
        pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"]?\S+/i,
        description: "Password exposure in plaintext",
    },
    {
        type: "pii_leak",
        severity: "medium",
        pattern: /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/,
        description: "AWS access key ID pattern",
    },
]

export interface DetectedThreat {
    type: ThreatPattern["type"]
    severity: ThreatPattern["severity"]
    description: string
    match: string
}

/**
 * Scan text for prompt injection threats.
 * @param text - Text to scan
 * @param options.pii - Whether to include PII detection (default: true)
 * @returns Array of detected threats
 */
export function detectThreats(
    text: string,
    options: { pii?: boolean } = {}
): DetectedThreat[] {
    const { pii = true } = options
    const threats: DetectedThreat[] = []

    for (const pattern of THREAT_PATTERNS) {
        // Skip PII patterns if disabled
        if (pattern.type === "pii_leak" && !pii) continue

        const match = text.match(pattern.pattern)
        if (match) {
            threats.push({
                type: pattern.type,
                severity: pattern.severity,
                description: pattern.description,
                match: match[0],
            })
        }
    }

    return threats
}
