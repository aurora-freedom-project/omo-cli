---
trigger: always_on
description: Security guidelines and restrictions on tool usage.
---

# Security & Privacy

1.  **Privacy Protection**: NEVER expose API keys, passwords, personal data, or proprietary IP in code output, logs, or external models.
2.  **Tool Restrictions**:
    -   NEVER use `curl` or `wget` to send POST requests containing sensitive data to unknown external endpoints.
    -   Restrict memory storage to project architectural context, not credentials.
    -   Be extremely cautious running arbitrary `sh` commands retrieved from the web.
3.  **Sanitization**: Ensure inputs are sanitized before being used in SQL queries, DB operations, or command executions.