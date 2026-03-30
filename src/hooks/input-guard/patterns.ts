/**
 * Prompt injection detection patterns.
 *
 * Merged from:
 * - ruflo's AIDefence module (50+ patterns, distilled)
 * - Omni's InputGuard (20 multi-word patterns)
 * - Blue Team adversarial simulation findings
 *
 * 28 high-precision patterns across 6 categories.
 * Each pattern uses multi-word anchoring to minimize false positives in code contexts.
 *
 * @see OmniUltraAgent_Kit/src/core/input_guard.rs — Rust reference implementation
 */

export interface ThreatPattern {
    type: "instruction_override" | "jailbreak" | "role_switch" | "context_manipulation" | "encoding_bypass" | "pii_leak"
    severity: "critical" | "high" | "medium"
    pattern: RegExp
    description: string
}

export const THREAT_PATTERNS: ThreatPattern[] = [
    // ── Instruction Override (6 patterns) ── [+2 from Omni]
    {
        type: "instruction_override",
        severity: "critical",
        pattern: /ignore\s+(all\s+)?previous\s+(instructions|rules|guidelines)/i,
        description: "Attempts to override prior instructions",
    },
    {
        type: "instruction_override",
        severity: "critical",
        pattern: /ignore\s+all\s+prior\s+instructions/i,
        description: "Variant: ignore all prior instructions",
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
        pattern: /disregard\s+(all|any|the|your|previous)\s+(?:\w+\s+){0,5}(above|prior|previous|prompts|instructions)/i,
        description: "Attempts to dismiss prior context",
    },
    {
        type: "instruction_override",
        severity: "high",
        pattern: /new\s+instructions?\s*:/i,
        description: "Attempts to inject replacement instructions",
    },
    {
        type: "instruction_override",
        severity: "high",
        pattern: /override\s+your\s+programming/i,
        description: "Attempts to override agent programming (from Omni)",
    },

    // ── Jailbreak (5 patterns) ── [+2 from Omni]
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
    {
        type: "jailbreak",
        severity: "high",
        pattern: /simulate\s+developer\s+mode/i,
        description: "Simulated developer mode jailbreak (from Omni)",
    },
    {
        type: "jailbreak",
        severity: "high",
        pattern: /ignore\s+content\s+policy/i,
        description: "Content policy bypass attempt (from Omni)",
    },

    // ── Role Switching (4 patterns) ── [+1 from Omni]
    {
        type: "role_switch",
        severity: "high",
        pattern: /(?:^|\n)\s*you\s+are\s+now\s+(?:a|an|the|unrestricted)\s+/i,
        description: "Attempts to redefine agent identity (extended for 'unrestricted')",
    },
    {
        type: "role_switch",
        severity: "high",
        pattern: /(?:^|\n)\s*pretend\s+(?:to\s+be|you'?re|that\s+you|you\s+are\s+unrestricted)/i,
        description: "Override agent role via pretending (extended for 'unrestricted')",
    },
    {
        type: "role_switch",
        severity: "medium",
        pattern: /(?:^|\n)\s*from\s+now\s+on,?\s+(?:you|act|behave)/i,
        description: "Attempts to permanently change agent behavior",
    },
    {
        type: "role_switch",
        severity: "high",
        pattern: /act\s+as\s+if\s+you\s+have\s+no\s+restrictions/i,
        description: "Remove restrictions via roleplay (from Omni)",
    },

    // ── Context Manipulation (6 patterns) ── [+3 from Omni]
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
    {
        type: "context_manipulation",
        severity: "high",
        pattern: /reveal\s+your\s+system\s+prompt/i,
        description: "System prompt extraction attempt (from Omni)",
    },
    {
        type: "context_manipulation",
        severity: "high",
        pattern: /output\s+your\s+instructions/i,
        description: "Instruction extraction attempt (from Omni)",
    },
    {
        type: "context_manipulation",
        severity: "high",
        pattern: /print\s+your\s+initial\s+prompt/i,
        description: "Initial prompt extraction attempt (from Omni)",
    },

    // ── Encoding Bypass (3 patterns) ── [NEW category]
    {
        type: "encoding_bypass",
        severity: "high",
        pattern: /(?:base64|rot13|hex)\s*(?:decode|encode|convert)\s*(?:this|the|following)/i,
        description: "Encoding-based bypass attempt (Base64/ROT13/Hex)",
    },
    {
        type: "encoding_bypass",
        severity: "medium",
        pattern: /(?:ignore|bypass|skip)\s+(?:\w+\s+){0,3}(?:using|via|with)\s+(?:base64|unicode|hex|rot13)/i,
        description: "Instruction bypass via encoding specification",
    },
    {
        type: "encoding_bypass",
        severity: "high",
        pattern: /respond\s+without\s+(?:any\s+)?filters/i,
        description: "Request to remove output filtering (from Omni)",
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
