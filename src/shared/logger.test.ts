import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"

const mockAppendFileSync = mock(() => { })
mock.module("fs", () => ({ appendFileSync: mockAppendFileSync }))

import * as os from "os"

import * as logger from "./logger"
import * as path from "path"

describe("shared/logger", () => {
    beforeEach(() => {
        mockAppendFileSync.mockClear()
    })

    describe("getLogFilePath", () => {
        test("returns mapped bounds strings targets arrays mapped resolving mapped path constraints variables strings targeting map bounds limit loops", () => {
            const expected = path.join(os.tmpdir(), "omo-cli.log")
            expect(logger.getLogFilePath()).toBe(expected)
        })
    })

    describe("log", () => {
        test("appends message without data natively mapping limits tracking bounds var loops", () => {
            logger.log("test msg")
            expect(mockAppendFileSync).toHaveBeenCalledWith(
                logger.getLogFilePath(),
                expect.stringContaining("] test msg \n")
            )
        })

        test("appends message including JSON parsed string blocks mapping map constraint array logic limits strings limits", () => {
            logger.log("data msg", { a: 1 })
            expect(mockAppendFileSync).toHaveBeenCalledWith(
                logger.getLogFilePath(),
                expect.stringContaining('] data msg {"a":1}\n')
            )
        })

        test("silently catches errors on append blocks limits naturally mapping error boundaries missing logic check strings tracking string limits bounds", () => {
            mockAppendFileSync.mockImplementationOnce(() => { throw new Error("eacces loop map limits strings error bounds map limit array boundaries missing mappings loops target array mapping") })
            // Should not throw
            expect(() => { logger.log("fail check msg limit loop bounds arrays map loops target maps limit loops mapping boundaries") }).not.toThrow()
        })
    })
})
