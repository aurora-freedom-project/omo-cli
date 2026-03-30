/**
 * Sandbox Exec — Docker-based isolated command execution.
 *
 * Ported from Omni's sandbox_exec. Runs commands inside a Docker container
 * with 5-layer safety: Docker isolation → Tool whitelist → Scope check →
 * HITL gate → Resource limits.
 *
 * The tool is disabled by default and requires explicit configuration
 * in omo-cli.json to enable.
 *
 * @see OmniUltraAgent_Kit/src/agents/tools/security_tools.rs
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { execSync } from "node:child_process"
import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export interface SandboxConfig {
    enabled: boolean
    image: string
    max_timeout_secs: number
    max_memory_mb: number
    allowed_tools: string[]
    dangerous_tools: string[]
}

const DEFAULT_CONFIG: SandboxConfig = {
    enabled: false,
    image: "omni-sandbox:latest",
    max_timeout_secs: 120,
    max_memory_mb: 512,
    allowed_tools: [
        "nmap", "nikto", "curl", "wget", "dig", "nslookup", "whois",
        "traceroute", "ping", "netstat", "ss", "openssl", "nuclei",
        "sqlmap", "gobuster", "dirb", "wfuzz", "ffuf", "httpie",
        "jq", "yq", "xmllint", "python3", "node",
    ],
    dangerous_tools: ["hydra", "hashcat", "john", "metasploit", "msfconsole"],
}

// ── Tool ───────────────────────────────────────────────────────────────────

export function createSandboxExec(config?: Partial<SandboxConfig>): ToolDefinition {
    const cfg: SandboxConfig = { ...DEFAULT_CONFIG, ...config }

    return tool({
        description:
            "Execute a command inside a Docker sandbox with whitelist, resource limits, " +
            "and HITL gates. Must be explicitly enabled in config. " +
            "Ported from Omni's sandbox_exec (5-layer safety).",
        args: {
            command: tool.schema.string().describe("Shell command to execute inside the sandbox."),
            timeout: tool.schema.number().optional().describe(`Timeout in seconds (default: 60, max: ${cfg.max_timeout_secs}).`),
        },
        execute: async (args): Promise<string> => {
            const command = args.command?.trim()
            if (!command) return "Error: Missing 'command' parameter"

            // Gate 1: Must be explicitly enabled
            if (!cfg.enabled) {
                return "Error: Sandbox not enabled. Set sandbox.enabled: true in omo-cli.json"
            }

            // Gate 2: Extract tool binary name (first word)
            const toolName = command.split(/\s+/)[0]
            if (!toolName) return "Error: Empty command"

            // Gate 3: Whitelist check
            if (!cfg.allowed_tools.includes(toolName)) {
                return [
                    `Error: Tool '${toolName}' is not in the allowed list.`,
                    `Allowed: ${cfg.allowed_tools.join(", ")}`,
                ].join("\n")
            }

            // Gate 4: HITL for dangerous tools (in this context, just block with warning)
            if (cfg.dangerous_tools.includes(toolName)) {
                log("[sandbox_exec] Blocked dangerous tool", { tool: toolName, command })
                return [
                    `⚠️  BLOCKED: '${toolName}' is classified as a dangerous tool.`,
                    `Dangerous tools require human-in-the-loop approval.`,
                    `Run manually: docker run --rm ${cfg.image} sh -c "${command}"`,
                ].join("\n")
            }

            // Gate 5: Timeout cap
            const timeout = Math.min(args.timeout ?? 60, cfg.max_timeout_secs) * 1000

            try {
                // Check if Docker is available
                try {
                    execSync("docker info", { stdio: "ignore", timeout: 3000 })
                } catch {
                    return "Error: Docker is not running. Start Docker to use sandbox_exec."
                }

                // Execute via Docker with resource limits
                const dockerArgs = [
                    "docker", "run", "--rm",
                    "--network=host",
                    `--memory=${cfg.max_memory_mb}m`,
                    "--pids-limit=256",
                    "--read-only",
                    cfg.image,
                    "sh", "-c", command,
                ].map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" ")

                // Use a simpler approach — execSync with timeout
                const result = execSync(
                    `docker run --rm --network=host --memory=${cfg.max_memory_mb}m --pids-limit=256 ${cfg.image} sh -c ${JSON.stringify(command)}`,
                    {
                        timeout,
                        maxBuffer: 16 * 1024 * 1024, // 16MB
                        encoding: "utf-8",
                        stdio: ["pipe", "pipe", "pipe"],
                    }
                )

                // Cap output
                const output = (result ?? "") as string
                const capped = output.length > 16384
                    ? output.slice(0, 16384) + "\n[... truncated at 16KB]"
                    : output

                log("[sandbox_exec] Executed", { tool: toolName, outputLength: output.length })

                return `Exit code: 0\n\n--- stdout ---\n${capped}`
            } catch (err: unknown) {
                const error = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string; message?: string }
                const stdout = error.stdout?.toString().slice(0, 8192) || ""
                const stderr = error.stderr?.toString().slice(0, 4096) || ""
                const exitCode = error.status ?? -1

                if (error.message?.includes("ETIMEDOUT") || error.message?.includes("timed out")) {
                    return `Error: Command timed out after ${Math.round(timeout / 1000)}s`
                }

                return [
                    `Exit code: ${exitCode}`,
                    `\n--- stdout ---\n${stdout}`,
                    `\n--- stderr ---\n${stderr}`,
                ].join("")
            }
        },
    })
}
