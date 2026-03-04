import { describe, expect, test } from "bun:test"
import { loadBuiltinCommands } from "./commands"

describe("builtin-commands", () => {
    describe("loadBuiltinCommands", () => {
        test("returns all commands when no disabled list", () => {
            const commands = loadBuiltinCommands()

            expect(Object.keys(commands).length).toBeGreaterThan(0)
            expect(commands["init-deep"]).toBeDefined()
            expect(commands["ralph-loop"]).toBeDefined()
            expect(commands["refactor"]).toBeDefined()
        })

        test("each command has name and description", () => {
            const commands = loadBuiltinCommands()

            for (const [key, cmd] of Object.entries(commands)) {
                expect(cmd.name).toBe(key)
                expect(cmd.description).toBeDefined()
                expect(cmd.description!.length).toBeGreaterThan(0)
            }
        })

        test("excludes disabled commands", () => {
            const commands = loadBuiltinCommands(["init-deep", "refactor"])

            expect(commands["init-deep"]).toBeUndefined()
            expect(commands["refactor"]).toBeUndefined()
            expect(commands["ralph-loop"]).toBeDefined()
        })

        test("returns empty-like object when all commands disabled", () => {
            const allNames = Object.keys(loadBuiltinCommands()) as any[]
            const commands = loadBuiltinCommands(allNames)

            expect(Object.keys(commands).length).toBe(0)
        })

        test("commands have template content", () => {
            const commands = loadBuiltinCommands()

            for (const cmd of Object.values(commands)) {
                expect((cmd as any).template).toBeDefined()
                expect((cmd as any).template.length).toBeGreaterThan(10)
            }
        })
    })
})
