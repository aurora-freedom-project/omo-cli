import { describe, it, expect } from "bun:test"

describe("LSP tools module", () => {
  it("exports lsp_goto_definition tool", async () => {
    const mod = await import("./tools")
    expect(mod.lsp_goto_definition).toBeDefined()
  })

  it("exports lsp_find_references tool", async () => {
    const mod = await import("./tools")
    expect(mod.lsp_find_references).toBeDefined()
  })

  it("exports lsp_symbols tool", async () => {
    const mod = await import("./tools")
    expect(mod.lsp_symbols).toBeDefined()
  })

  it("exports lsp_diagnostics tool", async () => {
    const mod = await import("./tools")
    expect(mod.lsp_diagnostics).toBeDefined()
  })

  it("exports lsp_prepare_rename tool", async () => {
    const mod = await import("./tools")
    expect(mod.lsp_prepare_rename).toBeDefined()
  })

  it("exports lsp_rename tool", async () => {
    const mod = await import("./tools")
    expect(mod.lsp_rename).toBeDefined()
  })
})

describe("LSP constants", () => {
  it("exports expected constants", async () => {
    const { DEFAULT_MAX_REFERENCES, DEFAULT_MAX_SYMBOLS, DEFAULT_MAX_DIAGNOSTICS } = await import("./constants")
    expect(typeof DEFAULT_MAX_REFERENCES).toBe("number")
    expect(typeof DEFAULT_MAX_SYMBOLS).toBe("number")
    expect(typeof DEFAULT_MAX_DIAGNOSTICS).toBe("number")
    expect(DEFAULT_MAX_REFERENCES).toBeGreaterThan(0)
    expect(DEFAULT_MAX_SYMBOLS).toBeGreaterThan(0)
    expect(DEFAULT_MAX_DIAGNOSTICS).toBeGreaterThan(0)
  })
})
