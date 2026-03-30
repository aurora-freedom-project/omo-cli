/**
 * CVSS Auto-Scoring Engine — Quantitative security posture.
 *
 * Attaches CVSS scores to security findings using Rogue's formula:
 *   CVSS = (Impact × 0.4) + (Exploitability × 0.3) + ((10 - Complexity) × 0.2) + (HumanFactor × 0.1)
 *
 * Also provides OWASP LLM Top 10, MITRE ATLAS, and NIST AI RMF mapping.
 *
 * Sources: Rogue (qualifire-dev), AI-Infra-Guard (Tencent)
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface CvssScore {
    /** Overall CVSS score (0-10). */
    score: number
    /** Severity label. */
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE"
    /** Component scores. */
    components: {
        impact: number      // 0-10: How bad is the impact?
        exploitability: number // 0-10: How easy to exploit?
        complexity: number    // 0-10: How complex? (lower = easier = higher score)
        humanFactor: number   // 0-10: Does it require human interaction?
    }
    /** Compliance framework mappings. */
    frameworks: FrameworkMapping[]
}

export interface FrameworkMapping {
    framework: "OWASP_LLM" | "MITRE_ATLAS" | "NIST_AI_RMF" | "EU_AI_ACT"
    id: string
    name: string
}

export interface ScoredFinding {
    /** Original finding description. */
    finding: string
    /** Security category. */
    category: string
    /** Calculated CVSS score. */
    cvss: CvssScore
}

// ── CVSS Calculation ───────────────────────────────────────────────────────

/**
 * Calculate CVSS score using Rogue's formula.
 *
 * CVSS = (Impact × 0.4) + (Exploitability × 0.3) + ((10 - Complexity) × 0.2) + (HumanFactor × 0.1)
 */
export function calculateCvss(
    impact: number,
    exploitability: number,
    complexity: number,
    humanFactor: number,
): CvssScore {
    // Clamp all inputs to [0, 10]
    const i = Math.max(0, Math.min(10, impact))
    const e = Math.max(0, Math.min(10, exploitability))
    const c = Math.max(0, Math.min(10, complexity))
    const h = Math.max(0, Math.min(10, humanFactor))

    const score = (i * 0.4) + (e * 0.3) + ((10 - c) * 0.2) + (h * 0.1)
    const rounded = Math.round(score * 10) / 10

    return {
        score: rounded,
        severity: scoreSeverity(rounded),
        components: { impact: i, exploitability: e, complexity: c, humanFactor: h },
        frameworks: [],
    }
}

/**
 * Map a numeric score to a severity label.
 */
export function scoreSeverity(score: number): CvssScore["severity"] {
    if (score >= 9.0) return "CRITICAL"
    if (score >= 7.0) return "HIGH"
    if (score >= 4.0) return "MEDIUM"
    if (score >= 0.1) return "LOW"
    return "NONE"
}

// ── Category Scoring Profiles ──────────────────────────────────────────────

/** Pre-defined scoring profiles for our security pattern categories. */
const CATEGORY_PROFILES: Record<string, { impact: number; exploitability: number; complexity: number; humanFactor: number }> = {
    // From pattern_scan categories
    secrets:            { impact: 9, exploitability: 9, complexity: 1, humanFactor: 1 },
    command_injection:  { impact: 9, exploitability: 7, complexity: 3, humanFactor: 2 },
    file_ops:           { impact: 7, exploitability: 5, complexity: 4, humanFactor: 3 },
    network_exfil:      { impact: 8, exploitability: 6, complexity: 4, humanFactor: 2 },
    priv_escalation:    { impact: 9, exploitability: 6, complexity: 5, humanFactor: 3 },

    // From input_guard categories
    instruction_override: { impact: 8, exploitability: 8, complexity: 2, humanFactor: 1 },
    jailbreak:            { impact: 8, exploitability: 7, complexity: 3, humanFactor: 1 },
    role_switching:       { impact: 7, exploitability: 6, complexity: 3, humanFactor: 2 },
    context_manipulation: { impact: 7, exploitability: 7, complexity: 2, humanFactor: 1 },
    encoding_bypass:      { impact: 6, exploitability: 5, complexity: 5, humanFactor: 2 },
    pii:                  { impact: 7, exploitability: 3, complexity: 2, humanFactor: 5 },
}

/**
 * Score a finding by category using pre-defined profiles.
 */
export function scoreFinding(finding: string, category: string): ScoredFinding {
    const profile = CATEGORY_PROFILES[category] ?? {
        impact: 5, exploitability: 5, complexity: 5, humanFactor: 5,
    }

    const cvss = calculateCvss(
        profile.impact,
        profile.exploitability,
        profile.complexity,
        profile.humanFactor,
    )

    // Add framework mappings based on category
    cvss.frameworks = mapToFrameworks(category)

    return { finding, category, cvss }
}

