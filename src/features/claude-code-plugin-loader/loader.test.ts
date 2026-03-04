/**
 * Tests for claude-code-plugin-loader
 *
 * Uses temp directory fixtures via CLAUDE_PLUGINS_HOME and CLAUDE_SETTINGS_PATH
 * env vars to avoid complex fs mocking.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const TEST_DIR = join(tmpdir(), `plugin-loader-test-${Date.now()}`)
const PLUGINS_DIR = join(TEST_DIR, "plugins")
const SETTINGS_PATH = join(TEST_DIR, "settings.json")

// Helper to create plugin fixture
function createPluginFixture(opts: {
    pluginKey: string
    name?: string
    version?: string
    scope?: string
    commands?: Record<string, { description?: string; body: string }>
    agents?: Record<string, { description?: string; body: string; tools?: string }>
    skills?: Record<string, { name?: string; description?: string; body: string }>
    hooks?: object
    mcp?: object
    manifest?: object
    dbVersion?: 1 | 2
}) {
    const installPath = join(TEST_DIR, "installed", opts.pluginKey.replace(/[@/]/g, "_"))
    mkdirSync(installPath, { recursive: true })

    // Create manifest
    if (opts.manifest !== undefined || opts.name) {
        const manifestDir = join(installPath, ".claude-plugin")
        mkdirSync(manifestDir, { recursive: true })
        writeFileSync(
            join(manifestDir, "plugin.json"),
            JSON.stringify(opts.manifest ?? { name: opts.name ?? opts.pluginKey, version: opts.version ?? "1.0.0" })
        )
    }

    // Create commands
    if (opts.commands) {
        const cmdDir = join(installPath, "commands")
        mkdirSync(cmdDir, { recursive: true })
        for (const [name, cmd] of Object.entries(opts.commands)) {
            const frontmatter = cmd.description ? `---\ndescription: "${cmd.description}"\n---\n` : "---\n---\n"
            writeFileSync(join(cmdDir, `${name}.md`), frontmatter + cmd.body)
        }
    }

    // Create agents
    if (opts.agents) {
        const agentDir = join(installPath, "agents")
        mkdirSync(agentDir, { recursive: true })
        for (const [name, agent] of Object.entries(opts.agents)) {
            let frontmatter = "---\n"
            if (agent.description) frontmatter += `description: "${agent.description}"\n`
            if (agent.tools) frontmatter += `tools: "${agent.tools}"\n`
            frontmatter += "---\n"
            writeFileSync(join(agentDir, `${name}.md`), frontmatter + agent.body)
        }
    }

    // Create skills
    if (opts.skills) {
        const skillsDir = join(installPath, "skills")
        mkdirSync(skillsDir, { recursive: true })
        for (const [name, skill] of Object.entries(opts.skills)) {
            const skillDir = join(skillsDir, name)
            mkdirSync(skillDir, { recursive: true })
            let frontmatter = "---\n"
            if (skill.name) frontmatter += `name: "${skill.name}"\n`
            if (skill.description) frontmatter += `description: "${skill.description}"\n`
            frontmatter += "---\n"
            writeFileSync(join(skillDir, "SKILL.md"), frontmatter + skill.body)
        }
    }

    // Create hooks
    if (opts.hooks) {
        const hooksDir = join(installPath, "hooks")
        mkdirSync(hooksDir, { recursive: true })
        writeFileSync(join(hooksDir, "hooks.json"), JSON.stringify(opts.hooks))
    }

    // Create MCP config
    if (opts.mcp) {
        writeFileSync(join(installPath, ".mcp.json"), JSON.stringify(opts.mcp))
    }

    // Add to installed_plugins.json
    const dbPath = join(PLUGINS_DIR, "installed_plugins.json")
    let db: Record<string, unknown> = { version: opts.dbVersion ?? 1, plugins: {} }
    try {
        db = JSON.parse(require("fs").readFileSync(dbPath, "utf-8"))
    } catch { /* first plugin */ }

    const installation = {
        scope: opts.scope ?? "user",
        installPath,
        version: opts.version ?? "1.0.0",
        installedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
    }

    if (opts.dbVersion === 2) {
        (db.plugins as Record<string, unknown[]>)[opts.pluginKey] = [installation]
    } else {
        (db.plugins as Record<string, unknown>)[opts.pluginKey] = installation
    }

    writeFileSync(dbPath, JSON.stringify(db))
    return installPath
}

