/**
 * Vulnerability Fingerprint Database — Agent-Specific Security Patterns
 *
 * Curated from:
 * - AI-Infra-Guard (Tencent) — Agent vulnerability fingerprints, jailbreak evaluation
 * - HexStrike AI — MCP-native security tool patterns, attack chain discovery
 * - OpenFang — 16-layer security model, SSRF protection, taint tracking
 * - OWASP Top 10 for LLM Applications
 *
 * Structure:
 *   agent-patterns  — Prompt injection, jailbreak, data exfil, tool abuse
 *   code-patterns   — Injection, auth bypass, crypto misuse, deserialization
 *   infra-patterns  — SSRF, path traversal, secrets exposure, container escape
 *
 * Each pattern includes:
 *   - Unique ID with category prefix
 *   - ReDoS-safe regex pattern
 *   - CWE reference
 *   - Severity classification
 *   - Remediation guidance
 *
 * @see OmniUltraAgent_Kit/clone/AI-Infra-Guard — Red teaming platform
 * @see OmniUltraAgent_Kit/clone/hexstrike-ai — MCP security tools
 * @see OmniUltraAgent_Kit/clone/openfang — Agent OS security layers
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface VulnFingerprint {
    /** Unique ID (e.g., "AGENT-PI-001", "CODE-SQLI-001") */
    id: string
    /** Human-readable name */
    name: string
    /** Category for filtering */
    category: VulnCategory
    /** Sub-category for finer filtering */
    subcategory: string
    /** ReDoS-safe detection regex */
    pattern: RegExp
    /** Severity classification */
    severity: "critical" | "high" | "medium" | "low"
    /** CWE reference (e.g., "CWE-77") */
    cwe?: string
    /** Description of the vulnerability */
    description: string
    /** Remediation guidance */
    remediation: string
    /** OWASP/MITRE references */
    references?: string[]
    /** File types this pattern applies to (empty = all) */
    fileTypes?: string[]
}

export type VulnCategory =
    | "agent_security"
    | "code_injection"
    | "auth_bypass"
    | "crypto_misuse"
    | "deserialization"
    | "ssrf"
    | "path_traversal"
    | "secrets_exposure"
    | "container_security"
    | "data_exfiltration"

// ── Agent Security Patterns ────────────────────────────────────────────────
// Source: AI-Infra-Guard, OpenFang prompt injection scanner, OWASP LLM Top 10

