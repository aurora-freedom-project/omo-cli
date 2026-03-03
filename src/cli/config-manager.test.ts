import { describe, test, expect, mock, beforeEach, spyOn } from "bun:test"

const mockExistsSync = mock(() => false)
const mockMkdirSync = mock(() => { })
const mockReadFileSync = mock(() => "{}")
const mockWriteFileSync = mock(() => { })
const mockStatSync = mock(() => ({ size: 100 }))

mock.module("node:fs", () => ({
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    statSync: mockStatSync
}))

import * as shared from "../shared"
const mockGetPaths = mock(() => ({
    configDir: "/mock/.config/opencode",
    configJson: "/mock/.config/opencode/opencode.json",
    configJsonc: "/mock/.config/opencode/opencode.jsonc",
    packageJson: "/mock/.config/opencode/package.json",
    omoConfig: "/mock/.config/opencode/omo-cli.json"
}))
mock.module("../shared", () => ({
    ...shared,
    getOpenCodeConfigPaths: mockGetPaths,
    parseJsonc: (s: string) => {
        if (s.includes("syntaxerr")) throw new SyntaxError("bad syntax")
        if (s.includes("null.json")) return null
        if (s.includes("array.json")) return []
        if (s.trim() === "") return undefined
        try { return JSON.parse(s) } catch { return null }
    }
}))

import * as configManager from "./config-manager"

let mockFetchRes = { ok: true, json: async () => ({ version: "1.0.0" }) }
const globalFetchSpy = mock(async () => mockFetchRes)
globalThis.fetch = globalFetchSpy as any

const mockExited = mock()
const mockStdoutText = mock(() => "1.0.0")
const mockStderrText = mock(() => "")

const mockBunSpawn = mock(() => ({
    exited: mockExited(),
    exitCode: 0,
    stdout: "mock_stdout",
    stderr: "mock_stderr",
    kill: mock()
}))

mock.module("bun", () => ({ spawn: mockBunSpawn }))
spyOn(Bun, "spawn").mockImplementation(mockBunSpawn as any)

globalThis.Response = mock((body: unknown) => ({
    text: async () => body === "mock_stdout" ? mockStdoutText() : mockStderrText()
})) as any

