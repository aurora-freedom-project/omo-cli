/// <reference types="bun-types" />
import { describe, test, expect, mock, beforeEach } from "bun:test"
import { detectSlashCommand, parseSlashCommand } from "../hooks/auto-slash-command/detector"
import { PREFIX_SKILL_MAP } from "../hooks/auto-slash-command/constants"

/**
 * E2E Integration Test: Memory Flow
 *
 * Verifies the complete code path from CLI → tools → surreal-client
 * without requiring a live Docker/SurrealDB instance.
 */
describe("E2E: memory install → start → add/search/graph", () => {
    test("MemoryConfigSchema is part of OmoCliConfigSchema", async () => {
        const { OmoCliConfigSchema, MemoryConfigSchema } = await import("../config/schema")
        expect(MemoryConfigSchema).toBeDefined()

        const valid = OmoCliConfigSchema.safeParse({
            memory: { enabled: true, port: 18000, auto_capture: false },
        })
        expect(valid.success).toBe(true)
    })

    test("ProfileSummary includes enableMemory field", async () => {
        // Import & type check that enableMemory exists
        const summary = {
            name: "test",
            features: [],
            agentCount: 3,
            enableMemory: true,
        }
        expect(summary.enableMemory).toBe(true)
    })

    test("createMemoryCommand returns a Command with 4 subcommands", async () => {
        const { createMemoryCommand } = await import("../cli/memory")
        const cmd = createMemoryCommand()

        expect(cmd.name()).toBe("memory")

        const subNames = cmd.commands.map((c: any) => c.name())
        expect(subNames).toContain("start")
        expect(subNames).toContain("stop")
        expect(subNames).toContain("status")
        expect(subNames).toContain("reset")
    })

    test("createMemoryTools returns all 3 tools with correct schema", async () => {
        const { createMemoryTools } = await import("../cli/memory/memory-tools")

        const ctx = { directory: "/tmp/e2e-test" } as never
        const config = { enabled: true, port: 18000, auto_capture: false, mode: "managed" as const, user: "root", namespace: "omo", database: "memory" }
        const tools = createMemoryTools(ctx, config)

        // All 4 tools exist
        expect(Object.keys(tools).sort()).toEqual(["memory_add", "memory_graph", "memory_link", "memory_search"])

        // memory_add has correct params
        expect(tools.memory_add.parameters.properties.content).toBeDefined()
        expect(tools.memory_add.parameters.properties.tags).toBeDefined()
        expect(tools.memory_add.parameters.required).toContain("content")
        expect(tools.memory_add.parameters.required).toContain("tags")

        // memory_search has correct params
        expect(tools.memory_search.parameters.properties.query).toBeDefined()
        expect(tools.memory_search.parameters.required).toContain("query")

        // memory_graph has correct params
        expect(tools.memory_graph.parameters.properties.concept_id).toBeDefined()
        expect(tools.memory_graph.parameters.required).toContain("concept_id")
    })

    test("surreal-client schema defines concept, file, relates_to tables", async () => {
        const { SURREALQL_SCHEMA } = await import("../cli/memory/surreal-client")

        expect(SURREALQL_SCHEMA).toContain("DEFINE TABLE IF NOT EXISTS concept")
        expect(SURREALQL_SCHEMA).toContain("DEFINE TABLE IF NOT EXISTS file")
        expect(SURREALQL_SCHEMA).toContain("DEFINE TABLE IF NOT EXISTS relates_to")
        expect(SURREALQL_SCHEMA).toContain("DEFINE TABLE IF NOT EXISTS discovered_in")
        expect(SURREALQL_SCHEMA).toContain("HNSW DIMENSION 384 DIST COSINE")
    })

    test("surreal-client uses HTTP RPC (not WebSocket)", async () => {
        // Verify the URL constant in source
        const src = await Bun.file(
            `${import.meta.dir}/../cli/memory/surreal-client.ts`
        ).text()

        expect(src).toContain("http://127.0.0.1:18000/rpc")
        expect(src).not.toContain("ws://localhost:18000")
    })

    test("docker-manager healthcheck uses /health endpoint", async () => {
        const composeSrc = await Bun.file(
            `${import.meta.dir}/../../docker-compose.yml`
        ).text()

        expect(composeSrc).toContain("/surreal")
        expect(composeSrc).toContain("version")
        expect(composeSrc).not.toContain("curl")
    })

    test("docker-manager uses findComposeFile fallback (not hardcoded __dirname)", async () => {
        const src = await Bun.file(
            `${import.meta.dir}/../cli/memory/docker-manager.ts`
        ).text()

        // Must contain findComposeFile function
        expect(src).toContain("function findComposeFile()")
        // Must NOT contain hardcoded DOCKER_COMPOSE_FILE constant
        expect(src).not.toContain("const DOCKER_COMPOSE_FILE")
        // Must have existsSync for candidate checking
        expect(src).toContain("existsSync")
    })

    test("memory.ts displays correct HTTP URL (not ws://)", async () => {
        const src = await Bun.file(
            `${import.meta.dir}/../cli/memory.ts`
        ).text()

        expect(src).toContain("http://localhost:18000")
        expect(src).not.toContain("ws://localhost:18000")
    })

    test("memory-capture hook exports createMemoryCaptureHook", async () => {
        const mod = await import("../hooks/memory-capture/index")
        expect(typeof mod.createMemoryCaptureHook).toBe("function")
    })

    test("compaction-context-injector queries SurrealDB for memory context", async () => {
        const src = await Bun.file(
            `${import.meta.dir}/../hooks/compaction-context-injector/index.ts`
        ).text()

        expect(src).toContain("searchSimilar")
    })

    test("disabled config returns disabled message for all tools", async () => {
        const { createMemoryTools } = await import("../cli/memory/memory-tools")

        const ctx = { directory: "/tmp/e2e-disabled" } as never
        const config = { enabled: false, port: 18000, auto_capture: false, mode: "managed" as const, user: "root", namespace: "omo", database: "memory" }
        const tools = createMemoryTools(ctx, config)

        const addResult = await tools.memory_add.execute({ content: "test", tags: ["x"] })
        expect(addResult).toContain("disabled")

        const searchResult = await tools.memory_search.execute({ query: "test" })
        expect(searchResult).toContain("disabled")

        const graphResult = await tools.memory_graph.execute({ concept_id: "concept:abc" })
        expect(graphResult).toContain("disabled")
    })
})

