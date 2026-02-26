import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test"

const mockSpinner = { start: mock(), stop: mock() }
const mockClack = {
    intro: mock(),
    outro: mock(),
    spinner: mock().mockReturnValue(mockSpinner),
    confirm: mock(),
    isCancel: mock(),
    log: {
        info: mock(),
        warn: mock(),
        success: mock(),
        error: mock(),
    },
}
mock.module("@clack/prompts", () => mockClack)

const mockDocker = {
    ensureSurrealDBRunning: mock(),
    stopSurrealDB: mock(),
    getSurrealDBStatus: mock(),
    resetSurrealDB: mock(),
    isSurrealDBHealthy: mock(),
}
mock.module("./memory/docker-manager", () => mockDocker)

const mockSurreal = {
    isConnected: mock()
}
mock.module("./memory/surreal-client", () => mockSurreal)

import { createMemoryCommand } from "./memory"
import { Command } from "commander"

describe("cli/memory", () => {
    let exitSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
        // Reset all mock functions state
        Object.values(mockClack).forEach((m) => typeof m === "function" ? m.mockClear() : null)
        Object.values(mockClack.log).forEach((m) => m.mockClear())
        Object.values(mockDocker).forEach((m) => m.mockClear())
        Object.values(mockSurreal).forEach((m) => m.mockClear())
        mockSpinner.start.mockClear()
        mockSpinner.stop.mockClear()

        // Prevent tests from killing the bun runner
        exitSpy = spyOn(process, "exit").mockImplementation((code?: number) => {
            throw new Error(`EXIT_${code ?? 0}`)
        })

        // Silence commander's internal output to prevent messy test logs
        spyOn(console, "error").mockImplementation(() => { })
    })

    afterEach(() => {
        mock.restore()
    })

    async function runCmd(cmd: Command, args: string[]) {
        try {
            await cmd.parseAsync(["node", "test", ...args])
        } catch (e: any) {
            if (!e.message.startsWith("EXIT_") && e.code !== "commander.helpDisplayed" && e.code !== "commander.help") {
                throw e
            }
        }
    }

    describe("start", () => {
        test("starts DB successfully", async () => {
            mockDocker.ensureSurrealDBRunning.mockResolvedValue(undefined)
            const root = new Command().addCommand(createMemoryCommand())

            await runCmd(root, ["memory", "start"])

            expect(mockDocker.ensureSurrealDBRunning).toHaveBeenCalled()
            expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining("started"))
            expect(exitSpy).toHaveBeenCalledWith(0)
        })

        test("handles start failure", async () => {
            mockDocker.ensureSurrealDBRunning.mockRejectedValue(new Error("Start failed"))
            const root = new Command().addCommand(createMemoryCommand())

            await runCmd(root, ["memory", "start"])

            expect(mockSpinner.stop).toHaveBeenCalledWith("Failed")
            expect(mockClack.log.error).toHaveBeenCalledWith(expect.stringContaining("Start failed"))
            expect(exitSpy).toHaveBeenCalledWith(1)
        })
    })

    describe("stop", () => {
        test("stops DB successfully", async () => {
            mockDocker.stopSurrealDB.mockResolvedValue(undefined)
            const root = new Command().addCommand(createMemoryCommand())

            await runCmd(root, ["memory", "stop"])

            expect(mockDocker.stopSurrealDB).toHaveBeenCalled()
            expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining("stopped"))
            expect(exitSpy).toHaveBeenCalledWith(0)
        })

        test("handles stop failure", async () => {
            mockDocker.stopSurrealDB.mockRejectedValue(new Error("Stop failed"))
            const root = new Command().addCommand(createMemoryCommand())

            await runCmd(root, ["memory", "stop"])

            expect(mockSpinner.stop).toHaveBeenCalledWith("Failed")
            expect(mockClack.log.error).toHaveBeenCalledWith(expect.stringContaining("Stop failed"))
            expect(exitSpy).toHaveBeenCalledWith(1)
        })
    })

    describe("status", () => {
        test("handles healthy configuration", async () => {
            mockDocker.getSurrealDBStatus.mockResolvedValue("running")
            mockDocker.isSurrealDBHealthy.mockResolvedValue(true)
            mockSurreal.isConnected.mockResolvedValue(true)

            const root = new Command().addCommand(createMemoryCommand())
            await runCmd(root, ["memory", "status"])

            expect(mockClack.log.success).toHaveBeenCalledWith(expect.stringContaining("healthy and ready"))
            expect(exitSpy).toHaveBeenCalledWith(0)
        })

        test("handles not installed state", async () => {
            mockDocker.getSurrealDBStatus.mockResolvedValue("not_installed")
            mockDocker.isSurrealDBHealthy.mockResolvedValue(false)

            const root = new Command().addCommand(createMemoryCommand())
            await runCmd(root, ["memory", "status"])

            expect(mockClack.log.warn).toHaveBeenCalledWith(expect.stringContaining("not installed"))
            expect(exitSpy).toHaveBeenCalledWith(0)
        })

        test("handles stopped state", async () => {
            mockDocker.getSurrealDBStatus.mockResolvedValue("stopped")
            mockDocker.isSurrealDBHealthy.mockResolvedValue(false)

            const root = new Command().addCommand(createMemoryCommand())
            await runCmd(root, ["memory", "status"])

            expect(mockClack.log.warn).toHaveBeenCalledWith(expect.stringContaining("is stopped. Run:"))
            expect(exitSpy).toHaveBeenCalledWith(0)
        })

        test("handles running but RPC failure state", async () => {
            mockDocker.getSurrealDBStatus.mockResolvedValue("running")
            mockDocker.isSurrealDBHealthy.mockResolvedValue(true)
            mockSurreal.isConnected.mockResolvedValue(false)

            const root = new Command().addCommand(createMemoryCommand())
            await runCmd(root, ["memory", "status"])

            expect(mockClack.log.warn).toHaveBeenCalledWith(expect.stringContaining("RPC not responding"))
            expect(exitSpy).toHaveBeenCalledWith(0)
        })

        test("catches raw errors", async () => {
            mockDocker.getSurrealDBStatus.mockRejectedValue(new Error("Status lookup crash"))

            const root = new Command().addCommand(createMemoryCommand())
            await runCmd(root, ["memory", "status"])

            expect(mockClack.log.error).toHaveBeenCalledWith(expect.stringContaining("Status lookup crash"))
            expect(exitSpy).toHaveBeenCalledWith(1)
        })
    })

    describe("reset", () => {
        test("executes successfully with --yes flag", async () => {
            mockDocker.resetSurrealDB.mockResolvedValue(undefined)

            const root = new Command().addCommand(createMemoryCommand())
            await runCmd(root, ["memory", "reset", "--yes"])

            // Shouldn't ask for confirmation
            expect(mockClack.confirm).not.toHaveBeenCalled()
            expect(mockDocker.resetSurrealDB).toHaveBeenCalled()
            expect(mockSpinner.stop).toHaveBeenCalledWith(expect.stringContaining("complete"))
            expect(exitSpy).toHaveBeenCalledWith(0)
        })

        test("cancels gracefully when user rejects interaction", async () => {
            mockClack.confirm.mockResolvedValue(false)
            mockClack.isCancel.mockReturnValue(false)

            const root = new Command().addCommand(createMemoryCommand())
            await runCmd(root, ["memory", "reset"])

            expect(mockClack.confirm).toHaveBeenCalled()
            expect(mockClack.outro).toHaveBeenCalledWith("Cancelled")
            expect(mockDocker.resetSurrealDB).not.toHaveBeenCalled()
            expect(exitSpy).toHaveBeenCalledWith(0)
        })

        test("cancels gracefully when operation is SIGINT'd entirely", async () => {
            mockClack.confirm.mockResolvedValue(true) // True resolved value, but...
            mockClack.isCancel.mockReturnValue(true) // Marked as physically cancelled via signal

            const root = new Command().addCommand(createMemoryCommand())
            await runCmd(root, ["memory", "reset"])

            expect(mockClack.outro).toHaveBeenCalledWith("Cancelled")
            expect(mockDocker.resetSurrealDB).not.toHaveBeenCalled()
            expect(exitSpy).toHaveBeenCalledWith(0)
        })

        test("executes successfully after confirmation prompt", async () => {
            mockClack.confirm.mockResolvedValue(true)
            mockClack.isCancel.mockReturnValue(false)
            mockDocker.resetSurrealDB.mockResolvedValue(undefined)

            const root = new Command().addCommand(createMemoryCommand())
            await runCmd(root, ["memory", "reset"])

            expect(mockClack.confirm).toHaveBeenCalled()
            expect(mockDocker.resetSurrealDB).toHaveBeenCalled()
            expect(exitSpy).toHaveBeenCalledWith(0)
        })

        test("handles reset failure state", async () => {
            mockClack.confirm.mockResolvedValue(true)
            mockClack.isCancel.mockReturnValue(false)
            mockDocker.resetSurrealDB.mockRejectedValue(new Error("Reset fail"))

            const root = new Command().addCommand(createMemoryCommand())
            await runCmd(root, ["memory", "reset"])

            expect(mockSpinner.stop).toHaveBeenCalledWith("Failed")
            expect(mockClack.log.error).toHaveBeenCalledWith(expect.stringContaining("Reset fail"))
            expect(exitSpy).toHaveBeenCalledWith(1)
        })
    })
})