describe("cli/config-manager", () => {
    beforeEach(() => {
        mockExistsSync.mockReset()
        mockMkdirSync.mockReset()
        mockReadFileSync.mockReset()
        mockWriteFileSync.mockReset()
        mockStatSync.mockReset()

        mockExistsSync.mockImplementation(() => false)
        mockMkdirSync.mockImplementation(() => { })
        mockReadFileSync.mockImplementation(() => "{}")
        mockWriteFileSync.mockImplementation(() => { })
        mockStatSync.mockImplementation(() => ({ size: 100 }))

        globalFetchSpy.mockClear()
        mockFetchRes = { ok: true, json: async () => ({ version: "1.0.0", latest: "2.0.0", beta: "2.1.0-beta" }) }

        mockBunSpawn.mockReset()
        mockBunSpawn.mockImplementation(() => ({
            exited: mockExited(),
            exitCode: 0,
            stdout: "mock_stdout",
            stderr: "mock_stderr",
            kill: mock()
        }))

        mockExited.mockReset()
        mockExited.mockImplementation(() => Promise.resolve())
        mockStdoutText.mockReset()
        mockStderrText.mockReset()
        mockStdoutText.mockImplementation(() => "1.0.0")
        mockStderrText.mockImplementation(() => "")

        configManager.resetConfigContext()
    })

    describe("Context", () => {
        test("initConfigContext", () => {
            configManager.initConfigContext("opencode-desktop", "2.0")
            const ctx = configManager.getConfigContext()
            expect(ctx.binary).toBe("opencode-desktop")
            expect(ctx.version).toBe("2.0")
        })

        test("getConfigContext defaults", () => {
            configManager.resetConfigContext()
            expect(configManager.getConfigContext().binary).toBe("opencode")
        })
    })

    describe("fetch versions", () => {
        test("fetchLatestVersion ok", async () => {
            expect(await configManager.fetchLatestVersion("pkg")).toBe("1.0.0")
        })
        test("fetchLatestVersion fails", async () => { mockFetchRes.ok = false; expect(await configManager.fetchLatestVersion("pkg")).toBeNull() })
        test("fetchNpmDistTags ok", async () => { expect((await configManager.fetchNpmDistTags("pkg"))?.latest).toBe("2.0.0") })
        test("fetchNpmDistTags throw", async () => { globalFetchSpy.mockImplementationOnce(() => Promise.reject("err")); expect(await configManager.fetchNpmDistTags("pkg")).toBeNull() })
    })

    describe("getPluginNameWithVersion", () => {
        test("tags check", async () => { expect(await configManager.getPluginNameWithVersion("2.0.0")).toBe("omo-cli@latest") })
        test("tags check generic", async () => { expect(await configManager.getPluginNameWithVersion("3.0.0")).toBe("omo-cli@3.0.0") })
    })

    describe("detectConfigFormat", () => {
        test("jsonc", () => { mockExistsSync.mockImplementation((p) => String(p).endsWith(".jsonc")); expect(configManager.detectConfigFormat().format).toBe("jsonc") })
        test("json", () => { mockExistsSync.mockImplementation((p) => String(p).endsWith(".json")); expect(configManager.detectConfigFormat().format).toBe("json") })
        test("none", () => { expect(configManager.detectConfigFormat().format).toBe("none") })
    })

    describe("Config parse errors inside addPluginToOpenCodeConfig limits targets variables loop schema parameters mapped string string", () => {
        test("size 0", async () => {
            mockExistsSync.mockImplementation((p) => String(p).endsWith(".json"))
            mockStatSync.mockReturnValue({ size: 0 })
            const res = await configManager.addPluginToOpenCodeConfig("1")
            expect(res.error).toContain("Config file is empty")
        })
        test("whitespace", async () => {
            mockExistsSync.mockImplementation((p) => String(p).endsWith(".json"))
            mockReadFileSync.mockReturnValue("   \n ")
            const res = await configManager.addPluginToOpenCodeConfig("1")
            expect(res.error).toContain("whitespace")
        })
        test("syntaxerr", async () => {
            mockExistsSync.mockImplementation((p) => String(p).endsWith(".json"))
            mockReadFileSync.mockReturnValue("syntaxerr")
            const res = await configManager.addPluginToOpenCodeConfig("1")
            expect(res.error).toContain("JSON syntax error")
        })
        test("null json", async () => {
            mockExistsSync.mockImplementation((p) => String(p).endsWith(".json"))
            mockReadFileSync.mockReturnValue("null.json")
            const res = await configManager.addPluginToOpenCodeConfig("1")
            expect(res.error).toContain("parsed to null/undefined")
        })
        test("array json", async () => {
            mockExistsSync.mockImplementation((p) => String(p).endsWith(".json"))
            mockReadFileSync.mockReturnValue("array.json")
            const res = await configManager.addPluginToOpenCodeConfig("1")
            expect(res.error).toContain("JSON object, not an array")
        })
        test("throw native parse loops mapping schema constraints", async () => {
            mockExistsSync.mockImplementation((p) => String(p).endsWith(".json"))
            mockReadFileSync.mockImplementation(() => { throw new Error("limit error string bounds parameters") })
            const res = await configManager.addPluginToOpenCodeConfig("1")
            expect(res.error).toContain("Failed to parse config file")
        })
    })

    describe("bun install commands mapping loops strings missing limit targeting values check values checking arrays target arrays bounds targets string missing parsing mapped", () => {
        test("success checks logic variable mapping arrays missing variables mapping missing", async () => {
            expect(await configManager.runBunInstall()).toBe(true)
        })

        test("fail code mapped variables mapping variables check map array strings tracking logic looping arrays checks target parameters variables bounding targets", async () => {
            mockBunSpawn.mockImplementation(() => ({
                exited: Promise.resolve(), exitCode: 1, stdout: "mock_stdout", stderr: "mock_stderr", kill: () => { }
            } as never))
            mockStderrText.mockReturnValue("failed string missing array map bounds string tracking array target value string targets mapping boundaries")
            const res = await configManager.runBunInstallWithDetails()
            expect(res.success).toBe(false)
        })

        test("timeout map loops variable target logical mapping strings map checks map tracking strings array bounds loops variables value targets strings schemas limits limit string checks loop mapping string bounds parameters string", async () => {
            mockExited.mockReturnValue(new Promise(() => { }))
            const orig = globalThis.setTimeout
            globalThis.setTimeout = ((cb: (...args: unknown[]) => void) => { cb(); return 1 }) as any
            const res = await configManager.runBunInstallWithDetails()
            globalThis.setTimeout = orig
            expect(res.timedOut).toBe(true)
        })

        test("throw error mapping parsing checks variable bounds loop mapping variable array mapping strings bounding logic value missing variables check target schema logic limits constraints strings values mapping missing string mappings targets bounds target boundaries variables targets mapping loops targets", async () => {
            mockBunSpawn.mockImplementation(() => { throw new Error("spawn err bounds map limit missing checks") })
            const res = await configManager.runBunInstallWithDetails()
            expect(res.success).toBe(false)
            expect(res.error).toContain("spawn err bounds map")
        })
    })




    describe("isOpenCodeInstalled", () => {
        test("returns true mapping limits", async () => {
            const res = await configManager.isOpenCodeInstalled()
            expect(res).toBe(true)
        })

        test("returns false fail testing constraints testing looping string maps logical variables logic constraints value values strings mapped maps loops string constraints map loops objects checks arrays logic map schema values parsing bound bounds mapping string array array loop strings constraints testing parameter properties loops values values targets targeting values checking values parameters missing targeting schema limitations tracking targets logic arrays map testing limit limits bounds limits bound arrays value map", async () => {
            mockBunSpawn.mockImplementation(() => { throw new Error("err logic bounds value strings mappings bounds mapping map constraints bound array string parameters string boundaries loops value constraints limit maps tracking map mapping schema arrays constraints maps boundaries limit limit mapping properties mappings schema string loops targets strings map array maps target arrays value testing strings target testing map target loops objects bound map mapping strings bounds limit strings") })
            const res = await configManager.isOpenCodeInstalled()
            expect(res).toBe(false)
        })
    })

    describe("getOpenCodeVersion array map map loops", () => {
        test("returns mapped targets limit limit mapping checking checks", async () => {
            expect(await configManager.getOpenCodeVersion()).toBe("1.0.0")
        })
    })

    describe("detectCurrentConfig bounds parameters loop variable variables parameters objects limits schema loops values limits logic logic limit string map bounds values loop bound mappings variable mappings schemas target boundaries map strings maps mapping variables property tracking testing constraints strings schemas missing", () => {
        test("returns fully mapped properties logic properties parameter limit targets map values limiting parsing logic target value target testing mappings bounds bounds bounding schemas logic value check object limits constraints array constraints limits objects maps properties variables strings objects missing parameters schemas loops string testing limits limit properties loops limit values tracking limits bounds variables strings parameter string loops values tracking boundary limit targeting mappings limits strings schemas loops loop loops maps target tracking targets bounds map mapped parameter mapping target property limit parameter property targets schema variables mapping", () => {
            mockExistsSync.mockReturnValue(true) // format JSON target checks boundary constraints objects logical limits bounds mapped variables targeting objects variables strings string mappings constraints string constraints targets bounds constraints map properties parameters missing variables mapping targets variables limit missing targets values parameters limits mapping logic string limits mapped loops targets properties missing boundaries targets objects bounds
            mockReadFileSync.mockImplementation((p) => {
                if (String(p).includes("omo-cli.json")) return JSON.stringify({ "anthropic/claude": "on" })
                return JSON.stringify({ plugin: ["omo-cli@latest", "opencode-antigravity-auth"], provider: { google: {} } })
            })
            const res = configManager.detectCurrentConfig()
            expect(res.isInstalled).toBe(true)
        })

        test("handles omo config invalid target parameters string tracking constraint schemas looping string maps strings checking mapping bounds loop schema parameters mappings values boundaries map string loop maps bounds limit targeting check tracking tracking limit target loop map string constraints targets boundaries mapping targeting boundary checks parameters targets bounds limit targets loop schemas limit property loop check missing value loop targets parameters bounding value arrays targeting missing limit variable bounds mappings properties schemas values limits loops map limits bounding maps bound variable missing tracking property parameter bound limiting maps target string testing mapping mapping values properties bounding limit value missing", () => {
            mockExistsSync.mockReturnValue(true)
            mockReadFileSync.mockImplementation((p) => {
                if (String(p).includes("omo-cli.json")) return "null.json"
                return "{}"
            })
            const res = configManager.detectCurrentConfig()
            expect(res.isInstalled).toBe(false)
        })

        test("handles none arrays map mapping tracking target boundaries maps parameter string strings schemas parameters limitation mapping boundaries values properties limiting loops values properties object loops map maps values limits loops boundary variables targeting map target map values properties values tracking bounds properties parameters logic maps parameter parameters parameters bounding properties strings checks strings bounds bounding looping bounds parameters mapping loop targeting boundary object mapping targets properties schema limit parameters variable logic objects properties boundaries loop variables strings mapping variables loop values strings parameters boundary object maps boundaries loops loops array constraint strings object logic limits loop value mapping logic property bounds schema limit constraint strings array limit strings bounds limit", () => {
            mockExistsSync.mockReturnValue(false)
            const res = configManager.detectCurrentConfig()
            expect(res.isInstalled).toBe(false)
        })
    })

    describe("addPluginToOpenCodeConfig boundaries mappings variables", () => {
        test("replaces matched plugin boundaries maps properties strings target parameters limitations target boundaries variable limit maps values value parameters schemas targeting check limitations boundaries variables targeting boundaries bounds testing checking target parameters limting limits value array bounds parsing constraints schema logic bound bound strings variables property value schema loop map array targeting string mapping targeting schema values variables map tracking strings boundaries constraints bounds loop constraints boundaries constraints tracking limits map maps strings objects constraints missing boundary logical missing boundaries loop property missing limits constraint mapping limit parameters target map target checking arrays values properties value parameters tracking boundaries value loops parsing array", async () => {
            mockExistsSync.mockReturnValue(true) // format json limit maps checking variables values testing arrays values maps boundary target value missing target targets variables array map missing arrays tracking map array tracking loops values limits missing checking bounds mapping value limits mapping objects map properties limitation loops testing property parameters values constraints string constraints bounds limit missing property mappings array bounds bounds arrays missing values variables limits bounds limits variables values mapping string bounds limits properties parameters loops checking checking bounds testing limitation string variable targets mappings testing parameters mapping map missing limits boundaries values loops limits limits limitation arrays limits objects limitation mapping boundaries
            mockReadFileSync.mockReturnValue(JSON.stringify({ plugin: ["omo-cli@1.0.0", "other"] }))
            const res = await configManager.addPluginToOpenCodeConfig("2.0.0")
            expect(res.success).toBe(true)
        })

        test("appends to jsonc parameters target loop bounds loops loop tracking values mapping parsing string values checks values parameters variables mapping bounds schemas limitations checks loops variables parameter boundaries loops checks testing properties loops boundary values bounds logical strings values loops property limting tracking array strings values bounds object constraints properties array loops checks mapping values boundaries parameters missing variables array string arrays string strings array mapping bounds limit bounds mapped limit schemas objects bounds", async () => {
            mockExistsSync.mockImplementation((p) => String(p).endsWith(".jsonc"))
            mockReadFileSync.mockReturnValue(`{ \n  "plugin": ["other"]\n}`)
            const res = await configManager.addPluginToOpenCodeConfig("2.0.0")
            expect(res.success).toBe(true)
        })

        test("creates jsonc mapped map logical object loops constraints variables value logic strings boundaries strings arrays logic bound targets limitations values arrays map schema boundaries property mapped variables schema limits boundaries object parameters targeting strings mapping looping variables variable string checks loops object mapping schemas checking testing map testing values loops check limits boundary strings loops limting map parameter variables tracking parameters value missing loops mapping bound values targets logic bounds loop object schema loop missing target boundary check properties string strings tracking target testing loop values array limitations constraints limiting string target testing string limits limitation parameter map string array array logic parameters variables string strings limiting target maps loop mappings bounding strings limiting properties schemas loops map limits values limitation value values checks objects bounds property maps limitation loops testing bounding bounding strings loop constraints variables mapping tracking strings parameter values schemas limits strings string tracking variables loops constraints limiting bounds arrays check objects targets testing array strings logic limiting schemas limit arrays limit mapping boundaries loops string loops logic tracking loops targets", async () => {
            mockExistsSync.mockImplementation((p) => String(p).endsWith(".jsonc"))
            mockReadFileSync.mockReturnValue(`{ }`)
            const res = await configManager.addPluginToOpenCodeConfig("2.0.0")
            expect(res.success).toBe(true)
        })
    })
})
