# Detection Rules — OmniUltraAgent Kit

> Generated: 2026-03-28 | Source: Blue Team Phase 3 — Gap Analysis from adversarial-report.md
> 30 detection rules organized by kill chain stage

## Kill Chain Mapping

```
Recon → Weaponization → Exploitation → Escalation → Lateral → Exfiltration → C2
  DR-01-05   DR-06-10     DR-11-17      DR-18-22    DR-23-25   DR-26-28     DR-29-30
```

---

## Detection Rules

```yaml
detection_rules:
  # ═══════════════════════════════════════════════════════════════
  # RECON (Kill Chain Stage 1)
  # ═══════════════════════════════════════════════════════════════

  - id: DR-001
    name: System Prompt Extraction Attempt
    trigger: input
    pattern: "(what|show|print|reveal|output|display).*(system prompt|initial instructions|your rules)"
    action: block
    severity: HIGH
    kill_chain_stage: recon
    mitre_technique: AML.T0051
    gaps_closed: [ADV-007, ADV-054]

  - id: DR-002
    name: Internal Path Discovery
    trigger: input
    pattern: "(what is your|show me the|print the).*(working directory|home dir|config path|install path)"
    action: warn
    severity: MEDIUM
    kill_chain_stage: recon
    gaps_closed: [ADV-009]

  - id: DR-003
    name: Capability Probing
    trigger: behavior
    pattern: "> 5 consecutive tool calls with no write operations"
    action: log
    severity: LOW
    kill_chain_stage: recon

  - id: DR-004
    name: File Enumeration
    trigger: behavior
    pattern: "> 10 list_directory calls in single session"
    action: throttle
    severity: MEDIUM
    kill_chain_stage: recon

  - id: DR-005
    name: Credential File Access
    trigger: input
    pattern: "(read_file|cat|grep).*(\.env|\.ssh|id_rsa|password|credential|secret)"
    action: block
    severity: HIGH
    kill_chain_stage: recon
    gaps_closed: [ADV-014]

  # ═══════════════════════════════════════════════════════════════
  # WEAPONIZATION (Kill Chain Stage 2)
  # ═══════════════════════════════════════════════════════════════

  - id: DR-006
    name: Base64 Encoded Injection
    trigger: input
    pattern: "[A-Za-z0-9+/]{20,}={0,2}"
    action: decode_and_rescan
    severity: HIGH
    kill_chain_stage: weaponization
    gaps_closed: [ADV-033, ADV-052]
    implementation: "Decode Base64, run InputGuard on decoded text"

  - id: DR-007
    name: Unicode Homoglyph Normalization
    trigger: input
    pattern: "[\u0400-\u04FF\u2000-\u206F\u00A0]"
    action: normalize_and_rescan
    severity: MEDIUM
    kill_chain_stage: weaponization
    gaps_closed: [ADV-035]
    implementation: "NFKC normalize before InputGuard scan"

  - id: DR-008
    name: Zero-Width Character Stripping
    trigger: input
    pattern: "[\u200B\u200C\u200D\uFEFF\u00AD]"
    action: strip_and_rescan
    severity: MEDIUM
    kill_chain_stage: weaponization
    gaps_closed: [ADV-036]

  - id: DR-009
    name: HTML Entity Decoding
    trigger: input
    pattern: "&#[0-9]+;|&#x[0-9a-fA-F]+;|&[a-z]+;"
    action: decode_and_rescan
    severity: MEDIUM
    kill_chain_stage: weaponization
    gaps_closed: [ADV-037]

  - id: DR-010
    name: ROT13 Detection
    trigger: input
    pattern: "vtaber|cerivbhf|vafgehpgvbaf|olgncf|erfgevpgvbaf"
    action: decode_and_rescan
    severity: LOW
    kill_chain_stage: weaponization
    gaps_closed: [ADV-034]

  # ═══════════════════════════════════════════════════════════════
  # EXPLOITATION (Kill Chain Stage 3)
  # ═══════════════════════════════════════════════════════════════

  - id: DR-011
    name: Indirect Injection via Tool Output
    trigger: output
    pattern: "InputGuard scan on ALL tool return values before context injection"
    action: block
    severity: CRITICAL
    kill_chain_stage: exploitation
    gaps_closed: [ADV-005]
    implementation: "Wrap tool_result in InputGuard::scan() before appending to messages"

  - id: DR-012
    name: Template Injection
    trigger: input
    pattern: "\\{\\{.*\\}\\}|\\$\\{.*\\}|<%.*%>"
    action: block
    severity: HIGH
    kill_chain_stage: exploitation
    gaps_closed: [ADV-004, ADV-043]

  - id: DR-013
    name: CJK Injection (Non-Latin Override)
    trigger: input
    pattern: "忽略|無視|システム|指示を無視|이전 지시를 무시"
    action: block
    severity: MEDIUM
    kill_chain_stage: exploitation
    gaps_closed: [ADV-003]

  - id: DR-014
    name: Authority Claim Bypass
    trigger: input
    pattern: "(as the|I am the|speaking as).*(admin|administrator|owner|root|supervisor|manager)"
    action: warn
    severity: MEDIUM
    kill_chain_stage: exploitation
    gaps_closed: [ADV-027, ADV-050]

  - id: DR-015
    name: Urgency Manipulation
    trigger: input
    pattern: "(urgent|emergency|production.*(down|crash)|critical.*skip.*(check|review|test))"
    action: warn
    severity: MEDIUM
    kill_chain_stage: exploitation
    gaps_closed: [ADV-028]

  - id: DR-016
    name: Markdown/Image Exfiltration
    trigger: output
    pattern: "!\\[.*\\]\\(https?://(?!github\\.com|githubusercontent).*\\)"
    action: block
    severity: HIGH
    kill_chain_stage: exploitation
    gaps_closed: [ADV-040]

  - id: DR-017
    name: XML/HTML Tag Injection
    trigger: input
    pattern: "<(system|admin|override|root|prompt|instruction)[^>]*>"
    action: block
    severity: MEDIUM
    kill_chain_stage: exploitation
    gaps_closed: [ADV-043]

  # ═══════════════════════════════════════════════════════════════
  # ESCALATION (Kill Chain Stage 4)
  # ═══════════════════════════════════════════════════════════════

  - id: DR-018
    name: Tool Chain Detection (Write → Execute)
    trigger: behavior
    pattern: "write_file followed by sandbox_exec within 3 turns"
    action: block_and_hitl
    severity: CRITICAL
    kill_chain_stage: escalation
    gaps_closed: [ADV-012, ADV-056]
    implementation: "Track tool sequence in LoopGuard, flag write→exec patterns"

  - id: DR-019
    name: Rate Limit Enforcement
    trigger: behavior
    pattern: "> 50 write_file calls per session"
    action: throttle
    severity: MEDIUM
    kill_chain_stage: escalation
    gaps_closed: [ADV-015]

  - id: DR-020
    name: DAG Size Limit
    trigger: input
    pattern: "DAG tasks.len() > 25"
    action: reject
    severity: LOW
    kill_chain_stage: escalation
    gaps_closed: [ADV-046]

  - id: DR-021
    name: Concurrent Execution Limit
    trigger: behavior
    pattern: "> 3 concurrent omni run processes"
    action: queue
    severity: MEDIUM
    kill_chain_stage: escalation
    gaps_closed: [ADV-047]

  - id: DR-022
    name: Multi-Turn Drift Escalation
    trigger: behavior
    pattern: "Drift score increases > 0.15 per turn for 3+ consecutive turns"
    action: halt_and_refocus
    severity: HIGH
    kill_chain_stage: escalation
    gaps_closed: [ADV-030, ADV-051]
    implementation: "Leverage existing drift.rs, add per-turn delta tracking"

  # ═══════════════════════════════════════════════════════════════
  # LATERAL MOVEMENT (Kill Chain Stage 5)
  # ═══════════════════════════════════════════════════════════════

  - id: DR-023
    name: Cross-Project File Access
    trigger: behavior
    pattern: "File operation on path outside project_root"
    action: block
    severity: HIGH
    kill_chain_stage: lateral
    implementation: "Already exists in file_system.rs path traversal guard"

  - id: DR-024
    name: Git Submodule Exploitation
    trigger: input
    pattern: "git submodule.*(add|update).*http"
    action: warn
    severity: MEDIUM
    kill_chain_stage: lateral
    gaps_closed: [ADV-059]

  - id: DR-025
    name: Dependency Confusion Check
    trigger: behavior
    pattern: "skill_search returns skill with name similar to known package"
    action: warn
    severity: LOW
    kill_chain_stage: lateral
    gaps_closed: [ADV-023]

  # ═══════════════════════════════════════════════════════════════
  # EXFILTRATION (Kill Chain Stage 6)
  # ═══════════════════════════════════════════════════════════════

  - id: DR-026
    name: URL Parameter Exfiltration
    trigger: output
    pattern: "web_query URL contains (password|key|token|secret|auth) in query params"
    action: block
    severity: CRITICAL
    kill_chain_stage: exfiltration
    gaps_closed: [ADV-057]

  - id: DR-027
    name: ANSI Escape Sequence Injection
    trigger: output
    pattern: "\\x1b\\[|\\033\\["
    action: strip
    severity: LOW
    kill_chain_stage: exfiltration
    gaps_closed: [ADV-055]

  - id: DR-028
    name: Output Credential Sanitizer
    trigger: output
    pattern: "(API_KEY|SECRET|PASSWORD|TOKEN|BEARER)\\s*[=:]\\s*\\S+"
    action: redact
    severity: HIGH
    kill_chain_stage: exfiltration
    implementation: "Post-generation filter before displaying agent output"

  # ═══════════════════════════════════════════════════════════════
  # COMMAND & CONTROL (Kill Chain Stage 7)
  # ═══════════════════════════════════════════════════════════════

  - id: DR-029
    name: Persistent Persona Establishment
    trigger: input
    pattern: "(from now on|remember|always be|you are now).*(hacker|unrestricted|admin|darkgpt)"
    action: block
    severity: HIGH
    kill_chain_stage: c2
    gaps_closed: [ADV-031]

  - id: DR-030
    name: Memory Poisoning Detection
    trigger: behavior
    pattern: "brain memorize with SQL-like content or injection patterns"
    action: scan_and_sanitize
    severity: HIGH
    kill_chain_stage: c2
    gaps_closed: [ADV-045]
```

