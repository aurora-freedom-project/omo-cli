import { describe, test, expect, mock, spyOn, afterEach, beforeEach } from "bun:test"

// Mock child_process and os before we import zip-extractor
import * as cp from "child_process"
import * as os from "os"

// Create a mutable reference for the os release version 
// so we can change it per-test without re-mocking the module.
let currentOsRelease = "10.0.19045"

mock.module("os", () => {
    return {
        release: mock(() => currentOsRelease)
    }
})

mock.module("child_process", () => {
    return {
        spawn: mock(() => {
            return {
                on: mock((event: string, cb: any) => {
                    if (event === "close") cb(0)
                }),
                stderr: {
                    on: mock()
                }
            }
        }),
        spawnSync: mock(() => ({
            status: 0,
            stdout: Buffer.from(""),
            stderr: Buffer.from("")
        }))
    }
})

import { extractZip } from "./zip-extractor"

describe("zip-extractor", () => {
    afterEach(() => {
        mock.restore()
        currentOsRelease = "10.0.19045" // reset to default
    })

    describe("extractZip", () => {
        const originalPlatform = process.platform

        afterEach(() => {
            Object.defineProperty(process, 'platform', { value: originalPlatform })
        })

        test("uses unzip by default on non-win32 platforms", async () => {
            Object.defineProperty(process, 'platform', { value: 'darwin' })

            const mockSpawn = mock().mockReturnValue({
                on: mock((event: string, cb: any) => {
                    if (event === "close") cb(0)
                }),
                stderr: {
                    on: mock()
                }
            })

            spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawn as any)

            await extractZip("test.zip", "/dest")

            expect(mockSpawn).toHaveBeenCalledWith(
                "unzip",
                ["-o", "test.zip", "-d", "/dest"],
                expect.any(Object)
            )
        })

        test("throws an error if extraction fails", async () => {
            Object.defineProperty(process, 'platform', { value: 'darwin' })

            const mockSpawn = mock().mockReturnValue({
                on: mock((event: string, cb: any) => {
                    if (event === "close") cb(1) // Simulate exit code 1
                }),
                stderr: {
                    // Simulate receiving some error text from stderr
                    on: mock((event: string, cb: any) => {
                        if (event === "data") cb(Buffer.from("Mock error chunk"))
                    })
                }
            })

            spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawn as any)

            await expect(extractZip("test.zip", "/dest")).rejects.toThrow("zip extraction failed (exit 1): Mock error chunk")
        })

        describe("Windows extractors", () => {
            beforeEach(() => {
                Object.defineProperty(process, 'platform', { value: 'win32' })
            })

            test("uses tar on windows build >= 17134", async () => {
                currentOsRelease = "10.0.19045"
                const mockSpawnSync = spyOn(await import("child_process"), "spawnSync").mockReturnValue({ status: 1 } as any)

                const mockSpawn = mock().mockReturnValue({
                    on: mock((event: string, cb: any) => {
                        if (event === "close") cb(0)
                    }),
                    stderr: { on: mock() }
                })
                spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawn as any)

                await extractZip("test.zip", "/dest")

                expect(mockSpawn).toHaveBeenCalledWith(
                    "tar",
                    ["-xf", "test.zip", "-C", "/dest"],
                    expect.any(Object)
                )
            })

            test("uses pwsh if available and tar is not", async () => {
                currentOsRelease = "10.0.15000"
                const mockSpawnSync = spyOn(await import("child_process"), "spawnSync").mockReturnValue({ status: 0 } as any)

                const mockSpawn = mock().mockReturnValue({
                    on: mock((event: string, cb: any) => {
                        if (event === "close") cb(0)
                    }),
                    stderr: { on: mock() }
                })
                spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawn as any)

                await extractZip("test'path.zip", "/dest")

                expect(mockSpawn).toHaveBeenCalledWith(
                    "pwsh",
                    ["-Command", "Expand-Archive -Path 'test''path.zip' -DestinationPath '/dest' -Force"],
                    expect.any(Object)
                )
            })

            test("falls back to powershell if tar and pwsh are unavailable", async () => {
                currentOsRelease = "10.0.15000"
                const mockSpawnSync = spyOn(await import("child_process"), "spawnSync").mockReturnValue({ status: 1 } as any)

                const mockSpawn = mock().mockReturnValue({
                    on: mock((event: string, cb: any) => {
                        if (event === "close") cb(0)
                    }),
                    stderr: { on: mock() }
                })
                spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawn as any)

                await extractZip("test.zip", "/dest")

                expect(mockSpawn).toHaveBeenCalledWith(
                    "powershell",
                    ["-Command", "Expand-Archive -Path 'test.zip' -DestinationPath '/dest' -Force"],
                    expect.any(Object)
                )
            })

            test("handles missing windows build number (NaN behavior)", async () => {
                currentOsRelease = "10.0.invalid"
                const mockSpawnSync = spyOn(await import("child_process"), "spawnSync").mockReturnValue({ status: 1 } as any)

                const mockSpawn = mock().mockReturnValue({
                    on: mock((event: string, cb: any) => {
                        if (event === "close") cb(0)
                    }),
                    stderr: { on: mock() }
                })
                spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawn as any)

                await extractZip("test.zip", "/dest")

                expect(mockSpawn.mock.calls[0][0]).toBe("powershell")
            })

            test("handles release string with too few parts", async () => {
                currentOsRelease = "10.0"
                const mockSpawnSync = spyOn(await import("child_process"), "spawnSync").mockReturnValue({ status: 1 } as any)

                const mockSpawn = mock().mockReturnValue({
                    on: mock((event: string, cb: any) => {
                        if (event === "close") cb(0)
                    }),
                    stderr: { on: mock() }
                })
                spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawn as any)

                await extractZip("test.zip", "/dest")

                expect(mockSpawn.mock.calls[0][0]).toBe("powershell")
            })

            test("handles process error event explicitly", async () => {
                currentOsRelease = "10.0"
                const mockSpawnSync = spyOn(await import("child_process"), "spawnSync").mockReturnValue({ status: 1 } as any)

                const mockSpawn = mock().mockReturnValue({
                    on: mock((event: string, cb: any) => {
                        if (event === "error") cb(new Error("binary missing"))
                    }),
                    stderr: { on: mock() }
                })
                spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawn as any)

                await expect(extractZip("test.zip", "/dest")).rejects.toThrow("zip extraction child process error: binary missing")
            })
        })
    })
})
