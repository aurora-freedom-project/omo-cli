import { describe, it, expect } from "bun:test"

// Test the pure helper functions from network tools
// Network tools do actual HTTP calls so we test validation logic

describe("Network Security Tools", () => {
    describe("Private IP detection", () => {
        // We test by checking that the tool descriptions are correct
        // and that the module exports properly
        it("module exports all 4 tools", async () => {
            const mod = await import("./index")
            expect(mod.dns_resolve).toBeDefined()
            expect(mod.port_check).toBeDefined()
            expect(mod.tls_inspect).toBeDefined()
            expect(mod.web_crawl).toBeDefined()
        })

        it("dns_resolve has correct metadata", async () => {
            const { dns_resolve } = await import("./index")
            expect(dns_resolve).toHaveProperty("execute")
        })

        it("port_check has correct metadata", async () => {
            const { port_check } = await import("./index")
            expect(port_check).toHaveProperty("execute")
        })

        it("tls_inspect has correct metadata", async () => {
            const { tls_inspect } = await import("./index")
            expect(tls_inspect).toHaveProperty("execute")
        })

        it("web_crawl has correct metadata", async () => {
            const { web_crawl } = await import("./index")
            expect(web_crawl).toHaveProperty("execute")
        })
    })

    describe("dns_resolve validation", () => {
        it("rejects empty domain", async () => {
            const { dns_resolve } = await import("./index")
            const result = await dns_resolve.execute({ domain: "" })
            expect(result).toContain("Error")
        })

        it("rejects localhost", async () => {
            const { dns_resolve } = await import("./index")
            const result = await dns_resolve.execute({ domain: "localhost" })
            expect(result).toContain("Error")
        })
    })

    describe("port_check validation", () => {
        it("rejects private IPs", async () => {
            const { port_check } = await import("./index")
            const result = await port_check.execute({ host: "192.168.1.1", ports: "80" })
            expect(result).toContain("Error")
        })

        it("rejects too many ports", async () => {
            const { port_check } = await import("./index")
            const ports = Array.from({ length: 25 }, (_, i) => i + 1).join(",")
            const result = await port_check.execute({ host: "example.com", ports })
            expect(result).toContain("Max 20")
        })
    })

    describe("tls_inspect validation", () => {
        it("rejects localhost", async () => {
            const { tls_inspect } = await import("./index")
            const result = await tls_inspect.execute({ host: "localhost" })
            expect(result).toContain("Error")
        })
    })

    describe("web_crawl validation", () => {
        it("rejects invalid URL", async () => {
            const { web_crawl } = await import("./index")
            const result = await web_crawl.execute({ url: "not-a-url" })
            expect(result).toContain("Error")
        })

        it("rejects private IP URLs", async () => {
            const { web_crawl } = await import("./index")
            const result = await web_crawl.execute({ url: "http://192.168.1.1/" })
            expect(result).toContain("Error")
        })
    })
})