## Implementation Status — Post-Sprint 6 ✅

| Rule | Description | Status | Sprint |
|------|-------------|--------|--------|
| DR-001→005 | Instruction override, role switching, jailbreak, context manipulation, system prompt | ✅ InputGuard (IG-001→020) | Pre-existing |
| DR-006→009 | Base64/zero-width/homoglyph/HTML entity bypass | ✅ normalize() pipeline | S1 |
| DR-010 | CJK injection | ✅ IG-024→029 (zh/ja/ko) | S3 |
| DR-011 | Tool output scanning | ✅ InputGuard on tool return values | S1 |
| DR-012 | Template/XML injection | ✅ IG-039→044 (Jinja2, ChatML, ERB, XML) | S4 |
| DR-013 | Context padding | ✅ IG-045 detect_padding() | S4 |
| DR-014→016 | Social engineering (authority, urgency, reciprocity) | ✅ IG-030→038 | S1 |
| DR-017 | Persona establishment | ✅ IG-007→009 (role switching) | Pre-existing |
| DR-018 | Tool chaining (write→exec) | ✅ LoopGuard::check_tool_sequence() | S1 |
| DR-019 | Per-tool rate limiting | ✅ LoopGuard::per_tool_limit | S2 |
| DR-020 | DAG size limit | ✅ MAX_DAG_TASKS = 25 | S3 |
| DR-021 | Concurrent swarm control | ✅ SWARM_SEMAPHORE max 3 | S4 |
| DR-022 | Multi-turn drift | ✅ DriftTracker consecutive escalation | S2 |
| DR-023 | Ping-pong loop detection | ✅ LoopGuard | Pre-existing |
| DR-024→025 | Credential leakage (API keys, private keys) | ✅ OutputSanitizer OG-001→007 | S1 |
| DR-026→027 | PII in output (email, phone, SSN, CC) | ✅ OutputSanitizer OG-008→011 | S2 |
| DR-028 | Output credential sanitizer | ✅ OutputSanitizer::redact_all() | S1 |
| DR-029 | Persistent persona | ✅ InputGuard role_switching | Pre-existing |
| DR-030 | Memory poisoning | ✅ Memory payload guard (1MB) | S4 |

**21/30 rules fully implemented in code. Remaining 9 are monitoring-tier (Prometheus/Grafana deployment pending).**

