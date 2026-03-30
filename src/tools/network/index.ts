/**
 * Network Security Tools — TLS Inspect, DNS Resolve, Port Check, Web Crawl
 *
 * Ported from Omni's security_tools.rs network analysis suite.
 * Provides security reconnaissance tools for blue/red team workflows.
 *
 * Tools:
 * - dns_resolve: DNS resolution with private IP filtering
 * - port_check: TCP port connectivity scan (max 20 ports)
 * - tls_inspect: TLS/HTTPS security header analysis
 * - web_crawl: BFS web crawl with depth limit and same-domain restriction
 *
 * @see OmniUltraAgent_Kit/src/agents/tools/security_tools.rs
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { log } from "../../shared/logger"

// ── Helpers ────────────────────────────────────────────────────────────────

/** Private IP detection (blocks SSRF). */
function isPrivateIP(ip: string): boolean {
    return (
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        ip.startsWith("127.") ||
        ip.startsWith("0.") ||
        ip === "::1" ||
        ip.startsWith("169.254.") ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)
    )
}

/** Validate hostname — blocks private IPs and suspicious inputs. */
function validateHost(host: string): string | null {
    if (!host || host.length < 3 || host.length > 253) return "Invalid hostname"
    if (/[^a-zA-Z0-9._-]/.test(host)) return "Hostname contains invalid characters"
    if (isPrivateIP(host)) return `Blocked: '${host}' is a private/local address`
    if (host === "localhost") return "Blocked: localhost access denied"
    return null // valid
}

/** Extract domain from URL. */
function extractDomain(url: string): string | null {
    try {
        return new URL(url).hostname
    } catch {
        return null
    }
}

/** Extract links from HTML body, resolving relative URLs. */
function extractLinks(html: string, baseUrl: string): string[] {
    const links: string[] = []
    const hrefPattern = /href\s*=\s*["']([^"'#]+)["']/gi
    let match: RegExpExecArray | null
    while ((match = hrefPattern.exec(html)) !== null) {
        try {
            const resolved = new URL(match[1], baseUrl).href
            if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
                links.push(resolved)
            }
        } catch { /* skip invalid URLs */ }
    }
    return links
}

// ── Tool: dns_resolve ──────────────────────────────────────────────────────

export const dns_resolve: ToolDefinition = tool({
    description:
        "Resolve DNS records for a domain. Returns IP addresses with private IP filtering. " +
        "Ported from Omni's dns_resolve security tool.",
    args: {
        domain: tool.schema.string().describe("Domain to resolve (e.g. 'example.com')."),
    },
    execute: async (args): Promise<string> => {
        const domain = args.domain?.trim()
        if (!domain) return "Error: Missing 'domain' parameter"
        if (domain.length > 253) return "Error: Domain too long"

        const hostError = validateHost(domain)
        if (hostError) return `Error: ${hostError}`

        try {
            // Use Node.js DNS resolution via fetch to a DNS-over-HTTPS provider
            const response = await fetch(
                `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
                { signal: AbortSignal.timeout(5000) }
            )

            if (!response.ok) {
                return `Error: DNS query failed with status ${response.status}`
            }

            const data = await response.json() as {
                Status: number
                Answer?: Array<{ type: number; data: string; name: string; TTL: number }>
            }

            if (data.Status !== 0 || !data.Answer || data.Answer.length === 0) {
                return `No DNS records found for ${domain} (Status: ${data.Status})`
            }

            const ips = data.Answer
                .filter(a => a.type === 1) // A records only
                .map(a => a.data)

            const publicIPs = ips.filter(ip => !isPrivateIP(ip))

            log("[dns_resolve] Resolved", { domain, total: ips.length, public: publicIPs.length })

            return [
                `DNS records for ${domain}:`,
                `  All: ${ips.join(", ") || "none"}`,
                `  Public: ${publicIPs.length > 0 ? publicIPs.join(", ") : "none (all private)"}`,
                `  Records: ${data.Answer.length}`,
            ].join("\n")
        } catch (err) {
            return `Error: DNS resolution failed for '${domain}': ${err instanceof Error ? err.message : String(err)}`
        }
    },
})

// ── Tool: port_check ───────────────────────────────────────────────────────

export const port_check: ToolDefinition = tool({
    description:
        "Check TCP port connectivity for a host. Scans up to 20 ports with 3s timeout per port. " +
        "Ported from Omni's port_check security tool.",
    args: {
        host: tool.schema.string().describe("Hostname or IP to scan."),
        ports: tool.schema.string().describe("Comma-separated list of ports (e.g. '22,80,443,8080'). Max 20."),
    },
    execute: async (args): Promise<string> => {
        const host = args.host?.trim()
        if (!host) return "Error: Missing 'host' parameter"

        const hostError = validateHost(host)
        if (hostError) return `Error: ${hostError}`

        const ports = (args.ports || "")
            .split(",")
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n > 0 && n <= 65535)

        if (ports.length === 0) return "Error: No valid ports specified"
        if (ports.length > 20) return "Error: Max 20 ports per call"

        const results: string[] = []
        for (const port of ports) {
            try {
                const controller = new AbortController()
                const timeout = setTimeout(() => controller.abort(), 3000)

                // Try connecting via fetch to detect open ports
                const testUrl = `http${port === 443 ? "s" : ""}://${host}:${port}/`
                const resp = await fetch(testUrl, {
                    method: "HEAD",
                    signal: controller.signal,
                }).catch(err => {
                    // Connection refused → port closed, timeout → filtered
                    if (err?.name === "AbortError") return "TIMEOUT"
                    const msg = String(err?.message || err)
                    if (msg.includes("ECONNREFUSED") || msg.includes("refused")) return "CLOSED"
                    return "OPEN" // Got a response (even if error), port is open
                })
                clearTimeout(timeout)

                const status = typeof resp === "string" ? resp : "OPEN"
                results.push(`  ${host}:${port} → ${status}`)
            } catch {
                results.push(`  ${host}:${port} → ERROR`)
            }
        }

        log("[port_check] Scanned", { host, ports: ports.length })
        return `Port scan results for ${host}:\n${results.join("\n")}`
    },
})

