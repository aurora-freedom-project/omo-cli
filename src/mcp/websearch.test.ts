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
    //#then it should include API key in headers if set before module load
    it("should include x-api-key header if env was set before module load", async () => {
      // websearch.ts evaluates process.env.EXA_API_KEY at module-level.
      // Dynamic import() returns cached module — env changes after import have no effect.
      const { websearch } = await import("./websearch")
      if (process.env.EXA_API_KEY) {
        expect(websearch.headers).toEqual({ "x-api-key": process.env.EXA_API_KEY })
      } else {
        expect(websearch.headers).toBeUndefined()
      }
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
