import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"

const mockExistsSync = mock(() => false)
const mockReadFileSync = mock(() => "")
const mockWriteFileSync = mock(() => { })
const mockMkdirSync = mock(() => { })

mock.module("fs", () => ({
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync
}))

const mockJoin = mock((...args: string[]) => args.join("/"))
mock.module("path", () => ({ join: mockJoin }))

const mockLog = mock(() => { })
mock.module("./logger", () => ({ log: mockLog }))

const mockGetOmoOpenCodeCacheDir = mock(() => "/test/cache")
mock.module("./data-path", () => ({ getOmoOpenCodeCacheDir: mockGetOmoOpenCodeCacheDir }))

import * as cache from "./connected-providers-cache"

describe("shared/connected-providers-cache", () => {
    beforeEach(() => {
        mockExistsSync.mockClear()
        mockReadFileSync.mockClear()
        mockWriteFileSync.mockClear()
        mockMkdirSync.mockClear()
        mockJoin.mockClear()
        mockLog.mockClear()
        mockGetOmoOpenCodeCacheDir.mockClear()
    })

    describe("readConnectedProvidersCache", () => {
        test("returns null if cache file does not exist", () => {
            mockExistsSync.mockReturnValueOnce(false)
            expect(cache.readConnectedProvidersCache()).toBeNull()
        })

        test("returns parsed data if valid", () => {
            mockExistsSync.mockReturnValueOnce(true)
            mockReadFileSync.mockReturnValueOnce(JSON.stringify({ connected: ["a", "b"], updatedAt: "now" }))
            expect(cache.readConnectedProvidersCache()).toEqual(["a", "b"])
        })

        test("returns null and logs error if JSON parse fails", () => {
            mockExistsSync.mockReturnValueOnce(true)
            mockReadFileSync.mockReturnValueOnce("invalid json")
            expect(cache.readConnectedProvidersCache()).toBeNull()
            expect(mockLog).toHaveBeenCalledWith("[connected-providers-cache] Error reading cache", expect.any(Object))
        })
    })

    describe("hasConnectedProvidersCache", () => {
        test("checks existsSync", () => {
            mockExistsSync.mockReturnValueOnce(true)
            expect(cache.hasConnectedProvidersCache()).toBe(true)
        })
    })

    describe("readProviderModelsCache", () => {
        test("returns null if cache file does not exist", () => {
            mockExistsSync.mockReturnValueOnce(false)
            expect(cache.readProviderModelsCache()).toBeNull()
        })

        test("returns parsed data if valid", () => {
            mockExistsSync.mockReturnValueOnce(true)
            const mockData = { models: { p1: ["m1"] }, connected: ["p1"], updatedAt: "now" }
            mockReadFileSync.mockReturnValueOnce(JSON.stringify(mockData))
            expect(cache.readProviderModelsCache()).toEqual(mockData)
        })

        test("returns null and logs error if JSON parse fails", () => {
            mockExistsSync.mockReturnValueOnce(true)
            mockReadFileSync.mockReturnValueOnce("invalid json")
            expect(cache.readProviderModelsCache()).toBeNull()
        })
    })

    describe("hasProviderModelsCache", () => {
        test("checks existsSync", () => {
            mockExistsSync.mockReturnValueOnce(true)
            expect(cache.hasProviderModelsCache()).toBe(true)
        })
    })

    describe("writeProviderModelsCache", () => {
        test("creates directory if not exists and writes file successfully", () => {
            mockExistsSync.mockImplementation(((path: string) => {
                if (String(path) === "/test/cache") return false
                return true
            }) as never)
            cache.writeProviderModelsCache({ models: { p1: ["m1"] }, connected: ["p1"] })
            expect(mockMkdirSync).toHaveBeenCalledWith("/test/cache", { recursive: true })
            expect(mockWriteFileSync).toHaveBeenCalled()
        })

        test("logs error if writeFileSync throws", () => {
            mockExistsSync.mockReturnValueOnce(true) // dir exists
            mockWriteFileSync.mockImplementationOnce(() => { throw new Error("FS Error") })
            cache.writeProviderModelsCache({ models: {}, connected: [] })
            expect(mockLog).toHaveBeenCalledWith("[connected-providers-cache] Error writing provider-models cache", expect.any(Object))
        })
    })

    describe("updateConnectedProvidersCache", () => {
        test("returns early if list method missing", async () => {
            await cache.updateConnectedProvidersCache({} as never)
            expect(mockLog).toHaveBeenCalledWith("[connected-providers-cache] client.provider.list not available")
        })

        test("fetches providers and creates cache handling missing model list", async () => {
            // Mock writeConnectedProvidersCache
            mockExistsSync.mockReturnValue(true)
            const mockClient = {
                provider: { list: mock(async () => ({ data: { connected: ["p1"] } })) }
            }
            await cache.updateConnectedProvidersCache(mockClient as never)
            expect(mockWriteFileSync).toHaveBeenCalled() // for writeConnectedProvidersCache
        })

        test("fetches providers and models updating both caches mapping model ids", async () => {
            mockExistsSync.mockReturnValue(true) // assume dir exists 
            const mockClient = {
                provider: { list: mock(async () => ({ data: { connected: ["p1"] } })) },
                model: {
                    list: mock(async () => ({
                        data: [
                            { id: "m1", provider: "p1" },
                            { id: "m2", provider: "p1" },
                            { id: "m3", provider: "p2" }
                        ]
                    }))
                }
            }
            await cache.updateConnectedProvidersCache(mockClient as never)
            // Should write provider cache AND provider models cache
            expect(mockWriteFileSync).toHaveBeenCalledTimes(2)
        })

        test("handles client.model.list errors gracefully", async () => {
            mockExistsSync.mockReturnValue(true)
            const mockClient = {
                provider: { list: mock(async () => ({ data: { connected: ["p1"] } })) },
                model: { list: mock(async () => { throw new Error("fetch fail") }) }
            }
            await cache.updateConnectedProvidersCache(mockClient as never)
            expect(mockWriteFileSync).toHaveBeenCalledTimes(1) // only first write works
            expect(mockLog).toHaveBeenCalledWith("[connected-providers-cache] Error fetching models", expect.any(Object))
        })

        test("handles client.provider.list errors completely", async () => {
            const mockClient = {
                provider: { list: mock(async () => { throw new Error("master fetch fail") }) }
            }
            await cache.updateConnectedProvidersCache(mockClient as never)
            expect(mockWriteFileSync).not.toHaveBeenCalled()
            expect(mockLog).toHaveBeenCalledWith("[connected-providers-cache] Error updating cache", expect.any(Object))
        })

        test("internal writeConnectedProvidersCache handles fs exceptions safely", async () => {
            mockExistsSync.mockReturnValue(true)
            mockWriteFileSync.mockImplementationOnce(() => { throw new Error("write fail internally") })
            const mockClient = {
                provider: { list: mock(async () => ({ data: { connected: ["p1"] } })) }
            }
            await cache.updateConnectedProvidersCache(mockClient as never)
            expect(mockLog).toHaveBeenCalledWith("[connected-providers-cache] Error writing cache", expect.any(Object))
        })
    })
})