// ── Tool: tls_inspect ──────────────────────────────────────────────────────

export const tls_inspect: ToolDefinition = tool({
    description:
        "Inspect TLS/HTTPS security headers for a host. Checks HSTS, CSP, X-Frame-Options, etc. " +
        "Ported from Omni's tls_inspect security tool.",
    args: {
        host: tool.schema.string().describe("Hostname to inspect (e.g. 'github.com')."),
    },
    execute: async (args): Promise<string> => {
        const host = args.host?.trim()
        if (!host) return "Error: Missing 'host' parameter"

        const hostError = validateHost(host)
        if (hostError) return `Error: ${hostError}`

        try {
            const url = `https://${host}/`
            const response = await fetch(url, {
                method: "HEAD",
                headers: { "User-Agent": "OmoAgent/1.0" },
                redirect: "follow",
                signal: AbortSignal.timeout(10000),
            })

            const status = response.status
            const SECURITY_HEADERS = [
                "strict-transport-security",
                "content-security-policy",
                "x-content-type-options",
                "x-frame-options",
                "x-xss-protection",
                "referrer-policy",
                "permissions-policy",
                "access-control-allow-origin",
                "x-powered-by",
                "server",
            ]

            const findings: string[] = []
            for (const hdr of SECURITY_HEADERS) {
                const value = response.headers.get(hdr)
                if (value) {
                    findings.push(`  ✅ ${hdr}: ${value.slice(0, 200)}`)
                } else {
                    const severity = (() => {
                        switch (hdr) {
                            case "strict-transport-security": return "⚠️  MISSING (HIGH)"
                            case "content-security-policy": return "⚠️  MISSING (HIGH)"
                            case "x-content-type-options": return "⚠️  MISSING (MEDIUM)"
                            case "x-frame-options": return "⚠️  MISSING (MEDIUM)"
                            case "x-powered-by":
                            case "server": return "✅ absent (info leak prevented)"
                            default: return "ℹ️  MISSING (LOW)"
                        }
                    })()
                    findings.push(`  ${severity} ${hdr}`)
                }
            }

            log("[tls_inspect] Inspected", { host, status })

            return [
                `TLS Inspection for ${host}:`,
                `  Status: ${status}`,
                ``,
                `Security Headers:`,
                ...findings,
            ].join("\n")
        } catch (err) {
            return `Error: TLS connection failed to ${host}: ${err instanceof Error ? err.message : String(err)}`
        }
    },
})

// ── Tool: web_crawl ────────────────────────────────────────────────────────

export const web_crawl: ToolDefinition = tool({
    description:
        "BFS web crawl starting from a URL. Discovers linked pages within the same domain. " +
        "Max depth 3, max 50 pages, 30s timeout. Returns URL list with status. " +
        "Ported from Omni's web_crawl security tool.",
    args: {
        url: tool.schema.string().describe("Starting URL to crawl."),
        depth: tool.schema.number().optional().describe("Max crawl depth (1-3, default 2)."),
        max_pages: tool.schema.number().optional().describe("Max pages to visit (1-50, default 20)."),
    },
    execute: async (args): Promise<string> => {
        const startUrl = args.url?.trim()
        if (!startUrl) return "Error: Missing 'url' parameter"

        const maxDepth = Math.min(args.depth ?? 2, 3)
        const maxPages = Math.min(args.max_pages ?? 20, 50)

        // Validate start URL
        const baseDomain = extractDomain(startUrl)
        if (!baseDomain) return `Error: Invalid URL '${startUrl}'`

        const hostError = validateHost(baseDomain)
        if (hostError) return `Error: ${hostError}`

        const visited = new Set<string>()
        const queue: Array<[string, number]> = [[startUrl, 0]]
        const foundUrls: Array<{ url: string; status: number; depth: number }> = []
        const deadline = Date.now() + 30000 // 30s timeout

        while (queue.length > 0 && visited.size < maxPages && Date.now() < deadline) {
            const [url, depth] = queue.shift()!
            if (visited.has(url) || depth > maxDepth) continue
            visited.add(url)

            try {
                const resp = await fetch(url, {
                    method: "GET",
                    headers: { "User-Agent": "OmoAgent/1.0 Crawler" },
                    redirect: "follow",
                    signal: AbortSignal.timeout(5000),
                })

                foundUrls.push({ url, status: resp.status, depth })

                if (resp.ok && depth < maxDepth) {
                    const body = await resp.text()
                    const links = extractLinks(body, url)
                    for (const link of links) {
                        const domain = extractDomain(link)
                        if (domain === baseDomain && !visited.has(link)) {
                            queue.push([link, depth + 1])
                        }
                    }
                }
            } catch {
                foundUrls.push({ url, status: 0, depth })
            }
        }

        if (foundUrls.length === 0) return `No pages found for ${startUrl}`

        log("[web_crawl] Crawled", { startUrl, pages: foundUrls.length, depth: maxDepth })

        const urlLines = foundUrls.map(u =>
            `  [d${u.depth}] ${u.status || "ERR"} ${u.url}`
        )

        return [
            `Web Crawl Results for ${baseDomain}:`,
            `  Pages found: ${foundUrls.length}`,
            `  Max depth: ${maxDepth}`,
            `  Duration: ${Math.round((Date.now() - (deadline - 30000)) / 1000)}s`,
            ``,
            ...urlLines,
        ].join("\n")
    },
})
