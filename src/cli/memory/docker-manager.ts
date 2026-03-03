import { log } from "../../shared/logger"
import { execSync, spawnSync } from "child_process"
import { join } from "path"
import { homedir } from "os"
import { existsSync } from "fs"
import { Effect } from "effect"
import type { MemoryConfig } from "../../config/schema"

export type SurrealDBStatus = "running" | "stopped" | "not_installed"

const DEFAULT_MANAGED_PORT = 18000
const CONTAINER_NAME = "omo-surrealdb"

export interface DiscoveredSurrealDB {
    source: "docker-container" | "network-service"
    url: string            // e.g. "http://localhost:8000"
    port: number
    containerName?: string // if discovered via Docker
    containerId?: string
}

/**
 * Try to locate docker-compose.yml.
 * When running from source it lives at repo root; when installed via npm
 * the __dirname path won't resolve, so we fall back to `docker run`.
 */
function findComposeFile(): string | null {
    const candidates = [
        join(__dirname, "../../../docker-compose.yml"),   // dev / bun link
        join(process.cwd(), "docker-compose.yml"),       // user's project root
    ]
    for (const p of candidates) {
        if (existsSync(p)) return p
    }
    return null
}

function isDockerInstalled(): boolean {
    return Effect.runSync(
        Effect.try({
            try: () => { spawnSync("docker", ["--version"], { stdio: "ignore" }); return true },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
    )
}

function isDockerComposeInstalled(): boolean {
    return Effect.runSync(
        Effect.try({
            try: () => { spawnSync("docker", ["compose", "version"], { stdio: "ignore" }); return true },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
    )
}

function isContainerRunning(containerName = CONTAINER_NAME): boolean {
    return Effect.runSync(
        Effect.try({
            try: () => {
                const result = spawnSync(
                    "docker",
                    ["inspect", "--format", "{{.State.Running}}", containerName],
                    { encoding: "utf8" }
                )
                return result.stdout?.trim() === "true"
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
    )
}

function doesContainerExist(containerName = CONTAINER_NAME): boolean {
    return Effect.runSync(
        Effect.try({
            try: () => {
                const result = spawnSync(
                    "docker",
                    ["inspect", "--format", "{{.Id}}", containerName],
                    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
                )
                return result.status === 0 && (result.stdout?.trim().length ?? 0) > 0
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
    )
}

export async function isSurrealDBHealthy(port = DEFAULT_MANAGED_PORT): Promise<boolean> {
    return Effect.runPromise(
        Effect.tryPromise({
            try: async () => {
                const healthUrl = `http://127.0.0.1:${port}/health`
                const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) })
                return res.ok
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
    )
}

export async function getSurrealDBStatus(config?: MemoryConfig): Promise<SurrealDBStatus> {
    // External mode: check health endpoint directly, skip Docker checks
    if (config?.mode === "external") {
        const port = config.port ?? DEFAULT_MANAGED_PORT
        const healthy = await isSurrealDBHealthy(port)
        return healthy ? "running" : "stopped"
    }

    if (!isDockerInstalled()) return "not_installed"
    if (!isContainerRunning()) return "stopped"
    const port = config?.port ?? DEFAULT_MANAGED_PORT
    const healthy = await isSurrealDBHealthy(port)
    return healthy ? "running" : "stopped"
}

/**
 * Detect existing SurrealDB services.
 * 1. Scan Docker containers with surrealdb image
 * 2. Probe common ports (8000, 18000) for /health endpoint
 */
export async function detectExistingSurrealDB(): Promise<DiscoveredSurrealDB[]> {
    const discovered: DiscoveredSurrealDB[] = []

    // 1. Check Docker containers with surrealdb image
    if (isDockerInstalled()) {
        Effect.runSync(
            Effect.try({
                try: () => {
                    const result = spawnSync(
                        "docker",
                        ["ps", "--filter", "ancestor=surrealdb/surrealdb", "--format", "{{.ID}}\t{{.Names}}\t{{.Ports}}"],
                        { encoding: "utf8" }
                    )
                    const lines = (result.stdout ?? "").trim().split("\n").filter(Boolean)
                    for (const line of lines) {
                        const [containerId, containerName, ports] = line.split("\t")
                        if (!containerId || !containerName) continue
                        if (containerName === CONTAINER_NAME) continue
                        const portMatch = ports?.match(/0\.0\.0\.0:(\d+)->/)
                        const port = portMatch ? parseInt(portMatch[1], 10) : 8000
                        discovered.push({
                            source: "docker-container",
                            url: `http://127.0.0.1:${port}`,
                            port,
                            containerName,
                            containerId,
                        })
                    }
                },
                catch: () => "fail" as const,
            }).pipe(Effect.catchAll(() => {
                log("[docker-manager] Failed to scan Docker containers for SurrealDB")
                return Effect.void
            }))
        )
    }

    // 2. Probe common ports via /health
    const probePorts = [8000, 18000]
    const alreadyFoundPorts = new Set(discovered.map(d => d.port))

    for (const port of probePorts) {
        if (alreadyFoundPorts.has(port)) continue
        await Effect.runPromise(
            Effect.tryPromise({
                try: async () => {
                    const res = await fetch(`http://127.0.0.1:${port}/health`, {
                        signal: AbortSignal.timeout(2000),
                    })
                    if (res.ok) {
                        discovered.push({
                            source: "network-service",
                            url: `http://127.0.0.1:${port}`,
                            port,
                        })
                    }
                },
                catch: () => "fail" as const,
            }).pipe(Effect.catchAll(() => Effect.void))
        )
    }

    log("[docker-manager] SurrealDB detection results", { count: discovered.length, discovered })
    return discovered
}

export async function ensureSurrealDBRunning(config?: MemoryConfig): Promise<void> {
    // External mode: just verify connection, don't manage Docker
    if (config?.mode === "external") {
        log("[docker-manager] External mode — skipping Docker management")
        return
    }

    const status = await getSurrealDBStatus(config)
    const port = config?.port ?? DEFAULT_MANAGED_PORT

    if (status === "not_installed") {
        throw new Error(
            "Docker is not installed. Install Docker Desktop to use omo-memory: https://docs.docker.com/get-docker/"
        )
    }

    if (status === "running") {
        log("[docker-manager] SurrealDB already running")
        return
    }

    // Status is "stopped" — check if container exists but is stopped (e.g. after reboot)
    const containerExists = doesContainerExist(CONTAINER_NAME)

    if (containerExists) {
        // Container exists but stopped → restart it (preserves all data)
        log("[docker-manager] Restarting existing stopped container...")
        const startResult = spawnSync("docker", ["start", CONTAINER_NAME], {
            encoding: "utf-8",
            timeout: 10000,
        })

        if (startResult.status !== 0) {
            log("[docker-manager] docker start failed, removing and recreating", {
                stderr: startResult.stderr,
            })
            // Remove broken container and fall through to create new one
            spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" })
        } else {
            // Wait for health after restart
            for (let i = 0; i < 15; i++) {
                await new Promise((resolve) => setTimeout(resolve, 1000))
                if (await isSurrealDBHealthy(port)) {
                    log("[docker-manager] SurrealDB restarted successfully")
                    return
                }
            }
            throw new Error(
                "SurrealDB restarted but did not become healthy within 15s. Check: docker logs omo-surrealdb"
            )
        }
    }

    // No existing container → create new one
    log("[docker-manager] Creating new SurrealDB container...")

    const composeFile = isDockerComposeInstalled() ? findComposeFile() : null

    if (composeFile) {
        log("[docker-manager] Using docker compose")
        spawnSync(
            "docker",
            ["compose", "-f", composeFile, "up", "-d"],
            { stdio: "inherit" }
        )
    } else {
        // Primary path: docker run (always works, no compose file needed)
        log("[docker-manager] Using docker run")
        const pass = config?.pass ?? "omo-secret"
        const user = config?.user ?? "root"
        spawnSync(
            "docker",
            [
                "run", "-d",
                "--name", CONTAINER_NAME,
                "-p", `${port}:8000`,
                "-v", `${homedir()}/.config/opencode/omo-memory:/data`,
                "--restart", "unless-stopped",
                "surrealdb/surrealdb:latest",
                "start", "--user", user, "--pass", pass,
                "rocksdb:/data/omo.db",
            ],
            { stdio: "inherit" }
        )
    }

    // Wait up to 15s for health
    for (let i = 0; i < 15; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        if (await isSurrealDBHealthy(port)) {
            log("[docker-manager] SurrealDB started successfully")
            return
        }
    }

    throw new Error(
        "SurrealDB started but did not become healthy within 15s. Check: docker logs omo-surrealdb"
    )
}

export async function stopSurrealDB(): Promise<void> {
    if (!isDockerInstalled()) return
    log("[docker-manager] Stopping SurrealDB...")

    const composeFile = isDockerComposeInstalled() ? findComposeFile() : null

    if (composeFile) {
        spawnSync("docker", ["compose", "-f", composeFile, "down"], {
            stdio: "inherit",
        })
    } else {
        spawnSync("docker", ["stop", CONTAINER_NAME], { stdio: "inherit" })
        spawnSync("docker", ["rm", CONTAINER_NAME], { stdio: "inherit" })
    }

    log("[docker-manager] SurrealDB stopped")
}

export async function resetSurrealDB(): Promise<void> {
    await stopSurrealDB()

    // Remove persisted data
    Effect.runSync(
        Effect.try({
            try: () => {
                execSync(`rm -rf ${homedir()}/.config/opencode/omo-memory`, {
                    stdio: "ignore",
                })
                log("[docker-manager] omo-memory data cleared")
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => {
            log("[docker-manager] Could not clear omo-memory data")
            return Effect.void
        }))
    )

    await ensureSurrealDBRunning()
}
