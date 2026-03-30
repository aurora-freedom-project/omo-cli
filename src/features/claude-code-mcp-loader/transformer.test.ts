import { describe, test, expect } from "bun:test"
import { transformMcpServer } from "./transformer"

describe("claude-code-mcp-loader/transformer", () => {
    test("transforms stdio server with command and args", () => {
        // #given
        const server = { command: "node", args: ["server.js", "--port", "3000"] }

        // #when
        const result = transformMcpServer("test-server", server)

        // #then
        expect(result.type).toBe("local")
        expect((result as { command: string[] }).command).toEqual(["node", "server.js", "--port", "3000"])
        expect(result.enabled).toBe(true)
    })

    test("transforms stdio server with env vars", () => {
        // #given
        const server = { command: "python", env: { API_KEY: "secret" } }

        // #when
        const result = transformMcpServer("py-server", server)

        // #then
        expect(result.type).toBe("local")
        expect((result as { environment: Record<string, string> }).environment).toEqual({ API_KEY: "secret" })
    })

    test("transforms http server", () => {
        // #given
        const server = { type: "http" as const, url: "https://api.example.com" }

        // #when
        const result = transformMcpServer("http-server", server)

        // #then
        expect(result.type).toBe("remote")
        expect((result as { url: string }).url).toBe("https://api.example.com")
    })

    test("transforms sse server with headers", () => {
        // #given
        const server = { type: "sse" as const, url: "https://sse.example.com", headers: { Authorization: "Bearer token" } }

        // #when
        const result = transformMcpServer("sse-server", server)

        // #then
        expect(result.type).toBe("remote")
        expect((result as { headers: Record<string, string> }).headers).toEqual({ Authorization: "Bearer token" })
    })

    test("throws for http without url", () => {
        // #given
        const server = { type: "http" as const }

        // #when / #then
        expect(() => transformMcpServer("badhttp", server as Partial<Parameters<typeof transformMcpServer>[1]>)).toThrow("requires url")
    })

    test("throws for stdio without command", () => {
        // #given
        const server = {}

        // #when / #then
        expect(() => transformMcpServer("badstdio", server as Partial<Parameters<typeof transformMcpServer>[1]>)).toThrow("requires command")
    })

    test("defaults to stdio when type not specified", () => {
        // #given
        const server = { command: "npx", args: ["-y", "some-server"] }

        // #when
        const result = transformMcpServer("default-type", server)

        // #then
        expect(result.type).toBe("local")
    })
})
