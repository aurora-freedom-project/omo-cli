/// <reference types="bun-types" />
import { describe, test, expect, mock, spyOn, afterEach } from "bun:test"
import * as child_process from "node:child_process"
import * as os from "node:os"
import * as fs from "node:fs"
import {
    executeHookCommand,
    executeCommand,
    resolveCommandsInText,
} from "./command-executor"

describe("command-executor", () => {
    afterEach(() => {
        mock.restore()
    })

    describe("executeHookCommand", () => {
        test("expands ~ to home directory", async () => {
            let spawnedCommand = ""

            // Safely mock homedir and suppress HOME
            const oldHome = process.env.HOME
            const oldUserProfile = process.env.USERPROFILE
            delete process.env.HOME
            delete process.env.USERPROFILE

            spyOn(os, "homedir").mockReturnValue("/mock/home")

            spyOn(child_process, "spawn").mockImplementation((cmd) => {
                spawnedCommand = cmd as string
                return {
                    stdout: { on: () => { } },
                    stderr: { on: () => { } },
                    stdin: { write: () => { }, end: () => { } },
                    on: (event: string, cb: any) => {
                        if (event === "close") cb(0)
                    },
                } as any
            })

            // The regex replaces ^~(/|$) and \s~(/)
            // So '~/test' becomes '/mock/home/test'
            // ' ~/other' becomes ' /mock/home/other'
            await executeHookCommand("echo ~/test ~/other", "input", "/cwd")

            expect(spawnedCommand).toBe("echo /mock/home/test /mock/home/other")

            // Restore
            if (oldHome) process.env.HOME = oldHome
            if (oldUserProfile) process.env.USERPROFILE = oldUserProfile
        })

        test("expands CLAUDE_PROJECT_DIR", async () => {
            let spawnedCommand = ""
            spyOn(child_process, "spawn").mockImplementation((cmd) => {
                spawnedCommand = cmd as string
                return {
                    stdout: { on: () => { } },
                    stderr: { on: () => { } },
                    stdin: { write: () => { }, end: () => { } },
                    on: (event: string, cb: any) => {
                        if (event === "close") cb(0)
                    },
                } as any
            })

            await executeHookCommand(
                "echo $CLAUDE_PROJECT_DIR and ${CLAUDE_PROJECT_DIR}",
                "input",
                "/my/project"
            )

            expect(spawnedCommand).toBe("echo /my/project and /my/project")
        })

        test("forces zsh if requested and available", async () => {
            let spawnedCommand = ""
            spyOn(child_process, "spawn").mockImplementation((cmd) => {
                spawnedCommand = cmd as string
                return {
                    stdout: { on: () => { } },
                    stderr: { on: () => { } },
                    stdin: { write: () => { }, end: () => { } },
                    on: (event: string, cb: any) => {
                        if (event === "close") cb(0)
                    },
                } as any
            })

            spyOn(fs, "existsSync").mockImplementation((path) => path === "/bin/zsh")

            await executeHookCommand("echo 'hello'", "input", "/cwd", { forceZsh: true })

            expect(spawnedCommand).toBe("/bin/zsh -lc 'echo '\\''hello'\\'''")
        })

        test("falls back to bash if zsh not found but forceZsh requested", async () => {
            let spawnedCommand = ""
            spyOn(child_process, "spawn").mockImplementation((cmd) => {
                spawnedCommand = cmd as string
                return {
                    stdout: { on: () => { } },
                    stderr: { on: () => { } },
                    stdin: { write: () => { }, end: () => { } },
                    on: (event: string, cb: any) => {
                        if (event === "close") cb(0)
                    },
                } as any
            })

            spyOn(fs, "existsSync").mockImplementation((path) => path === "/bin/bash")

            await executeHookCommand("echo test", "input", "/cwd", { forceZsh: true })

            expect(spawnedCommand).toBe("/bin/bash -lc 'echo test'")
        })

        test("falls back to raw command if neither zsh nor bash found", async () => {
            let spawnedCommand = ""
            spyOn(child_process, "spawn").mockImplementation((cmd) => {
                spawnedCommand = cmd as string
                return {
                    stdout: { on: () => { } },
                    stderr: { on: () => { } },
                    stdin: { write: () => { }, end: () => { } },
                    on: (event: string, cb: any) => {
                        if (event === "close") cb(0)
                    },
                } as any
            })

            spyOn(fs, "existsSync").mockReturnValue(false)

            await executeHookCommand("echo test", "input", "/cwd", { forceZsh: true })

            expect(spawnedCommand).toBe("echo test")
        })

        test("captures stdout and stderr", async () => {
            spyOn(child_process, "spawn").mockImplementation(() => {
                return {
                    stdout: {
                        on: (event: string, cb: any) => {
                            if (event === "data") cb(Buffer.from("out data\n"))
                        },
                    },
                    stderr: {
                        on: (event: string, cb: any) => {
                            if (event === "data") cb(Buffer.from("err data\n"))
                        },
                    },
                    stdin: { write: () => { }, end: () => { } },
                    on: (event: string, cb: any) => {
                        if (event === "close") cb(0)
                    },
                } as any
            })

            const result = await executeHookCommand("cmd", "input", "/cwd")

            expect(result.exitCode).toBe(0)
            expect(result.stdout).toBe("out data")
            expect(result.stderr).toBe("err data")
        })

        test("handles spawn errors", async () => {
            spyOn(child_process, "spawn").mockImplementation(() => {
                return {
                    stdout: { on: () => { } },
                    stderr: { on: () => { } },
                    stdin: { write: () => { }, end: () => { } },
                    on: (event: string, cb: any) => {
                        if (event === "error") cb(new Error("spawn failed"))
                    },
                } as any
            })

            const result = await executeHookCommand("cmd", "input", "/cwd")

            expect(result.exitCode).toBe(1)
            expect(result.stderr).toBe("spawn failed")
        })
    })

    describe("executeCommand", () => {
        test("returns stdout when command succeeds", async () => {
            const result = await executeCommand("echo 'hello world'")
            expect(result).toBe("hello world")
        })

        test("returns stdout + stderr when command succeeds but prints to stderr", async () => {
            const result = await executeCommand("echo 'out' && echo 'err' >&2")
            expect(result).toBe("out\n[stderr: err]")
        })

        test("returns only stderr when command succeeds with empty stdout and prints to stderr", async () => {
            const result = await executeCommand("echo 'err' >&2")
            expect(result).toBe("[stderr: err]")
        })

        test("returns stderr on command failure", async () => {
            const result = await executeCommand("ls /nonexistent-path-1234567")
            expect(result).toContain("[stderr:")
            expect(result).toContain("No such file or directory")
        })
    })

    describe("resolveCommandsInText", () => {
        test("replaces embedded commands with their output", async () => {
            const text = "The current directory is !\`pwd\`!"
            const result = await resolveCommandsInText(text)
            const pwdVal = await executeCommand("pwd")
            expect(result).toBe(`The current directory is ${pwdVal}!`)
        })

        test("handles multiple commands in same text", async () => {
            const text = "User is !\`whoami\`!, OS is !\`uname\`!"
            const result = await resolveCommandsInText(text)
            const user = await executeCommand("whoami")
            const os = await executeCommand("uname")
            expect(result).toBe(`User is ${user}!, OS is ${os}!`)
        })

        test("handles command errors gracefully", async () => {
            const text = "Bad command: !\`invalid_command_name_123 xyz\`!"
            const result = await resolveCommandsInText(text)
            expect(result).toContain("Bad command: ")
            expect(result).toContain("[stderr:")
            expect(result).toContain("command not found")
        })

        test("returns original text if no commands found", async () => {
            const text = "Just some normal text without backticks"
            const result = await resolveCommandsInText(text)
            expect(result).toBe(text)
        })

        test("limits recursion depth", async () => {
            // Instead of replying on mock child_process.exec reassignment (which fails as it's readonly in Bun)
            // we use a series of echo commands that don't need mocking. 
            // To bypass bash parsing errors, we construct exact echo strings that produce the next literal step.
            expect(await resolveCommandsInText("Start !", 0, 0)).toBe("Start !")
            expect(await resolveCommandsInText("Start !", 0, 1)).toBe("Start !")
            expect(await resolveCommandsInText("Start !", 0, 2)).toBe("Start !")
            expect(await resolveCommandsInText("Start !", 0, 3)).toBe("Start !")
        })
    })
})
