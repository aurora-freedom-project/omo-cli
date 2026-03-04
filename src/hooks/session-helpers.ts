/**
 * @module hooks/session-helpers
 *
 * Hook-layer session utilities that depend on features/.
 * Kept in hooks/ to avoid shared/ → features/ circular dependency.
 */

import { getMessageDir } from "../shared/session-utils"
import { findNearestMessageWithFields } from "../features/hook-message-injector"

/**
 * Check if the caller of the current session is the Conductor (orchestrator).
 * Uses message history to find the nearest message with agent info.
 */
export function isCallerOrchestrator(sessionID?: string): boolean {
    if (!sessionID) return false
    const messageDir = getMessageDir(sessionID)
    if (!messageDir) return false
    const nearest = findNearestMessageWithFields(messageDir)
    return nearest?.agent?.toLowerCase() === "conductor"
}
