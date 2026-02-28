import { describe, test, expect, mock, spyOn, afterEach, beforeEach } from "bun:test"

import * as cp from "child_process"
let mockStdout = "/usr/bin/tmux\n"

mock.module("child_process", () => {
    return {
        spawn: mock((cmd, args) => {
            return {
                on: mock((event: string, cb: (...args: unknown[]) => void) => {
                    if (event === "close") {
                        if (args && args.includes("-V")) {
                            cb(0) // verify returns 0
                        } else {
                            cb(0) // main returns 0
                        }
                    }
                }),
                stdout: {
                    on: mock((event, cb) => {
                        if (event === "data") {
                            cb(Buffer.from(mockStdout))
                        }
                    })
                }
            }
        }),
    }
})

import * as utils from "./utils"

describe("interactive-bash/utils", () => {
    beforeEach(() => {
        utils.__resetCache()
    })

    afterEach(() => {
        mock.restore()
        mockStdout = "/usr/bin/tmux\n"
        utils.__resetCache()
    })

    describe("getTmuxPath", () => {
        test("returns path if tmux is found", async () => {
            const mockSpawn = mock((cmd, args) => {
                return {
                    on: mock((event: string, cb: (...args: unknown[]) => void) => {
                        if (event === "close") {
                            cb(0)
                        }
                    }),
                    stdout: {
                        on: mock((event, cb) => {
                            if (event === "data") {
                                cb(Buffer.from("/usr/bin/tmux\n"))
                            }
                        })
                    }
                }
            })
            spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawn as never)

            const path = await utils.getTmuxPath()
            expect(path).toBe("/usr/bin/tmux")
            expect(utils.getCachedTmuxPath()).toBe("/usr/bin/tmux")
        })

        test("returns null if path resolution errors/exits non-zero", async () => {
            const mockSpawnError = mock((cmd, args) => {
                return {
                    on: mock((event: string, cb: (...args: unknown[]) => void) => {
                        if (event === "close") {
                            cb(1) // fail
                        }
                    }),
                    stdout: {
                        on: mock()
                    }
                }
            })
            spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawnError as never)

            const path = await utils.getTmuxPath()
            expect(path).toBeNull()
        })

        test("returns null if path verify exits non-zero", async () => {
            const mockSpawnVerifyFail = mock((cmd, args) => {
                return {
                    on: mock((event: string, cb: (...args: unknown[]) => void) => {
                        if (event === "close") {
                            if (args?.includes("-V")) {
                                cb(1) // fail on verify step
                            } else {
                                cb(0) // pass on main lookup step
                            }
                        }
                    }),
                    stdout: {
                        on: mock((event, cb) => {
                            if (event === "data") {
                                cb(Buffer.from("/usr/bin/tmux\n"))
                            }
                        })
                    }
                }
            })
            spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawnVerifyFail as never)

            const path = await utils.getTmuxPath()
            expect(path).toBeNull()
        })

        test("returns null if initial stdout doesn't match string", async () => {
            const mockSpawnVerifyFail = mock((cmd, args) => {
                return {
                    on: mock((event: string, cb: (...args: unknown[]) => void) => {
                        if (event === "close") {
                            cb(0)
                        }
                    }),
                    stdout: {
                        on: mock((event, cb) => {
                            if (event === "data") {
                                cb(Buffer.from("\n")) // empty stdout
                            }
                        })
                    }
                }
            })
            spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawnVerifyFail as never)

            const path = await utils.getTmuxPath()
            expect(path).toBeNull()
        })

        test("caches the resulting promise on continuous calls", async () => {
            let spawnCalls = 0
            const mockSpawn = mock((cmd, args) => {
                spawnCalls++
                return {
                    on: mock((event: string, cb: (...args: unknown[]) => void) => {
                        if (event === "close") {
                            cb(0)
                        }
                    }),
                    stdout: {
                        on: mock((event, cb) => {
                            if (event === "data") {
                                cb(Buffer.from("/usr/bin/tmux\n"))
                            }
                        })
                    }
                }
            })
            spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawn as never)

            const promise1 = utils.getTmuxPath()
            const promise2 = utils.getTmuxPath()
            const [path1, path2] = await Promise.all([promise1, promise2])
            expect(path1).toBe("/usr/bin/tmux")
            expect(path2).toBe("/usr/bin/tmux")
            expect(spawnCalls).toBe(2) // 1 lookup + 1 verify
        })
    })

    describe("startBackgroundCheck", () => {
        test("initializes the cache via background promise", async () => {
            const mockSpawn = mock((cmd, args) => {
                return {
                    on: mock((event: string, cb: (...args: unknown[]) => void) => {
                        if (event === "close") {
                            cb(0)
                        }
                    }),
                    stdout: {
                        on: mock((event, cb) => {
                            if (event === "data") {
                                cb(Buffer.from("/usr/bin/tmux\n"))
                            }
                        })
                    }
                }
            })
            spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawn as never)

            utils.startBackgroundCheck()
            const path = await utils.getTmuxPath()
            expect(path).toBe("/usr/bin/tmux")
        })

        test("returns null when spawn execution throws synchronously", async () => {
            const mockSpawn = mock((cmd, args) => {
                throw new Error("Crash")
            })
            spyOn(await import("child_process"), "spawn").mockImplementation(mockSpawn as never)

            const path = await utils.getTmuxPath()
            expect(path).toBeNull()
        })
    })
})
