/**
 * Boulder State Storage
 *
 * Handles reading/writing boulder.json for active plan tracking.
 * Migrated to use StorageService (FileStorageLive) under the hood.
 *
 * Note: This is project-scoped storage — the base directory changes
 * per project, so we create a FileStorageLive per call.
 */

import { Effect } from "effect"
import { existsSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { FileStorageLive } from "../../shared/effect/file-storage"
import { StorageService } from "../../shared/effect/services"
import type { BoulderState, PlanProgress } from "./types"
import { BOULDER_DIR, BOULDER_FILE, PROMETHEUS_PLANS_DIR } from "./constants"

function makeLayer(directory: string) {
  return FileStorageLive(join(directory, BOULDER_DIR))
}

function readJson<T>(directory: string, key: string): T | null {
  return Effect.runSync(
    Effect.provide(
      Effect.catchAll(
        Effect.gen(function* () {
          const storage = yield* StorageService
          const content = yield* storage.read(key)
          return JSON.parse(content) as T
        }),
        () => Effect.succeed(null as T | null)
      ),
      makeLayer(directory)
    )
  )
}

function writeJson<T>(directory: string, key: string, data: T): boolean {
  return Effect.runSync(
    Effect.provide(
      Effect.catchAll(
        Effect.gen(function* () {
          const storage = yield* StorageService
          yield* storage.write(key, JSON.stringify(data, null, 2))
          return true
        }),
        () => Effect.succeed(false)
      ),
      makeLayer(directory)
    )
  )
}

/** Get the boulder.json file path for a project directory. */
export function getBoulderFilePath(directory: string): string {
  return join(directory, BOULDER_DIR, BOULDER_FILE)
}

/** Read the active boulder state for a project, or null if not found. */
export function readBoulderState(directory: string): BoulderState | null {
  return readJson<BoulderState>(directory, BOULDER_FILE)
}

/** Write boulder state for a project. Returns true on success. */
export function writeBoulderState(directory: string, state: BoulderState): boolean {
  return writeJson(directory, BOULDER_FILE, state)
}

/** Append a session ID to the boulder state's session list. */
export function appendSessionId(directory: string, sessionId: string): BoulderState | null {
  const state = readBoulderState(directory)
  if (!state) return null

  if (!state.session_ids.includes(sessionId)) {
    state.session_ids.push(sessionId)
    if (writeBoulderState(directory, state)) {
      return state
    }
  }

  return state
}

/** Clear the boulder state file for a project. */
export function clearBoulderState(directory: string): boolean {
  return Effect.runSync(
    Effect.provide(
      Effect.catchAll(
        Effect.gen(function* () {
          const storage = yield* StorageService
          yield* storage.remove(BOULDER_FILE)
          return true
        }),
        () => Effect.succeed(false)
      ),
      makeLayer(directory)
    )
  )
}

/**
 * Find Planner plan files for this project.
 * Planner stores plans at: {project}/.opencode/plans/{name}.md
 */
export function findPlannerPlans(directory: string): string[] {
  const plansDir = join(directory, PROMETHEUS_PLANS_DIR)

  if (!existsSync(plansDir)) {
    return []
  }

  return Effect.runSync(
    Effect.try({
      try: () => {
        const files = readdirSync(plansDir)
        return files
          .filter((f) => f.endsWith(".md"))
          .map((f) => join(plansDir, f))
          .sort((a, b) => {
            const { statSync } = require("node:fs")
            const aStat = statSync(a)
            const bStat = statSync(b)
            return bStat.mtimeMs - aStat.mtimeMs
          })
      },
      catch: () => [] as string[] as never
    }).pipe(Effect.catchAll(() => Effect.succeed([] as string[])))
  )
}

/**
 * Parse a plan file and count checkbox progress.
 */
export function getPlanProgress(planPath: string): PlanProgress {
  if (!existsSync(planPath)) {
    return { total: 0, completed: 0, isComplete: true }
  }

  return Effect.runSync(
    Effect.try({
      try: () => {
        const { readFileSync } = require("node:fs")
        const content = readFileSync(planPath, "utf-8")

        const uncheckedMatches = content.match(/^[-*]\s*\[\s*\]/gm) || []
        const checkedMatches = content.match(/^[-*]\s*\[[xX]\]/gm) || []

        const total = uncheckedMatches.length + checkedMatches.length
        const completed = checkedMatches.length

        return {
          total,
          completed,
          isComplete: total === 0 || completed === total,
        } as PlanProgress
      },
      catch: () => ({ total: 0, completed: 0, isComplete: true }) as PlanProgress as never
    }).pipe(Effect.catchAll(() => Effect.succeed({ total: 0, completed: 0, isComplete: true } as PlanProgress)))
  )
}

/** Extract plan name from file path. */
export function getPlanName(planPath: string): string {
  return basename(planPath, ".md")
}

/** Create a new boulder state for a plan. */
export function createBoulderState(
  planPath: string,
  sessionId: string
): BoulderState {
  return {
    active_plan: planPath,
    started_at: new Date().toISOString(),
    session_ids: [sessionId],
    plan_name: getPlanName(planPath),
  }
}