export const AGENT_PATTERNS: VulnFingerprint[] = [
    // Prompt Injection (LLM01)
    {
        id: "AGENT-PI-001",
        name: "System prompt override attempt",
        category: "agent_security",
        subcategory: "prompt_injection",
        pattern: /ignore\s+(all\s+)?(?:previous|prior|above)\s+(?:instructions|rules|guidelines|directives)/i,
        severity: "critical",
        cwe: "CWE-77",
        description: "Attempts to override system-level instructions via direct instruction injection",
        remediation: "Add multi-layer input sanitization. Use Input Guard with configurable pattern matching.",
        references: ["https://owasp.org/www-project-top-10-for-llm-applications/"],
    },
    {
        id: "AGENT-PI-002",
        name: "New instruction injection",
        category: "agent_security",
        subcategory: "prompt_injection",
        pattern: /(?:new|updated|corrected)\s+instructions?\s*:/i,
        severity: "high",
        cwe: "CWE-77",
        description: "Attempts to inject replacement instructions via 'new instructions:' prefix",
        remediation: "Strip instruction-like prefixes from user input before processing.",
    },
    {
        id: "AGENT-PI-003",
        name: "System message impersonation",
        category: "agent_security",
        subcategory: "prompt_injection",
        pattern: /\[(?:system|admin|root|supervisor)\]\s*:/i,
        severity: "critical",
        cwe: "CWE-290",
        description: "Impersonates system-level messages using bracket notation",
        remediation: "Validate message source. Never trust user-supplied role markers.",
    },
    {
        id: "AGENT-PI-004",
        name: "ChatML/Special token injection",
        category: "agent_security",
        subcategory: "prompt_injection",
        pattern: /<\|(?:im_start|im_end|endoftext|system|user|assistant)\|>/i,
        severity: "critical",
        cwe: "CWE-74",
        description: "Injects chat template special tokens (ChatML, Llama format) to manipulate context",
        remediation: "Strip or escape special tokens from user input. Use token-safe input processing.",
    },

    // Jailbreak (LLM01 variant)
    {
        id: "AGENT-JB-001",
        name: "DAN/God mode activation",
        category: "agent_security",
        subcategory: "jailbreak",
        pattern: /\b(?:DAN\s+mode|god\s+mode|developer\s+mode|unrestricted\s+mode)\b/i,
        severity: "critical",
        cwe: "CWE-284",
        description: "Activates known jailbreak modes that bypass safety measures",
        remediation: "Block known jailbreak keywords. Use jailbreak-eval suite for continuous testing.",
    },
    {
        id: "AGENT-JB-002",
        name: "Safety filter bypass request",
        category: "agent_security",
        subcategory: "jailbreak",
        pattern: /bypass\s+(?:safety|security|content|ethical)\s+(?:filters|rules|guidelines|restrictions)/i,
        severity: "critical",
        cwe: "CWE-284",
        description: "Explicit request to bypass safety filtering mechanisms",
        remediation: "Maintain immutable safety layer that cannot be overridden by user input.",
    },
    {
        id: "AGENT-JB-003",
        name: "Role-play restriction removal",
        category: "agent_security",
        subcategory: "jailbreak",
        pattern: /(?:pretend|act|simulate|imagine)\s+(?:you\s+)?(?:are|have|were)\s+(?:an?\s+)?(?:unrestricted|uncensored|freed|unfiltered)/i,
        severity: "high",
        cwe: "CWE-284",
        description: "Uses role-play framing to remove content restrictions",
        remediation: "Maintain safety invariants regardless of role-play context.",
    },

    // Data Exfiltration (LLM06)
    {
        id: "AGENT-DE-001",
        name: "System prompt extraction",
        category: "agent_security",
        subcategory: "data_exfil",
        pattern: /(?:reveal|show|print|output|display|repeat)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions|configuration|rules)/i,
        severity: "high",
        cwe: "CWE-200",
        description: "Attempts to extract the system prompt or internal configuration",
        remediation: "Never include system prompts in output. Use output-guard hook to filter.",
    },
    {
        id: "AGENT-DE-002",
        name: "Training data probing",
        category: "agent_security",
        subcategory: "data_exfil",
        pattern: /(?:what|show)\s+(?:is|are|was|were)\s+(?:your|the)\s+(?:training|fine-tuning)\s+(?:data|dataset|examples)/i,
        severity: "medium",
        cwe: "CWE-200",
        description: "Probes for training data or fine-tuning examples",
        remediation: "Do not disclose training data details. Respond with general capability descriptions.",
    },

    // Tool Abuse (LLM07)
    {
        id: "AGENT-TA-001",
        name: "Recursive tool call injection",
        category: "agent_security",
        subcategory: "tool_abuse",
        pattern: /(?:call|invoke|execute|run)\s+(?:this\s+)?tool\s+(?:recursively|infinitely|in\s+a\s+loop)/i,
        severity: "high",
        cwe: "CWE-674",
        description: "Attempts to create infinite tool call loops for resource exhaustion",
        remediation: "Implement max recursion depth and circuit breaker for tool calls.",
    },
    {
        id: "AGENT-TA-002",
        name: "File deletion via tool",
        category: "agent_security",
        subcategory: "tool_abuse",
        pattern: /(?:delete|remove|wipe|destroy)\s+(?:all\s+)?(?:files|directories|data|database)/i,
        severity: "critical",
        cwe: "CWE-732",
        description: "Attempts to use tools for destructive file operations",
        remediation: "Implement write-protection and confirmation gates for destructive operations.",
    },
]

// ── Code-Level Patterns ────────────────────────────────────────────────────
// Source: OWASP, CWE, enhanced from existing pattern_scan

