# Implementation Plan: Extract manager.ts into Sub-Modules

## Goal
Split `manager.ts` into focused sub-modules while maintaining the `BackgroundTaskManager` public API.

## Module Breakdown

### 1. `lifecycle.ts` (~150 lines)
**Responsibility**: Process lifecycle, cleanup, polling control

Exports:
- `LifecycleManager` class

Contents:
- Static cleanup tracking (cleanupManagers, cleanupHandlers)
- Process signal registration (registerProcessSignal)
- Polling start/stop methods
- Shutdown method
- Helper: hasRunningTasks()

### 2. `monitoring.ts` (~400 lines)  
**Responsibility**: Task monitoring, completion detection, polling

Exports:
- `TaskMonitor` class

Contents:
- tryCompleteTask()
- validateSessionHasOutput()
- checkAndInterruptStaleTasks()
- pruneStaleTasksAndNotifications()
- pollRunningTasks()
- notifyParentSession()
- markForNotification(), clearNotificationsForTask()
- Helper: formatDuration()

### 3. `manager.ts` (Orchestrator)
**Responsibility**: Coordination, API surface

- BackgroundManager class (reduced from ~950 to ~350 lines)
- Delegates to LifecycleManager and TaskMonitor
- Keeps: launch(), resume(), trackTask(), getTask(), getTasksByParentSession(), getAllDescendantTasks(), findBySession(), handleEvent(), getRunningTasks(), getCompletedTasks(), cancelPendingTask(), cancelRunningTask()

## Dependencies
- `concurrency.ts` (unchanged, already separate)
- `types.ts` (unchanged)

## Backward Compatibility
- Keep all existing exports in `index.ts`
- BackgroundTaskManager remains the primary export

## Files to Create/Modify
1. Create: `src/features/background-agent/lifecycle.ts`
2. Create: `src/features/background-agent/monitoring.ts`  
3. Modify: `src/features/background-agent/manager.ts` (orchestrator)
4. Backup: Create `.bak` files before modifying