// ── Framework Mapping ──────────────────────────────────────────────────────

/** Map security category to compliance frameworks. */
export function mapToFrameworks(category: string): FrameworkMapping[] {
    const mappings: FrameworkMapping[] = []

    const OWASP_MAP: Record<string, { id: string; name: string }> = {
        instruction_override: { id: "LLM01", name: "Prompt Injection" },
        jailbreak:            { id: "LLM01", name: "Prompt Injection" },
        role_switching:       { id: "LLM01", name: "Prompt Injection" },
        context_manipulation: { id: "LLM01", name: "Prompt Injection" },
        encoding_bypass:      { id: "LLM01", name: "Prompt Injection" },
        secrets:              { id: "LLM06", name: "Sensitive Information Disclosure" },
        pii:                  { id: "LLM06", name: "Sensitive Information Disclosure" },
        command_injection:    { id: "LLM03", name: "Training Data Poisoning" },
        network_exfil:        { id: "LLM02", name: "Insecure Output Handling" },
        priv_escalation:      { id: "LLM08", name: "Excessive Agency" },
        file_ops:             { id: "LLM08", name: "Excessive Agency" },
    }

    const MITRE_MAP: Record<string, { id: string; name: string }> = {
        instruction_override: { id: "AML.T0051", name: "LLM Prompt Injection" },
        jailbreak:            { id: "AML.T0054", name: "LLM Jailbreak" },
        secrets:              { id: "AML.T0024", name: "Exfiltration via ML Inference API" },
        command_injection:    { id: "AML.T0043", name: "Adversarial ML Attack" },
        network_exfil:        { id: "AML.T0024", name: "Exfiltration via ML Inference API" },
    }

    if (OWASP_MAP[category]) {
        mappings.push({ framework: "OWASP_LLM", ...OWASP_MAP[category] })
    }
    if (MITRE_MAP[category]) {
        mappings.push({ framework: "MITRE_ATLAS", ...MITRE_MAP[category] })
    }

    // NIST AI RMF mapping (broader)
    const nistCategory = ["secrets", "pii", "network_exfil"].includes(category)
        ? { id: "MAP 3.5", name: "Privacy Risk" }
        : ["command_injection", "priv_escalation", "file_ops"].includes(category)
        ? { id: "GOVERN 1.5", name: "Safety Risk" }
        : { id: "MANAGE 2.2", name: "Security Risk" }
    mappings.push({ framework: "NIST_AI_RMF", ...nistCategory })

    return mappings
}

// ── Formatting ─────────────────────────────────────────────────────────────

/**
 * Format a scored finding for display.
 */
export function formatScoredFinding(sf: ScoredFinding): string {
    const { cvss } = sf
    const frameworkStr = cvss.frameworks.map(f => `${f.framework}:${f.id}`).join(", ")

    return [
        `[CVSS ${cvss.score} ${cvss.severity}] ${sf.category}`,
        `  Finding: ${sf.finding}`,
        `  Components: Impact=${cvss.components.impact} Exploitability=${cvss.components.exploitability} Complexity=${cvss.components.complexity} HumanFactor=${cvss.components.humanFactor}`,
        `  Frameworks: ${frameworkStr || "none"}`,
    ].join("\n")
}

/**
 * Format a summary of multiple scored findings.
 */
export function formatScoreSummary(findings: ScoredFinding[]): string {
    if (findings.length === 0) return "No findings to score."

    const byLevel = {
        CRITICAL: findings.filter(f => f.cvss.severity === "CRITICAL").length,
        HIGH: findings.filter(f => f.cvss.severity === "HIGH").length,
        MEDIUM: findings.filter(f => f.cvss.severity === "MEDIUM").length,
        LOW: findings.filter(f => f.cvss.severity === "LOW").length,
    }

    const avgScore = Math.round(
        (findings.reduce((sum, f) => sum + f.cvss.score, 0) / findings.length) * 10,
    ) / 10

    const posture = avgScore >= 7 ? "🔴 CRITICAL" : avgScore >= 4 ? "🟡 ELEVATED" : "🟢 LOW"

    return [
        `Security Posture: ${posture} (avg CVSS: ${avgScore})`,
        `  Findings: ${findings.length} total`,
        `  🔴 Critical: ${byLevel.CRITICAL}  |  🟠 High: ${byLevel.HIGH}  |  🟡 Medium: ${byLevel.MEDIUM}  |  🟢 Low: ${byLevel.LOW}`,
    ].join("\n")
}
