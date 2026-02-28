/// <reference types="bun-types" />
import { describe, expect, test, mock, beforeEach, spyOn, afterEach } from "bun:test"
import { startAutoInit, getLastAutoIndexResult, isAutoInitRunning } from "./auto-init"
import * as dockerManager from "../../cli/memory/docker-manager"
import * as surrealClient from "../../cli/memory/surreal-client"
import * as indexer from "./indexer"
import * as childProcess from "child_process"
import type { MemoryConfig } from "../../config/schema"

describe("auto-init", () => {
    let mockConfig: MemoryConfig

    beforeEach(() => {
        mockConfig = {
            enabled: true,
            mode: "managed",
            port: 18000,
            auto_capture: true,
            user: "root",
            namespace: "omo",
            database: "memory"
        }

        // Reset state by mocking internals or bypassing if possible
        // There's no exported reset, but we can trust the test isolation
        // We'll mock the dependencies
        spyOn(dockerManager, "ensureSurrealDBRunning").mockResolvedValue()
        spyOn(surrealClient, "configureSurreal").mockImplementation(() => { })
        spyOn(surrealClient, "isConnected").mockResolvedValue(true)
        spyOn(surrealClient, "initSchema").mockResolvedValue()
        spyOn(surrealClient, "getIndexedFiles").mockResolvedValue([])
        spyOn(indexer, "indexProject").mockResolvedValue({
            filesScanned: 10,
            filesSkipped: 0,
            elementsIndexed: 50,
            relationsIndexed: 0,
            durationMs: 100,
            errors: []
        })

        // Mock git status
        spyOn(childProcess, "spawnSync").mockReturnValue({
            status: 0,
            stdout: " M src/test.ts\n?? src/new.ts",
            pid: 1,
            output: [],
            stderr: null,
            signal: null
        } as never)
    })

    afterEach(() => {
        mock.restore()
    })

    test("startAutoInit runs full background flow when git detects changes", async () => {
        const indexSpy = spyOn(indexer, "indexProject")

        startAutoInit("/test/dir", mockConfig)

        expect(isAutoInitRunning()).toBe(true)

        // Wait a tiny bit for the async flow to finish
        await new Promise(r => setTimeout(r, 50))

        expect(isAutoInitRunning()).toBe(false)
        expect(indexSpy).toHaveBeenCalledWith(expect.objectContaining({
            projectDir: "/test/dir",
            project: "dir",
            useVectors: false,
            rebuild: false
        }))

        const lastResult = getLastAutoIndexResult()
        expect(lastResult?.filesScanned).toBe(10)
    })

    test("startAutoInit prevents concurrent runs", async () => {
        const indexSpy = spyOn(indexer, "indexProject")

        // Start first
        startAutoInit("/test/dir", mockConfig)
        expect(isAutoInitRunning()).toBe(true)

        // Try starting second immediately
        startAutoInit("/test/dir2", mockConfig)

        // Wait for them to finish
        await new Promise(r => setTimeout(r, 50))

        // Should only be called once because of the lock
        expect(indexSpy).toHaveBeenCalledTimes(1)
    })

    test("startAutoInit skips index if surrealdb fails to start", async () => {
        spyOn(dockerManager, "ensureSurrealDBRunning").mockRejectedValue(new Error("Docker failed"))
        const indexSpy = spyOn(indexer, "indexProject")

        startAutoInit("/test/dir", mockConfig)
        await new Promise(r => setTimeout(r, 50))

        expect(indexSpy).not.toHaveBeenCalled()
    })

    test("startAutoInit skips index if not connected to surrealdb", async () => {
        spyOn(surrealClient, "isConnected").mockResolvedValue(false)
        const indexSpy = spyOn(indexer, "indexProject")

        startAutoInit("/test/dir", mockConfig)
        await new Promise(r => setTimeout(r, 50))

        expect(indexSpy).not.toHaveBeenCalled()
    })

    test("startAutoInit runs index if no git changes but no existing index found", async () => {
        spyOn(childProcess, "spawnSync").mockReturnValue({
            status: 0,
            stdout: "", // No changed files
            pid: 1, output: [], stderr: null, signal: null
        } as never)

        // getIndexedFiles returns [] by default in beforeEach
        const indexSpy = spyOn(indexer, "indexProject")

        startAutoInit("/test/dir", mockConfig)
        await new Promise(r => setTimeout(r, 50))

        // Should still index because there's no existing index
        expect(indexSpy).toHaveBeenCalled()
    })

    test("startAutoInit skips index if no git changes AND existing index found", async () => {
        spyOn(childProcess, "spawnSync").mockReturnValue({
            status: 0,
            stdout: "", // No changed files
            pid: 1, output: [], stderr: null, signal: null
        } as never)

        const fs = require("fs")
        const path = require("path")
        const parser = require("./code-parser")

        const realFile = "package.json"
        const realPath = path.resolve(process.cwd(), realFile)
        const realContent = fs.readFileSync(realPath, "utf-8")
        const realHash = parser.computeFileHash(realContent)

        spyOn(surrealClient, "getIndexedFiles").mockResolvedValue([
            { file: realFile, fileHash: realHash }
        ])

        const indexSpy = spyOn(indexer, "indexProject")

        startAutoInit(process.cwd(), mockConfig)
        await new Promise(r => setTimeout(r, 100))

        // Should skip because everything is up to date
        expect(indexSpy).not.toHaveBeenCalled()
    })
})
