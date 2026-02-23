import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { join } from "node:path"

// Since profile-manager uses __dirname internally to find profiles/,
// we test the core logic by importing the module and using its public API.
import { listProfiles, applyProfile, getActiveProfile, setActiveProfile, getProfilesDirectory } from "./profile-manager"

describe("profile-manager", () => {
    describe("listProfiles", () => {
        test("returns profiles from the profiles/ directory", () => {
            const profiles = listProfiles()
            // Should find the built-in profiles we created
            expect(profiles.length).toBeGreaterThanOrEqual(1)
        })

        test("each profile has name, path, and summary", () => {
            const profiles = listProfiles()
            for (const profile of profiles) {
                expect(profile.name).toBeTruthy()
                expect(profile.path).toContain("omo-cli.json")
                expect(profile.summary).toBeTruthy()
            }
        })

        test("mike profile appears first when present", () => {
            const profiles = listProfiles()
            const hasMike = profiles.some((p) => p.name === "mike")
            if (hasMike) {
                expect(profiles[0]?.name).toBe("mike")
            }
        })

        test("mike profile is listed", () => {
            const profiles = listProfiles()
            const names = profiles.map((p) => p.name)
            expect(names).toContain("mike")
        })

        test("mike profile summary describes providers", () => {
            const profiles = listProfiles()
            const mike = profiles.find((p) => p.name === "mike")
            expect(mike?.summary).toContain("Antigravity")
            expect(mike?.summary).toContain("Ollama")
        })
    })

    describe("getProfilesDirectory", () => {
        test("returns a path ending with /profiles", () => {
            const dir = getProfilesDirectory()
            expect(dir).toMatch(/profiles$/)
        })

        test("profiles directory exists", () => {
            const dir = getProfilesDirectory()
            expect(existsSync(dir)).toBe(true)
        })
    })

    describe("setActiveProfile / getActiveProfile", () => {
        const originalActive = getActiveProfile()

        afterEach(() => {
            // Restore original active profile
            if (originalActive) {
                setActiveProfile(originalActive)
            }
        })

        test("set and get active profile", () => {
            setActiveProfile("test-profile")
            expect(getActiveProfile()).toBe("test-profile")
        })

        test("overwrite active profile", () => {
            setActiveProfile("first")
            setActiveProfile("second")
            expect(getActiveProfile()).toBe("second")
        })
    })

    describe("applyProfile", () => {
        test("returns error for non-existent profile", () => {
            const result = applyProfile("non-existent-profile-xyz")
            expect(result.success).toBe(false)
            expect(result.error).toContain("not found")
        })

        test("apply existing profile succeeds", () => {
            const result = applyProfile("mike")
            expect(result.success).toBe(true)
            expect(result.path).toContain("omo-cli.json")

            // Verify the active profile was set
            expect(getActiveProfile()).toBe("mike")

            // Verify the file was written
            const content = readFileSync(result.path, "utf-8")
            const config = JSON.parse(content)
            expect(config.agents).toBeDefined()
            expect(config.agents.sisyphus).toBeDefined()
            expect(config.agents.sisyphus.model).toContain("opus-4-6")
        })
    })

    describe("profile JSON structure", () => {
        test("all profiles have identical agent keys", () => {
            const profiles = listProfiles()
            const expectedAgents = [
                "sisyphus", "prometheus", "atlas", "oracle",
                "metis", "momus", "sisyphus-junior",
                "multimodal-looker", "explore", "librarian",
            ]
            const expectedCategories = [
                "visual-engineering", "quick", "ultrabrain", "business-logic",
                "writing", "unspecified-high", "unspecified-low", "artistry",
            ]

            for (const profile of profiles) {
                const content = readFileSync(profile.path, "utf-8")
                const config = JSON.parse(content)

                const agentKeys = Object.keys(config.agents ?? {}).sort()
                expect(agentKeys).toEqual(expectedAgents.sort())

                const categoryKeys = Object.keys(config.categories ?? {}).sort()
                expect(categoryKeys).toEqual(expectedCategories.sort())

                expect(config.background_task).toBeDefined()
                expect(config.skills_mode).toBeDefined()
            }
        })

        test("all profiles have valid model strings", () => {
            const profiles = listProfiles()

            for (const profile of profiles) {
                const content = readFileSync(profile.path, "utf-8")
                const config = JSON.parse(content)

                for (const [name, agent] of Object.entries(config.agents ?? {})) {
                    const a = agent as { model: string }
                    expect(a.model).toBeTruthy()
                    expect(a.model).toContain("/") // model format: provider/model-name
                }

                for (const [name, cat] of Object.entries(config.categories ?? {})) {
                    const c = cat as { model: string }
                    expect(c.model).toBeTruthy()
                    expect(c.model).toContain("/")
                }
            }
        })
    })
})