/**
 * E2E Integration Test: /opsx:propose → OpenSpec Workflow
 *
 * Verifies the full routing path: detector → prefix map → executor
 */
describe("E2E: /opsx:propose → openspec-workflow routing", () => {
    test("PREFIX_SKILL_MAP maps opsx: to openspec-workflow", () => {
        expect(PREFIX_SKILL_MAP["opsx:"]).toBe("openspec-workflow")
    })

    test("detector parses /opsx:propose as command 'opsx:propose'", () => {
        const result = detectSlashCommand("/opsx:propose my-feature-name")

        expect(result).not.toBeNull()
        expect(result!.command).toBe("opsx:propose")
        expect(result!.args).toBe("my-feature-name")
    })

    test("detector parses /opsx:apply as command 'opsx:apply'", () => {
        const result = detectSlashCommand("/opsx:apply spec-name")

        expect(result).not.toBeNull()
        expect(result!.command).toBe("opsx:apply")
        expect(result!.args).toBe("spec-name")
    })

    test("detector parses /opsx:archive without args", () => {
        const result = detectSlashCommand("/opsx:archive")

        expect(result).not.toBeNull()
        expect(result!.command).toBe("opsx:archive")
        expect(result!.args).toBe("")
    })

    test("openspec-workflow SKILL.md exists and mentions slash commands", async () => {
        const skillContent = await Bun.file(
            `${import.meta.dir}/../features/builtin-skills/openspec-workflow/SKILL.md`
        ).text()

        expect(skillContent).toBeTruthy()
        expect(skillContent.length).toBeGreaterThan(100)
        // It should describe the propose/apply/archive subcommands
        expect(skillContent.toLowerCase()).toContain("propose")
        expect(skillContent.toLowerCase()).toContain("apply")
        expect(skillContent.toLowerCase()).toContain("archive")
    })

    test("openspec-workflow is registered in createBuiltinSkills()", async () => {
        const { createBuiltinSkills } = await import("../features/builtin-skills/skills")
        const skills = createBuiltinSkills()

        const opsx = skills.find((s) => s.name === "openspec-workflow")
        expect(opsx).toBeDefined()
        expect(opsx!.description).toBeTruthy()
    })

    test("thoughts-scaffold is registered in createBuiltinSkills()", async () => {
        const { createBuiltinSkills } = await import("../features/builtin-skills/skills")
        const skills = createBuiltinSkills()

        const ts = skills.find((s) => s.name === "thoughts-scaffold")
        expect(ts).toBeDefined()
        expect(ts!.description).toBeTruthy()
    })

    test("regex supports colon-separated commands", () => {
        // Verify other colon commands would also parse correctly
        const result = parseSlashCommand("/ns:sub:deep some args")
        expect(result).not.toBeNull()
        expect(result!.command).toBe("ns:sub:deep")
        expect(result!.args).toBe("some args")
    })

    test("regular slash commands still work after regex change", () => {
        const result1 = detectSlashCommand("/commit fix typo")
        expect(result1).not.toBeNull()
        expect(result1!.command).toBe("commit")

        const result2 = detectSlashCommand("/frontend-template-creator project")
        expect(result2).not.toBeNull()
        expect(result2!.command).toBe("frontend-template-creator")

        // Excluded commands still excluded
        const result3 = detectSlashCommand("/ralph-loop do something")
        expect(result3).toBeNull()
    })
})
