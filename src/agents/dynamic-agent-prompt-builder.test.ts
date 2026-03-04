import { describe, it, expect } from "bun:test"
import {
    categorizeTools,
    buildKeyTriggersSection,
    buildToolSelectionTable,
    buildExploreSection,
    buildResearcherSection,
    buildDelegationTable,
    buildCategorySkillsDelegationGuide,
    buildArchitectSection,
    buildHardBlocksSection,
    buildAntiPatternsSection,
    buildUltraworkSection,
} from "./dynamic-agent-prompt-builder"
import type { AgentPromptMetadata, BuiltinAgentName, AgentCategory, AgentCost, DelegationTrigger } from "./types"

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const createAgent = (
    name: BuiltinAgentName,
    description: string,
    metadata: Partial<AgentPromptMetadata> = {}
) => ({
    name,
    description,
    metadata: {
        category: "specialist" as AgentCategory,
        cost: "low" as AgentCost,
        triggers: [] as DelegationTrigger[],
        ...metadata,
    } as AgentPromptMetadata,
})

const mockAgents = [
    createAgent("orchestrator", "Top-level orchestrator", {
        category: "utility",
        cost: "EXPENSIVE",
        triggers: [{ domain: "Complex tasks", trigger: "Multi-step planning" }],
    }),
    createAgent("explorer", "Code exploration", {
        category: "exploration",
        cost: "FREE",
        triggers: [{ domain: "Code search", trigger: "Find code in codebase" }],
    }),
    createAgent("researcher", "Research tasks", {
        category: "exploration",
        cost: "CHEAP",
        triggers: [{ domain: "Research", trigger: "Best practices lookup" }],
    }),
    createAgent("architect", "Architecture decisions", {
        category: "advisor",
        cost: "EXPENSIVE",
        triggers: [{ domain: "Design", trigger: "Complex architecture" }],
    }),
    createAgent("reviewer", "Code review", {
        category: "specialist",
        cost: "CHEAP",
        triggers: [],
    }),
]

const mockSkills = [
    { name: "git-master", description: "Git operations", location: "user" as const },
    { name: "context7", description: "Context management", location: "project" as const },
]

const mockCategories = [
    { name: "visual-engineering", description: "Frontend/UI work" },
    { name: "quick", description: "Simple tasks" },
]

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("dynamic-agent-prompt-builder", () => {
    describe("categorizeTools", () => {
        it("categorizes known tool names correctly", () => {
            const tools = categorizeTools([
                "lsp_get_definition",
                "ast_grep_search",
                "bash",
                "session_list",
                "delegate_task",
            ])

            expect(tools.length).toBe(5)

            const lspTool = tools.find(t => t.name === "lsp_get_definition")
            expect(lspTool?.category).toBe("lsp")

            const astTool = tools.find(t => t.name === "ast_grep_search")
            expect(astTool?.category).toBe("ast")

            const bashTool = tools.find(t => t.name === "bash")
            expect(bashTool?.category).toBeDefined()

            const sessionTool = tools.find(t => t.name === "session_list")
            expect(sessionTool?.category).toBe("session")
        })

        it("defaults unknown tools to 'other'", () => {
            const tools = categorizeTools(["unknown_tool"])
            expect(tools[0]?.category).toBe("other")
        })

        it("handles empty input", () => {
            const tools = categorizeTools([])
            expect(tools).toEqual([])
        })
    })


    describe("buildKeyTriggersSection", () => {
        it("generates trigger section with agents", () => {
            const section = buildKeyTriggersSection(mockAgents)
            expect(typeof section).toBe("string")
        })

        it("works with skills parameter", () => {
            const section = buildKeyTriggersSection(mockAgents, mockSkills)
            expect(typeof section).toBe("string")
        })
    })

    describe("buildToolSelectionTable", () => {
        it("generates table with agents and tools", () => {
            const tools = categorizeTools(["lsp_get_definition", "bash"])
            const table = buildToolSelectionTable(mockAgents, tools)

            expect(table).toContain("|")
            expect(typeof table).toBe("string")
        })

        it("handles no tools or skills", () => {
            const table = buildToolSelectionTable(mockAgents)
            expect(typeof table).toBe("string")
        })
    })

    describe("buildExploreSection", () => {
        it("generates explorer section when explorer agent exists", () => {
            const section = buildExploreSection(mockAgents)
            expect(typeof section).toBe("string")
        })

        it("returns empty or minimal when no explorer", () => {
            const agents = mockAgents.filter(a => a.name !== "explorer")
            const section = buildExploreSection(agents)
            expect(typeof section).toBe("string")
        })
    })

    describe("buildResearcherSection", () => {
        it("generates researcher section", () => {
            const section = buildResearcherSection(mockAgents)
            expect(typeof section).toBe("string")
        })

        it("handles missing researcher agent", () => {
            const agents = mockAgents.filter(a => a.name !== "researcher")
            const section = buildResearcherSection(agents)
            expect(typeof section).toBe("string")
        })
    })

    describe("buildDelegationTable", () => {
        it("creates delegation table with all agents", () => {
            const table = buildDelegationTable(mockAgents)
            expect(table).toContain("|")
            expect(typeof table).toBe("string")
        })

        it("handles single agent", () => {
            const table = buildDelegationTable([mockAgents[0]!])
            expect(typeof table).toBe("string")
        })
    })

    describe("buildCategorySkillsDelegationGuide", () => {
        it("generates guide with categories and skills", () => {
            const guide = buildCategorySkillsDelegationGuide(mockCategories, mockSkills)
            expect(typeof guide).toBe("string")
            expect(guide.length).toBeGreaterThan(0)
        })

        it("handles empty categories", () => {
            const guide = buildCategorySkillsDelegationGuide([], mockSkills)
            expect(typeof guide).toBe("string")
        })

        it("handles empty skills", () => {
            const guide = buildCategorySkillsDelegationGuide(mockCategories, [])
            expect(typeof guide).toBe("string")
        })
    })

    describe("buildArchitectSection", () => {
        it("generates architect section", () => {
            const section = buildArchitectSection(mockAgents)
            expect(typeof section).toBe("string")
        })
    })

    describe("buildHardBlocksSection", () => {
        it("returns non-empty string", () => {
            const section = buildHardBlocksSection()
            expect(section.length).toBeGreaterThan(0)
            expect(typeof section).toBe("string")
        })
    })

    describe("buildAntiPatternsSection", () => {
        it("returns non-empty string", () => {
            const section = buildAntiPatternsSection()
            expect(section.length).toBeGreaterThan(0)
        })
    })

    describe("buildUltraworkSection", () => {
        it("generates ultrawork section with all inputs", () => {
            const section = buildUltraworkSection(mockAgents, mockCategories, mockSkills)
            expect(typeof section).toBe("string")
            expect(section.length).toBeGreaterThan(0)
        })

        it("handles empty inputs", () => {
            const section = buildUltraworkSection([], [], [])
            expect(typeof section).toBe("string")
        })
    })
})