export const CODE_PATTERNS: VulnFingerprint[] = [
    // SQL Injection
    {
        id: "CODE-SQLI-001",
        name: "String-concatenated SQL query",
        category: "code_injection",
        subcategory: "sql_injection",
        pattern: /(?:query|sql|statement)\s*[=+]\s*[`'"]\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b[^;]*\$\{/i,
        severity: "critical",
        cwe: "CWE-89",
        description: "SQL query built via string interpolation with user input",
        remediation: "Use parameterized queries or an ORM. Never concatenate user input into SQL.",
        fileTypes: [".ts", ".js", ".py", ".rb", ".java", ".go"],
    },
    {
        id: "CODE-SQLI-002",
        name: "Raw SQL with concatenation",
        category: "code_injection",
        subcategory: "sql_injection",
        pattern: /\.(?:raw|execute|query)\s*\(\s*['"`].*\+\s*(?:req|request|params|input|user|body)/i,
        severity: "critical",
        cwe: "CWE-89",
        description: "Raw SQL method with string concatenation from request parameters",
        remediation: "Replace concatenation with parameterized query bindings.",
        fileTypes: [".ts", ".js", ".py", ".rb"],
    },

    // XSS
    {
        id: "CODE-XSS-001",
        name: "innerHTML with user input",
        category: "code_injection",
        subcategory: "xss",
        pattern: /\.innerHTML\s*=\s*(?:req|request|params|input|user|data|body|query)/i,
        severity: "high",
        cwe: "CWE-79",
        description: "Setting innerHTML directly from user-controlled data",
        remediation: "Use textContent or a sanitization library (DOMPurify). Add CSP headers.",
        fileTypes: [".ts", ".tsx", ".js", ".jsx"],
    },
    {
        id: "CODE-XSS-002",
        name: "Dangerous React dangerouslySetInnerHTML",
        category: "code_injection",
        subcategory: "xss",
        pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:\s*(?:props|state|data|input|user|params)/i,
        severity: "high",
        cwe: "CWE-79",
        description: "Using dangerouslySetInnerHTML with unsanitized user data in React",
        remediation: "Sanitize HTML content with DOMPurify before rendering. Prefer textContent.",
        fileTypes: [".tsx", ".jsx"],
    },

    // Command Injection
    {
        id: "CODE-CMD-001",
        name: "Shell exec with user input",
        category: "code_injection",
        subcategory: "command_injection",
        pattern: /(?:exec|execSync|spawn|system|popen)\s*\(\s*[`'"]\s*(?:.*\$\{|.*\+\s*(?:req|input|user|params))/i,
        severity: "critical",
        cwe: "CWE-78",
        description: "Shell command execution with user-controlled input",
        remediation: "Use array-based subprocess calls (spawn with args array). Validate and sanitize inputs.",
        fileTypes: [".ts", ".js", ".py", ".rb"],
    },

    // Auth Bypass
    {
        id: "CODE-AUTH-001",
        name: "Hardcoded admin bypass",
        category: "auth_bypass",
        subcategory: "hardcoded_bypass",
        pattern: /(?:isAdmin|is_admin|isAuthenticated|is_authenticated)\s*=\s*true/i,
        severity: "high",
        cwe: "CWE-798",
        description: "Hardcoded authentication/authorization bypass",
        remediation: "Remove hardcoded auth flags. Implement proper authentication checks.",
        fileTypes: [".ts", ".js", ".py", ".rb", ".java", ".go"],
    },
    {
        id: "CODE-AUTH-002",
        name: "JWT verification skipped",
        category: "auth_bypass",
        subcategory: "jwt_bypass",
        pattern: /(?:verify|validate)(?:Token|JWT|Auth)\s*=\s*false|algorithms\s*:\s*\[\s*['"]none['"]\s*\]/i,
        severity: "critical",
        cwe: "CWE-345",
        description: "JWT verification disabled or 'none' algorithm accepted",
        remediation: "Always verify JWT signatures. Never accept 'none' algorithm.",
        fileTypes: [".ts", ".js", ".py"],
    },

    // Crypto Misuse
    {
        id: "CODE-CRYPTO-001",
        name: "Weak hash algorithm",
        category: "crypto_misuse",
        subcategory: "weak_hash",
        pattern: /(?:createHash|hashlib|Digest)\s*\(\s*['"](?:md5|sha1|md4)['"]\s*\)/i,
        severity: "medium",
        cwe: "CWE-328",
        description: "Using weak hash algorithm (MD5, SHA1) for security-sensitive operations",
        remediation: "Upgrade to SHA-256 or SHA-3. Use bcrypt/argon2 for passwords.",
        fileTypes: [".ts", ".js", ".py", ".rb", ".java", ".go"],
    },
    {
        id: "CODE-CRYPTO-002",
        name: "ECB mode encryption",
        category: "crypto_misuse",
        subcategory: "weak_cipher",
        pattern: /(?:AES|DES|Blowfish)[._-]?ECB|mode\s*[=:]\s*['"]?ECB/i,
        severity: "high",
        cwe: "CWE-327",
        description: "Using ECB mode which leaks patterns in ciphertext",
        remediation: "Use GCM or CBC mode with HMAC. Prefer AES-256-GCM for authenticated encryption.",
    },

    // Deserialization
    {
        id: "CODE-DESER-001",
        name: "Unsafe deserialization",
        category: "deserialization",
        subcategory: "unsafe_deser",
        pattern: /(?:pickle\.loads?|yaml\.unsafe_load|Marshal\.load|ObjectInputStream)\s*\(/i,
        severity: "critical",
        cwe: "CWE-502",
        description: "Unsafe deserialization that can lead to RCE",
        remediation: "Use safe alternatives (yaml.safe_load, JSON). Validate types after deserialization.",
        fileTypes: [".py", ".rb", ".java"],
    },
]

// ── Infrastructure Patterns ────────────────────────────────────────────────
// Source: OpenFang SSRF protection, container security best practices

export const INFRA_PATTERNS: VulnFingerprint[] = [
    // SSRF
    {
        id: "INFRA-SSRF-001",
        name: "Unvalidated URL fetch",
        category: "ssrf",
        subcategory: "url_fetch",
        pattern: /(?:fetch|axios|request|http\.get|urllib)\s*\(\s*(?:req|request|params|input|user|body)\./i,
        severity: "high",
        cwe: "CWE-918",
        description: "HTTP request with user-controlled URL without validation",
        remediation: "Validate URLs against allowlist. Block private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x).",
        fileTypes: [".ts", ".js", ".py", ".rb", ".go"],
    },
    {
        id: "INFRA-SSRF-002",
        name: "Cloud metadata endpoint access",
        category: "ssrf",
        subcategory: "metadata",
        pattern: /169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200/,
        severity: "critical",
        cwe: "CWE-918",
        description: "Access to cloud provider metadata endpoints (AWS, GCP, Azure)",
        remediation: "Block metadata endpoint IPs in SSRF protection layer. Use IMDSv2 on AWS.",
    },

    // Path Traversal
    {
        id: "INFRA-PT-001",
        name: "Path traversal in file operations",
        category: "path_traversal",
        subcategory: "file_access",
        pattern: /(?:readFile|readFileSync|open|fopen)\s*\(\s*(?:req|request|params|input|user|body)\./i,
        severity: "high",
        cwe: "CWE-22",
        description: "File operation with user-controlled path without canonicalization",
        remediation: "Canonicalize paths with path.resolve(). Validate against base directory. Reject '..' segments.",
        fileTypes: [".ts", ".js", ".py", ".rb", ".go"],
    },
    {
        id: "INFRA-PT-002",
        name: "Deep path traversal sequence",
        category: "path_traversal",
        subcategory: "traversal_sequence",
        pattern: /(?:\.\.\/){3,}|(?:\.\.\\){3,}/,
        severity: "high",
        cwe: "CWE-22",
        description: "Deep path traversal sequence (3+ levels of '../')",
        remediation: "Reject any path containing '..' sequences. Use path canonicalization.",
    },

    // Secrets Exposure
    {
        id: "INFRA-SEC-001",
        name: "AWS access key in source",
        category: "secrets_exposure",
        subcategory: "aws_key",
        pattern: /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/,
        severity: "critical",
        cwe: "CWE-798",
        description: "AWS access key ID found in source code",
        remediation: "Remove key immediately. Rotate credentials. Use IAM roles or environment variables.",
    },
    {
        id: "INFRA-SEC-002",
        name: "Private key in source",
        category: "secrets_exposure",
        subcategory: "private_key",
        pattern: /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH)?\s*PRIVATE\s+KEY-----/,
        severity: "critical",
        cwe: "CWE-321",
        description: "Private key material found in source code",
        remediation: "Remove key from source. Store in secure key management system. Rotate immediately.",
    },
    {
        id: "INFRA-SEC-003",
        name: "Generic API key pattern",
        category: "secrets_exposure",
        subcategory: "api_key",
        pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{20,}/i,
        severity: "critical",
        cwe: "CWE-798",
        description: "Hardcoded API key or secret found in source",
        remediation: "Move to environment variable or secrets manager. Add to .gitignore.",
    },
    {
        id: "INFRA-SEC-004",
        name: "JWT token in source",
        category: "secrets_exposure",
        subcategory: "jwt_token",
        pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
        severity: "high",
        cwe: "CWE-798",
        description: "JWT token found hardcoded in source code",
        remediation: "Remove token from source. Generate tokens dynamically at runtime.",
    },

    // Container Security
    {
        id: "INFRA-CONT-001",
        name: "Privileged container",
        category: "container_security",
        subcategory: "privileged",
        pattern: /privileged\s*:\s*true|--privileged/i,
        severity: "critical",
        cwe: "CWE-250",
        description: "Container running in privileged mode with full host access",
        remediation: "Remove privileged flag. Use specific capabilities instead. Apply seccomp profiles.",
        fileTypes: [".yaml", ".yml", ".dockerfile", ".json"],
    },
    {
        id: "INFRA-CONT-002",
        name: "Latest tag in container image",
        category: "container_security",
        subcategory: "image_tag",
        pattern: /(?:image|FROM)\s*:\s*\S+:latest\b/i,
        severity: "medium",
        cwe: "CWE-1104",
        description: "Using 'latest' tag which is mutable and unpredictable",
        remediation: "Pin to specific image digest or version tag for reproducibility.",
        fileTypes: [".yaml", ".yml", ".dockerfile"],
    },
]

// ── Aggregate Database ──────────────────────────────────────────────────────

/** All vulnerability fingerprints from all categories. */
export const ALL_FINGERPRINTS: VulnFingerprint[] = [
    ...AGENT_PATTERNS,
    ...CODE_PATTERNS,
    ...INFRA_PATTERNS,
]

/** Get fingerprints by category. */
export function getByCategory(category: VulnCategory): VulnFingerprint[] {
    return ALL_FINGERPRINTS.filter(f => f.category === category)
}

/** Get fingerprints by subcategory. */
export function getBySubcategory(subcategory: string): VulnFingerprint[] {
    return ALL_FINGERPRINTS.filter(f => f.subcategory === subcategory)
}

/** Get fingerprints by severity. */
export function getBySeverity(severity: VulnFingerprint["severity"]): VulnFingerprint[] {
    return ALL_FINGERPRINTS.filter(f => f.severity === severity)
}

/** Get fingerprints applicable to a specific file type. */
export function getByFileType(ext: string): VulnFingerprint[] {
    return ALL_FINGERPRINTS.filter(f => !f.fileTypes || f.fileTypes.includes(ext))
}

/** Get all unique categories in the database. */
export function listVulnCategories(): VulnCategory[] {
    return [...new Set(ALL_FINGERPRINTS.map(f => f.category))]
}

/** Get all unique subcategories. */
export function listSubcategories(): string[] {
    return [...new Set(ALL_FINGERPRINTS.map(f => f.subcategory))]
}

/** Database statistics. */
export function getDBStats(): {
    totalFingerprints: number
    byCategory: Record<string, number>
    bySeverity: Record<string, number>
    criticalCount: number
} {
    const byCategory: Record<string, number> = {}
    const bySeverity: Record<string, number> = {}

    for (const f of ALL_FINGERPRINTS) {
        byCategory[f.category] = (byCategory[f.category] ?? 0) + 1
        bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
    }

    return {
        totalFingerprints: ALL_FINGERPRINTS.length,
        byCategory,
        bySeverity,
        criticalCount: bySeverity["critical"] ?? 0,
    }
}
