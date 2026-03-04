import { describe, it, expect } from "bun:test"
import type { BackgroundTaskArgs, BackgroundOutputArgs, BackgroundCancelArgs } from "./types"
import {
    BACKGROUND_TASK_DESCRIPTION,
    BACKGROUND_OUTPUT_DESCRIPTION,
    BACKGROUND_CANCEL_DESCRIPTION,
} from "./constants"

describe("background-task", () => {
    describe("types", () => {
        it("BackgroundTaskArgs has required fields", () => {
            const args: BackgroundTaskArgs = {
                description: "Run tests",
                prompt: "Run bun test and report results",
                agent: "worker",
            }
            expect(args.description).toBe("Run tests")
            expect(args.prompt).toBe("Run bun test and report results")
            expect(args.agent).toBe("worker")
        })

        it("BackgroundOutputArgs has required fields", () => {
            const args: BackgroundOutputArgs = {
                task_id: "task-123",
            }
            expect(args.task_id).toBe("task-123")
            expect(args.block).toBeUndefined()
            expect(args.timeout).toBeUndefined()
        })

        it("BackgroundOutputArgs supports optional fields", () => {
            const args: BackgroundOutputArgs = {
                task_id: "task-123",
                block: true,
                timeout: 30_000,
            }
            expect(args.block).toBe(true)
            expect(args.timeout).toBe(30_000)
        })

        it("BackgroundCancelArgs supports cancel all", () => {
            const args: BackgroundCancelArgs = { all: true }
            expect(args.all).toBe(true)
            expect(args.taskId).toBeUndefined()
        })

        it("BackgroundCancelArgs supports single cancel", () => {
            const args: BackgroundCancelArgs = { taskId: "task-456" }
            expect(args.taskId).toBe("task-456")
        })
    })

    describe("constants", () => {
        it("tool descriptions are non-empty strings", () => {
            expect(BACKGROUND_TASK_DESCRIPTION.length).toBeGreaterThan(10)
            expect(BACKGROUND_OUTPUT_DESCRIPTION.length).toBeGreaterThan(10)
            expect(BACKGROUND_CANCEL_DESCRIPTION.length).toBeGreaterThan(10)
        })

        it("descriptions mention English requirement", () => {
            expect(BACKGROUND_TASK_DESCRIPTION).toContain("English")
        })

        it("descriptions mention background task concepts", () => {
            expect(BACKGROUND_TASK_DESCRIPTION).toContain("background")
            expect(BACKGROUND_OUTPUT_DESCRIPTION).toContain("background")
            expect(BACKGROUND_CANCEL_DESCRIPTION).toContain("background")
        })
    })
})
