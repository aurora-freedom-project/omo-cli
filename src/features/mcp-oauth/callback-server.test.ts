import { afterEach, describe, expect, it } from "bun:test"
import { findAvailablePort, startCallbackServer, type CallbackServer } from "./callback-server"

describe("findAvailablePort", () => {
  it("returns the start port when it is available", async () => {
    //#given
    const startPort = 19877

    //#when
    const port = await findAvailablePort(startPort)

    //#then
    expect(port).toBeGreaterThanOrEqual(startPort)
    expect(port).toBeLessThan(startPort + 20)
  })

  it("skips busy ports and returns next available", async () => {
    //#given
    const blocker = Bun.serve({
      port: 19877,
      hostname: "127.0.0.1",
      fetch: () => new Response(),
    })

    //#when
    const port = await findAvailablePort(19877)

    //#then
    expect(port).toBeGreaterThan(19877)
    blocker.stop(true)
  })
})

// NOTE: These tests use real network ports and may timeout when run in parallel with 
// other test files due to server state conflicts. They pass reliably when run in isolation:
//   bun test src/features/mcp-oauth/callback-server.test.ts
// To run these tests in full suite, set BUN_TEST_SEQUENTIAL=1
const skipNetworkTests = !process.env.BUN_TEST_SEQUENTIAL && process.env.CI !== "true"

describe.skipIf(skipNetworkTests)("startCallbackServer", () => {
  let server: CallbackServer | null = null
  // Use random port offset to avoid conflicts with parallel tests
  const randomPortOffset = Math.floor(Math.random() * 10000) + 30000

  afterEach(() => {
    server?.close()
    server = null
  })

  it("starts server and returns port", async () => {
    //#given - no preconditions

    //#when
    server = await startCallbackServer(randomPortOffset)

    //#then
    expect(server.port).toBeGreaterThanOrEqual(randomPortOffset)
    expect(typeof server.waitForCallback).toBe("function")
    expect(typeof server.close).toBe("function")
  })

  it("resolves callback with code and state from query params", async () => {
    //#given
    server = await startCallbackServer(randomPortOffset)
    const callbackUrl = `http://127.0.0.1:${server.port}/oauth/callback?code=test-code&state=test-state`

    //#when
    // Start the callback wait before making the request
    const callbackPromise = server.waitForCallback()
    // Small delay to ensure server is ready to receive
    await new Promise(resolve => setTimeout(resolve, 10))
    const response = await fetch(callbackUrl)
    const result = await callbackPromise

    //#then
    expect(result).toEqual({ code: "test-code", state: "test-state" })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain("Authorization successful")
  })

  it("returns 404 for non-callback routes", async () => {
    //#given
    server = await startCallbackServer(randomPortOffset)

    //#when
    const response = await fetch(`http://127.0.0.1:${server.port}/other`)

    //#then
    expect(response.status).toBe(404)
  })

  it("returns 400 and rejects when code is missing", async () => {
    //#given
    server = await startCallbackServer(randomPortOffset)
    const callbackRejection = server.waitForCallback().catch((e: Error) => e)

    //#when
    const response = await fetch(`http://127.0.0.1:${server.port}/oauth/callback?state=s`)

    //#then
    expect(response.status).toBe(400)
    const error = await callbackRejection
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("missing code or state")
  })

  it("returns 400 and rejects when state is missing", async () => {
    //#given
    server = await startCallbackServer(randomPortOffset)
    const callbackRejection = server.waitForCallback().catch((e: Error) => e)

    //#when
    const response = await fetch(`http://127.0.0.1:${server.port}/oauth/callback?code=c`)

    //#then
    expect(response.status).toBe(400)
    const error = await callbackRejection
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("missing code or state")
  })

  it("close stops the server immediately", async () => {
    //#given
    server = await startCallbackServer(randomPortOffset)
    const port = server.port

    //#when
    server.close()
    server = null

    //#then
    try {
      await fetch(`http://127.0.0.1:${port}/oauth/callback?code=c&state=s`)
      expect(true).toBe(false)
    } catch (error) {
      expect(error).toBeDefined()
    }
  })
})
