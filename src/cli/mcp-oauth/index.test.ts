import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"
import { Command } from "commander"

const mockLogin = mock(async () => 0)
const mockLogout = mock(async () => 0)
const mockStatus = mock(async () => 0)

mock.module("./login", () => ({ login: mockLogin }))
mock.module("./logout", () => ({ logout: mockLogout }))
mock.module("./status", () => ({ status: mockStatus }))

import { createMcpOAuthCommand } from "./index"

describe("cli/mcp-oauth/index", () => {
  let originalExit: typeof process.exit

  beforeEach(() => {
    mockLogin.mockClear()
    mockLogout.mockClear()
    mockStatus.mockClear()
    originalExit = process.exit
    // @ts-ignore
    process.exit = mock(() => { throw new Error("process.exit") })
  })

  afterEach(() => {
    process.exit = originalExit
    mock.restore()
  })

  test("creates mcp command with oauth subcommands", () => {
    const cmd = createMcpOAuthCommand()
    expect(cmd.name()).toBe("mcp")
    expect(cmd.commands.length).toBe(1)
    expect(cmd.commands[0].name()).toBe("oauth")
  })

  test("login subcommand calls login and process.exit", async () => {
    mockLogin.mockResolvedValueOnce(0)
    const cmd = createMcpOAuthCommand()

    await expect(cmd.parseAsync(["node", "test", "oauth", "login", "serverA", "--server-url", "http://a", "--client-id", "id1", "--scopes", "a", "b"])).rejects.toThrow("process.exit")

    expect(mockLogin).toHaveBeenCalledWith("serverA", { serverUrl: "http://a", clientId: "id1", scopes: ["a", "b"] })
    expect(process.exit).toHaveBeenCalledWith(0)
  })

  test("logout subcommand calls logout and process.exit", async () => {
    mockLogout.mockResolvedValueOnce(1)
    const cmd = createMcpOAuthCommand()

    await expect(cmd.parseAsync(["node", "test", "oauth", "logout", "serverA", "--server-url", "http://a"])).rejects.toThrow("process.exit")

    expect(mockLogout).toHaveBeenCalledWith("serverA", { serverUrl: "http://a" })
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  test("status subcommand calls status and process.exit", async () => {
    mockStatus.mockResolvedValueOnce(0)
    const cmd = createMcpOAuthCommand()

    await expect(cmd.parseAsync(["node", "test", "oauth", "status", "serverA"])).rejects.toThrow("process.exit")

    expect(mockStatus).toHaveBeenCalledWith("serverA")
    expect(process.exit).toHaveBeenCalledWith(0)
  })

  test("status subcommand works without server name", async () => {
    mockStatus.mockResolvedValueOnce(0)
    const cmd = createMcpOAuthCommand()

    await expect(cmd.parseAsync(["node", "test", "oauth", "status"])).rejects.toThrow("process.exit")

    expect(mockStatus).toHaveBeenCalledWith(undefined)
    expect(process.exit).toHaveBeenCalledWith(0)
  })
})
