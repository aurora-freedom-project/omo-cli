# Monitoring Config — OmniUltraAgent Kit

> Generated: 2026-03-28 | Updated: 2026-03-29 | Source: Blue Team Phase 3
> **Status:** Specification complete. Prometheus/Grafana deployment pending.
> **ISO 42001 §9.1:** `omni doctor` validates file existence as compliance check.

## Metrics & Alert Thresholds

```yaml
monitoring:
  # ═══════════════════════════════════════════════════════════════
  # Agent Metrics
  # ═══════════════════════════════════════════════════════════════
  agent:
    max_turns_per_session:
      threshold: 10
      alert: warn
      description: "Agent hitting max turns indicates task too complex or loop"

    tool_calls_per_turn:
      threshold: 5
      alert: log
      description: "High tool usage per turn may indicate probing"

    response_time_p95:
      threshold_ms: 30000
      alert: warn
      description: "Unusually slow responses may indicate model overload"

    context_utilization:
      threshold_pct: 80
      alert: warn
      description: "Context near limit risks truncation of critical info"

    drift_score:
      threshold: 0.30
      alert: halt
      description: "Task drift beyond threshold triggers refocus"

  # ═══════════════════════════════════════════════════════════════
  # Security Metrics
  # ═══════════════════════════════════════════════════════════════
  security:
    input_guard_trigger_rate:
      threshold_per_hour: 5
      alert: escalate
      description: "Multiple InputGuard blocks → potential adversarial user"

    hitl_approval_ratio:
      threshold_min_pct: 80
      alert: review
      description: "Low approval ratio indicates risky tool usage pattern"

    blocked_write_attempts:
      threshold: 3
      alert: block_session
      description: "Repeated blocked writes → path traversal probing"

    scanner_critical_findings:
      threshold: 1
      alert: block_deployment
      description: "Any critical finding blocks skill deployment"

    encoding_detection_rate:
      threshold_per_session: 2
      alert: warn
      description: "Multiple encoding bypasses in single session"

  # ═══════════════════════════════════════════════════════════════
  # Behavioral Metrics
  # ═══════════════════════════════════════════════════════════════
  behavioral:
    tool_usage_anomaly:
      baseline: "avg tool calls per role from last 100 sessions"
      threshold_sigma: 2.0
      alert: warn
      description: "2σ deviation from baseline indicates unusual behavior"

    unusual_file_access:
      patterns: [".env", ".ssh", "id_rsa", ".git/config", "*.pem"]
      alert: block
      description: "Access to sensitive file patterns blocked"

    external_url_patterns:
      allowed_domains: ["github.com", "docs.rs", "crates.io", "npmjs.com"]
      alert_on_unknown: warn
      description: "Unknown domains in web_query flagged for review"

    write_frequency:
      threshold_per_minute: 10
      alert: throttle
      description: "Burst writes indicate possible automated abuse"

  # ═══════════════════════════════════════════════════════════════
  # Dashboards
  # ═══════════════════════════════════════════════════════════════
  dashboards:
    - name: Security Overview
      widgets:
        - InputGuard blocks (last 24h, by category)
        - Scanner findings (by severity)
        - HITL approval/reject ratio
        - Top 10 blocked patterns

    - name: Agent Behavior
      widgets:
        - Turns per session distribution
        - Tool call frequency by role
        - Context utilization heatmap
        - Drift score timeline

    - name: Compliance Status
      widgets:
        - OWASP LLM coverage %
        - MITRE ATLAS mapping status
        - Open remediation items
        - Weekly regression pass rate

    - name: Incident Timeline
      widgets:
        - Security events chronological
        - Escalation chain (warn → block → halt)
        - False positive rate
        - Mean time to detect (MTTD)
```

## Collection Points

| Metric Source | Collection Method | Storage |
|---------------|------------------|---------|
| InputGuard | Inline in `input_guard.rs` | SurrealDB `event` table |
| Security Scanner | Inline in `security_scanner.rs` | SurrealDB `event` table |
| Agent Execution | Inline in `runner/execution.rs` | SurrealDB `trajectory` table |
| Tool Usage | Inline in `runner/helpers.rs` | SurrealDB `metering` table |
| Drift | Inline in `drift.rs` | SurrealDB `event` table |

## Alert Escalation Chain

```
LOG → WARN → THROTTLE → BLOCK → HALT_SESSION → ESCALATE_TO_USER
 │       │        │         │          │              │
 ▼       ▼        ▼         ▼          ▼              ▼
Event  Console  Rate-limit  Tool     Stop all      Human
table  output   + continue  blocked  agents        review
```
