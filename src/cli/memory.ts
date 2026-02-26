import { Command } from "commander"
import { intro, outro, spinner, confirm, log, isCancel } from "@clack/prompts"
import {
    ensureSurrealDBRunning,
    stopSurrealDB,
    getSurrealDBStatus,
    resetSurrealDB,
    isSurrealDBHealthy,
} from "./memory/docker-manager"
import { isConnected } from "./memory/surreal-client"

export function createMemoryCommand(): Command {
    const memory = new Command("memory")
        .description("Manage omo-memory (SurrealDB persistent agent memory)")
        .addHelpText(
            "after",
            `
Examples:
  $ omo-cli memory start    # Start SurrealDB Docker container
  $ omo-cli memory stop     # Stop SurrealDB
  $ omo-cli memory status   # Check connection status
  $ omo-cli memory reset    # Wipe all memories and restart

Requirements: Docker Desktop must be installed and running.
Data stored at: ~/.config/opencode/omo-memory/omo.db
`
        )

    memory
        .command("start")
        .description("Start SurrealDB memory container")
        .action(async () => {
            intro("🧠 omo-memory start")
            const s = spinner()
            s.start("Starting SurrealDB...")
            try {
                await ensureSurrealDBRunning()
                s.stop("SurrealDB started ✓")
                outro("Memory is now available at http://localhost:18000 (RPC: /rpc, Health: /health)")
                process.exit(0)
            } catch (err) {
                s.stop("Failed")
                log.error(String(err))
                outro("Failed to start memory")
                process.exit(1)
            }
        })

    memory
        .command("stop")
        .description("Stop SurrealDB memory container")
        .action(async () => {
            intro("🧠 omo-memory stop")
            const s = spinner()
            s.start("Stopping SurrealDB...")
            try {
                await stopSurrealDB()
                s.stop("SurrealDB stopped ✓")
                outro("Done")
                process.exit(0)
            } catch (err) {
                s.stop("Failed")
                log.error(String(err))
                process.exit(1)
            }
        })

    memory
        .command("status")
        .description("Check SurrealDB memory connection status")
        .action(async () => {
            intro("🧠 omo-memory status")
            try {
                const dockerStatus = await getSurrealDBStatus()
                const httpOk = await isSurrealDBHealthy()
                const rpcOk = httpOk ? await isConnected() : false

                log.info(`Docker container: ${dockerStatus}`)
                log.info(`HTTP health: ${httpOk ? "✓ ok" : "✗ unreachable"}`)
                log.info(`RPC connection: ${rpcOk ? "✓ connected" : "✗ not connected"}`)

                if (dockerStatus === "not_installed") {
                    log.warn("Docker is not installed. Install Docker Desktop to use omo-memory.")
                } else if (dockerStatus === "stopped") {
                    log.warn("Container is stopped. Run: omo-cli memory start")
                } else if (!rpcOk) {
                    log.warn("Container running but RPC not responding. Try: omo-cli memory reset")
                } else {
                    log.success("omo-memory is healthy and ready")
                }

                outro("Done")
                process.exit(0)
            } catch (err) {
                log.error(String(err))
                process.exit(1)
            }
        })

    memory
        .command("reset")
        .description("Stop container, wipe all memories, and restart fresh")
        .option("--yes", "Skip confirmation prompt")
        .action(async (options) => {
            intro("🧠 omo-memory reset")

            if (!options.yes) {
                const confirmed = await confirm({
                    message: "⚠️  This will delete ALL stored memories. Continue?",
                    initialValue: false,
                })

                if (isCancel(confirmed) || !confirmed) {
                    outro("Cancelled")
                    process.exit(0)
                }
            }

            const s = spinner()
            s.start("Resetting memory database...")
            try {
                await resetSurrealDB()
                s.stop("Memory reset complete ✓")
                outro("Fresh start. All memories cleared.")
                process.exit(0)
            } catch (err) {
                s.stop("Failed")
                log.error(String(err))
                process.exit(1)
            }
        })

    return memory
}