describe("claude-code-plugin-loader", () => {
    let originalPluginsHome: string | undefined
    let originalSettingsPath: string | undefined

    beforeEach(() => {
        originalPluginsHome = process.env.CLAUDE_PLUGINS_HOME
        originalSettingsPath = process.env.CLAUDE_SETTINGS_PATH

        mkdirSync(PLUGINS_DIR, { recursive: true })
        process.env.CLAUDE_PLUGINS_HOME = PLUGINS_DIR
        process.env.CLAUDE_SETTINGS_PATH = SETTINGS_PATH
    })

    afterEach(() => {
        if (originalPluginsHome !== undefined) process.env.CLAUDE_PLUGINS_HOME = originalPluginsHome
        else delete process.env.CLAUDE_PLUGINS_HOME
        if (originalSettingsPath !== undefined) process.env.CLAUDE_SETTINGS_PATH = originalSettingsPath
        else delete process.env.CLAUDE_SETTINGS_PATH

        try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch { /* cleanup */ }
    })

    describe("discoverInstalledPlugins", () => {
        test("returns empty when no installed_plugins.json exists", () => {
            const { discoverInstalledPlugins } = require("./loader")
            const result = discoverInstalledPlugins()
            expect(result.plugins).toEqual([])
            expect(result.errors).toEqual([])
        })

        test("discovers a v1 plugin with commands, agents, skills", () => {
            createPluginFixture({
                pluginKey: "test-plugin@marketplace",
                name: "test-plugin",
                version: "2.0.0",
                commands: {
                    greet: { description: "Say hello", body: "Hello {{name}}!" },
                },
                agents: {
                    helper: { description: "A helper agent", body: "You are a helper." },
                },
                skills: {
                    debugging: { name: "debug-skill", description: "Debug things", body: "Debug instructions" },
                },
            })

            const { discoverInstalledPlugins } = require("./loader")
            const result = discoverInstalledPlugins()

            expect(result.plugins.length).toBe(1)
            expect(result.plugins[0].name).toBe("test-plugin")
            expect(result.plugins[0].version).toBe("2.0.0")
            expect(result.plugins[0].commandsDir).toBeDefined()
            expect(result.plugins[0].agentsDir).toBeDefined()
            expect(result.plugins[0].skillsDir).toBeDefined()
            expect(result.errors).toEqual([])
        })

        test("discovers a v2 plugin (array format)", () => {
            createPluginFixture({
                pluginKey: "v2-plugin@marketplace",
                name: "v2-plugin",
                dbVersion: 2,
            })

            const { discoverInstalledPlugins } = require("./loader")
            const result = discoverInstalledPlugins()

            expect(result.plugins.length).toBe(1)
            expect(result.plugins[0].name).toBe("v2-plugin")
        })

        test("reports error when install path does not exist", () => {
            const dbPath = join(PLUGINS_DIR, "installed_plugins.json")
            writeFileSync(dbPath, JSON.stringify({
                version: 1,
                plugins: {
                    "ghost-plugin@marketplace": {
                        scope: "user",
                        installPath: "/nonexistent/path/to/plugin",
                        version: "1.0.0",
                        installedAt: new Date().toISOString(),
                        lastUpdated: new Date().toISOString(),
                    },
                },
            }))

            const { discoverInstalledPlugins } = require("./loader")
            const result = discoverInstalledPlugins()

            expect(result.plugins.length).toBe(0)
            expect(result.errors.length).toBe(1)
            expect(result.errors[0].pluginKey).toBe("ghost-plugin@marketplace")
            expect(result.errors[0].error).toContain("does not exist")
        })

        test("skips disabled plugins from settings", () => {
            createPluginFixture({
                pluginKey: "disabled-plugin@marketplace",
                name: "disabled-plugin",
            })

            writeFileSync(SETTINGS_PATH, JSON.stringify({
                enabledPlugins: { "disabled-plugin@marketplace": false },
            }))

            const { discoverInstalledPlugins } = require("./loader")
            const result = discoverInstalledPlugins()

            expect(result.plugins.length).toBe(0)
        })

        test("enabledPluginsOverride takes precedence over settings", () => {
            createPluginFixture({
                pluginKey: "override-plugin@marketplace",
                name: "override-plugin",
            })

            writeFileSync(SETTINGS_PATH, JSON.stringify({
                enabledPlugins: { "override-plugin@marketplace": false },
            }))

            const { discoverInstalledPlugins } = require("./loader")
            const result = discoverInstalledPlugins({
                enabledPluginsOverride: { "override-plugin@marketplace": true },
            })

            expect(result.plugins.length).toBe(1)
        })

        test("derives plugin name from key when no manifest exists", () => {
            const installPath = join(TEST_DIR, "installed", "no_manifest_plugin")
            mkdirSync(installPath, { recursive: true })

            const dbPath = join(PLUGINS_DIR, "installed_plugins.json")
            writeFileSync(dbPath, JSON.stringify({
                version: 1,
                plugins: {
                    "my-fancy-plugin@marketplace": {
                        scope: "user",
                        installPath,
                        version: "1.0.0",
                        installedAt: new Date().toISOString(),
                        lastUpdated: new Date().toISOString(),
                    },
                },
            }))

            const { discoverInstalledPlugins } = require("./loader")
            const result = discoverInstalledPlugins()

            expect(result.plugins.length).toBe(1)
            expect(result.plugins[0].name).toBe("my-fancy-plugin")
        })
    })

    describe("loadPluginCommands", () => {
        test("loads commands with frontmatter", () => {
            createPluginFixture({
                pluginKey: "cmd-plugin@mp",
                name: "cmd-plugin",
                commands: {
                    deploy: { description: "Deploy the app", body: "Run deployment steps" },
                    test: { description: "Run tests", body: "Execute test suite" },
                },
            })

            const { discoverInstalledPlugins, loadPluginCommands } = require("./loader")
            const { plugins } = discoverInstalledPlugins()
            const commands = loadPluginCommands(plugins)

            expect(Object.keys(commands).length).toBe(2)
            expect(commands["cmd-plugin:deploy"]).toBeDefined()
            expect(commands["cmd-plugin:deploy"].description).toContain("Deploy the app")
            expect(commands["cmd-plugin:deploy"].description).toContain("(plugin: cmd-plugin)")
            expect(commands["cmd-plugin:deploy"].template).toContain("Run deployment steps")
            expect(commands["cmd-plugin:test"]).toBeDefined()
        })

        test("returns empty object when no commands directory", () => {
            const { loadPluginCommands } = require("./loader")
            const commands = loadPluginCommands([{ name: "empty", commandsDir: undefined }])
            expect(commands).toEqual({})
        })
    })

    describe("loadPluginAgents", () => {
        test("loads agents with frontmatter", () => {
            createPluginFixture({
                pluginKey: "agent-plugin@mp",
                name: "agent-plugin",
                agents: {
                    researcher: { description: "Research agent", body: "You research things.", tools: "read_file,web_search" },
                },
            })

            const { discoverInstalledPlugins, loadPluginAgents } = require("./loader")
            const { plugins } = discoverInstalledPlugins()
            const agents = loadPluginAgents(plugins)

            expect(agents["agent-plugin:researcher"]).toBeDefined()
            expect(agents["agent-plugin:researcher"].description).toContain("Research agent")
            expect(agents["agent-plugin:researcher"].mode).toBe("subagent")
            expect(agents["agent-plugin:researcher"].prompt).toBe("You research things.")
            expect(agents["agent-plugin:researcher"].tools).toBeDefined()
        })
    })

    describe("loadPluginSkillsAsCommands", () => {
        test("loads skills from SKILL.md files", () => {
            createPluginFixture({
                pluginKey: "skill-plugin@mp",
                name: "skill-plugin",
                skills: {
                    "my-skill": { name: "Custom Skill", description: "Does custom stuff", body: "Skill instructions here" },
                },
            })

            const { discoverInstalledPlugins, loadPluginSkillsAsCommands } = require("./loader")
            const { plugins } = discoverInstalledPlugins()
            const skills = loadPluginSkillsAsCommands(plugins)

            expect(skills["skill-plugin:Custom Skill"]).toBeDefined()
            expect(skills["skill-plugin:Custom Skill"].description).toContain("Does custom stuff")
            expect(skills["skill-plugin:Custom Skill"].template).toContain("Skill instructions here")
            expect(skills["skill-plugin:Custom Skill"].template).toContain("skill-instruction")
        })
    })

    describe("loadPluginHooksConfigs", () => {
        test("loads hooks.json from plugin", () => {
            createPluginFixture({
                pluginKey: "hooks-plugin@mp",
                name: "hooks-plugin",
                hooks: {
                    hooks: {
                        PreToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "echo pre" }] }],
                    },
                },
            })

            const { discoverInstalledPlugins, loadPluginHooksConfigs } = require("./loader")
            const { plugins } = discoverInstalledPlugins()
            const configs = loadPluginHooksConfigs(plugins)

            expect(configs.length).toBe(1)
            expect(configs[0].hooks?.PreToolUse).toBeDefined()
            expect(configs[0].hooks!.PreToolUse!.length).toBe(1)
        })
    })

    describe("loadPluginMcpServers", () => {
        test("loads MCP servers from .mcp.json", async () => {
            createPluginFixture({
                pluginKey: "mcp-plugin@mp",
                name: "mcp-plugin",
                mcp: {
                    mcpServers: {
                        "test-server": {
                            command: "node",
                            args: ["server.js"],
                        },
                    },
                },
            })

            const { discoverInstalledPlugins, loadPluginMcpServers } = require("./loader")
            const { plugins } = discoverInstalledPlugins()
            const servers = await loadPluginMcpServers(plugins)

            expect(servers["mcp-plugin:test-server"]).toBeDefined()
        })

        test("skips disabled MCP servers", async () => {
            createPluginFixture({
                pluginKey: "mcp-disabled@mp",
                name: "mcp-disabled",
                mcp: {
                    mcpServers: {
                        "disabled-server": {
                            command: "node",
                            args: ["server.js"],
                            disabled: true,
                        },
                    },
                },
            })

            const { discoverInstalledPlugins, loadPluginMcpServers } = require("./loader")
            const { plugins } = discoverInstalledPlugins()
            const servers = await loadPluginMcpServers(plugins)

            expect(servers["mcp-disabled:disabled-server"]).toBeUndefined()
        })
    })

    describe("loadAllPluginComponents", () => {
        test("loads all components from a full plugin", async () => {
            createPluginFixture({
                pluginKey: "full-plugin@mp",
                name: "full-plugin",
                commands: { cmd1: { description: "A command", body: "Do something" } },
                agents: { agent1: { description: "An agent", body: "You are an agent." } },
                skills: { skill1: { description: "A skill", body: "Skill content" } },
                hooks: { hooks: { Stop: [{ hooks: [{ type: "command", command: "echo done" }] }] } },
                mcp: { mcpServers: { server1: { command: "node", args: ["s.js"] } } },
            })

            const { loadAllPluginComponents } = require("./loader")
            const result = await loadAllPluginComponents()

            expect(result.plugins.length).toBe(1)
            expect(Object.keys(result.commands).length).toBe(1)
            expect(Object.keys(result.agents).length).toBe(1)
            expect(Object.keys(result.skills).length).toBe(1)
            expect(result.hooksConfigs.length).toBe(1)
            expect(Object.keys(result.mcpServers).length).toBe(1)
            expect(result.errors).toEqual([])
        })

        test("returns empty when no plugins installed", async () => {
            const { loadAllPluginComponents } = require("./loader")
            const result = await loadAllPluginComponents()

            expect(result.plugins).toEqual([])
            expect(result.commands).toEqual({})
            expect(result.agents).toEqual({})
            expect(result.skills).toEqual({})
            expect(result.mcpServers).toEqual({})
            expect(result.hooksConfigs).toEqual([])
            expect(result.errors).toEqual([])
        })
    })
})
