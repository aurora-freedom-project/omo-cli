import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test"

// Mock child_process
const mockSpawnSync = mock(() => ({ stdout: Buffer.from("true") }))
const mockExecSync = mock(() => Buffer.from(""))
mock.module("child_process", () => ({
    spawnSync: mockSpawnSync,
    execSync: mockExecSync
}))

// Mock fs
const mockExistsSync = mock(() => false)
mock.module("fs", () => ({ existsSync: mockExistsSync }))

// Mock os
const mockHomedir = mock(() => "/test/home")
mock.module("os", () => ({ homedir: mockHomedir }))

// Mock logger
const mockLog = mock(() => { })
mock.module("../../shared/logger", () => ({ log: mockLog }))

import * as dockerManager from "./docker-manager"

describe("cli/memory/docker-manager", () => {
    let globalFetchSpy: any

    beforeEach(() => {
        mockSpawnSync.mockClear()
        mockExecSync.mockClear()
        mockExistsSync.mockClear()
        mockHomedir.mockClear()
        mockLog.mockClear()

        globalFetchSpy = spyOn(globalThis, "fetch").mockImplementation(async () => ({ ok: true }) as any)
    })

    afterEach(() => {
        globalFetchSpy.mockRestore()
    })

    describe("isSurrealDBHealthy", () => {
        test("returns true if health check returns ok bounds", async () => {
            const res = await dockerManager.isSurrealDBHealthy()
            expect(res).toBe(true)
        })

        test("returns false if mapping request throws limit", async () => {
            globalFetchSpy.mockRejectedValueOnce(new Error("conn refused"))
            const res = await dockerManager.isSurrealDBHealthy()
            expect(res).toBe(false)
        })
    })

    describe("getSurrealDBStatus", () => {
        test("returns not_installed if spawn sync throws mapped limits", async () => {
            mockSpawnSync.mockImplementationOnce(() => { throw new Error("not found") })
            const res = await dockerManager.getSurrealDBStatus()
            expect(res).toBe("not_installed")
        })

        test("returns stopped if container check limits throw string bounds", async () => {
            // First spawn check docker version passes
            // Second spawn (inspect) throws map
            mockSpawnSync.mockImplementation((cmd, args: any[]) => {
                if (args.includes("--version")) return { stdout: Buffer.from("") }
                if (args.includes("inspect")) throw new Error("not found string")
                return { stdout: Buffer.from("") }
            })
            const res = await dockerManager.getSurrealDBStatus()
            expect(res).toBe("stopped")
        })

        test("returns stopped if container running check resolves false limit arrays", async () => {
            mockSpawnSync.mockImplementation((cmd, args: any[]) => {
                if (args.includes("inspect")) return { stdout: "false" }
                return { stdout: Buffer.from("") }
            })
            const res = await dockerManager.getSurrealDBStatus()
            expect(res).toBe("stopped")
        })

        test("returns running if all spawn checks map naturally passing fetch true limits", async () => {
            mockSpawnSync.mockImplementation((cmd, args: any[]) => {
                if (args.includes("inspect")) return { stdout: "true " } // test trimming
                return { stdout: Buffer.from("") }
            })
            const res = await dockerManager.getSurrealDBStatus()
            expect(res).toBe("running")
        })
    })

    describe("ensureSurrealDBRunning", () => {
        test("throws explicitly testing nested node array maps for docker installed check", async () => {
            mockSpawnSync.mockImplementationOnce(() => { throw new Error("limit arrays var map") })
            await expect(dockerManager.ensureSurrealDBRunning()).rejects.toThrow(/Docker is not installed/)
        })

        test("fast exits bounds if already running loops resolving true natively", async () => {
            // Mock running
            mockSpawnSync.mockImplementation((cmd, args: any[]) => {
                if (args.includes("inspect")) return { stdout: "true" }
                return { stdout: Buffer.from("") }
            })

            await dockerManager.ensureSurrealDBRunning()

            expect(mockLog).toHaveBeenCalledWith("[docker-manager] SurrealDB already running")
        })

        test("runs raw startup natively via compose if detected limit sets map correctly", async () => {
            // Mock stopped status, then true health afterwards
            mockSpawnSync.mockImplementation((cmd, args: any[]) => {
                if (cmd === "docker" && args.includes("--version")) return { stdout: Buffer.from("") } // installed
                if (cmd === "docker" && args.includes("inspect")) return { stdout: "false" } // not running
                if (cmd === "docker" && args.includes("version")) return { stdout: Buffer.from("") } // compose installed
                if (cmd === "docker" && args.includes("compose")) return { stdout: Buffer.from("") } // executing compose up
                return { stdout: Buffer.from("") }
            })
            mockExistsSync.mockReturnValue(true) // pretend compose file exists

            let callCount = 0
            globalFetchSpy.mockImplementation(async () => {
                callCount++
                if (callCount < 2) throw new Error("not up yet limits array var")
                return { ok: true }
            })

            await dockerManager.ensureSurrealDBRunning()

            expect(mockLog).toHaveBeenCalledWith("[docker-manager] Using docker compose")
            expect(globalFetchSpy).toHaveBeenCalledTimes(2)
        })

        test("runs raw startup natively via vanilla container string limit missing compose file mappings", async () => {
            mockSpawnSync.mockImplementation((cmd, args: any[]) => {
                if (cmd === "docker" && args.includes("--version")) return { stdout: Buffer.from("") }
                if (cmd === "docker" && args.includes("inspect")) return { stdout: "false" }
                if (cmd === "docker" && args.includes("version")) throw new Error("no compose")
                return { stdout: Buffer.from("") }
            })
            mockExistsSync.mockReturnValue(false)

            await dockerManager.ensureSurrealDBRunning()

            expect(mockLog).toHaveBeenCalledWith("[docker-manager] Using docker run")
            expect(globalFetchSpy).toHaveBeenCalled()
        })

        test("throws boundary timeout logic parsing nested limit sets missing health loops gracefully", async () => {
            mockSpawnSync.mockImplementation((cmd, args: any[]) => {
                if (cmd === "docker" && args.includes("inspect")) return { stdout: "false" }
                return { stdout: Buffer.from("") }
            })
            // Prevent sleep loops stretching tests limits
            globalFetchSpy.mockImplementation(async () => ({ ok: false }))

            // Fast forward time loops mock wrapper
            const _origSetTimeout = globalThis.setTimeout;
            spyOn(globalThis, "setTimeout").mockImplementation((cb: any, ms: any) => cb() as any);

            await expect(dockerManager.ensureSurrealDBRunning()).rejects.toThrow(/did not become healthy/)

            globalThis.setTimeout = _origSetTimeout;
        })
    })

    describe("stopSurrealDB", () => {
        test("returns early strings parsing limits uninstalled", async () => {
            mockSpawnSync.mockImplementationOnce(() => { throw new Error("no docker") })
            await dockerManager.stopSurrealDB()
            expect(mockLog).not.toHaveBeenCalled()
        })

        test("stops container raw docker mappings natively missing compose file limit bound map", async () => {
            // Mock docker installed but no compose
            mockSpawnSync.mockImplementation((cmd, args: any[]) => {
                if (args.includes("--version")) return { stdout: Buffer.from("") }
                if (args.includes("version")) throw new Error("no compose map loop checks bounds param limits")
                return { stdout: Buffer.from("") }
            })

            await dockerManager.stopSurrealDB()
            expect(mockSpawnSync).toHaveBeenCalledWith("docker", ["stop", "omo-surrealdb"], expect.anything())
            expect(mockSpawnSync).toHaveBeenCalledWith("docker", ["rm", "omo-surrealdb"], expect.anything())
        })

        test("stops bounding target maps invoking compose down loops naturally", async () => {
            mockSpawnSync.mockImplementation((cmd, args: any[]) => {
                if (args.includes("--version")) return { stdout: Buffer.from("") }
                if (args.includes("version")) return { stdout: Buffer.from("") }
                return { stdout: Buffer.from("") }
            })
            mockExistsSync.mockReturnValue(true)

            await dockerManager.stopSurrealDB()
            expect(mockSpawnSync).toHaveBeenCalledWith("docker", ["compose", "-f", expect.any(String), "down"], expect.anything())
        })
    })

    describe("resetSurrealDB", () => {
        test("triggers map wipe limits bounding stop execution loops strings check strings correctly", async () => {
            mockSpawnSync.mockImplementation((cmd, args: any[]) => {
                if (args.includes("--version")) return { stdout: Buffer.from("") }
                if (args.includes("inspect")) return { stdout: "true" } // ensure we pass immediately on start
                return { stdout: Buffer.from("") }
            })
            mockExecSync.mockImplementationOnce(() => Buffer.from(""))

            await dockerManager.resetSurrealDB()

            expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining("rm -rf"), expect.anything())
            expect(mockLog).toHaveBeenCalledWith("[docker-manager] omo-memory data cleared")
        })

        test("warns if data clear throws mapped limit string bounds graceful error loop", async () => {
            mockSpawnSync.mockImplementation((cmd, args: any[]) => {
                if (args.includes("--version")) return { stdout: Buffer.from("") }
                if (args.includes("inspect")) return { stdout: "true" }
                return { stdout: Buffer.from("") }
            })
            mockExecSync.mockImplementationOnce(() => { throw new Error("EACCES param limits var strings loop") })

            await dockerManager.resetSurrealDB()

            expect(mockLog).toHaveBeenCalledWith("[docker-manager] Could not clear omo-memory data")
        })
    })
})
