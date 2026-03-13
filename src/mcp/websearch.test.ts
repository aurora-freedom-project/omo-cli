/**
 * @file websearch.test.ts
 * @description Tests for MCP websearch configuration
 * @run bun test
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"

describe("MCP Websearch Configuration", () => {
  //#given the websearch module
  describe("websearch config object", () => {
    //#when importing the websearch config
    describe("basic properties", () => {
      //#then it should have correct type
      it("should have type set to 'remote'", async () => {
        const { websearch } = await import("./websearch")
        expect(websearch.type).toBe("remote")
      })

      //#then it should have correct URL
      it("should have correct Exa MCP URL", async () => {
        const { websearch } = await import("./websearch")
        expect(websearch.url).toBe("https://mcp.exa.ai/mcp?tools=web_search_exa")
      })

      //#then it should be enabled by default
      it("should be enabled by default", async () => {
        const { websearch } = await import("./websearch")
        expect(websearch.enabled).toBe(true)
      })

      //#then it should not use OAuth
      it("should have oauth disabled", async () => {
        const { websearch } = await import("./websearch")
        expect(websearch.oauth).toBe(false)
      })
    })
  })

  //#given EXA_API_KEY is set in environment
  describe("when EXA_API_KEY is set", () => {
    let originalEnv: NodeJS.ProcessEnv

    beforeEach(() => {
      originalEnv = process.env
      process.env = { ...originalEnv, EXA_API_KEY: "test-api-key-123" }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    //#then it should include API key in headers
    it("should include x-api-key header", async () => {
      const { websearch } = await import("./websearch")
      expect(websearch.headers).toEqual({ "x-api-key": "test-api-key-123" })
    })
  })

  //#given EXA_API_KEY is NOT set in environment
  describe("when EXA_API_KEY is not set", () => {
    let originalEnv: NodeJS.ProcessEnv

    beforeEach(() => {
      originalEnv = process.env
      process.env = { ...originalEnv }
      delete process.env.EXA_API_KEY
    })

    afterEach(() => {
      process.env = originalEnv
    })

    //#then it should not have headers
    it("should not have headers when API key is not set", async () => {
      const { websearch } = await import("./websearch")
      expect(websearch.headers).toBeUndefined()
    })
  })
})
