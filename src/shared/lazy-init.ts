/**
 * Helper to encapsulate lazy initialization state (cached value + in-flight promise).
 * Replaces module-level mutable `let` pairings.
 */

export interface LazyResolver<T> {
    /** Get the value, initializing it if necessary */
    get(): Promise<T | null>
    /** Get the currently cached value synchronously without triggering init */
    getCached(): T | null
    /** Trigger background initialization if not already started */
    startBackgroundInit(): void
    /** Reset the cache (useful for tests) */
    reset(): void
}

export function createLazyResolver<T>(
    resolverFn: () => Promise<T | null>
): LazyResolver<T> {
    let cachedValue: T | null = null
    let initPromise: Promise<T | null> | null = null

    return {
        get: async () => {
            if (cachedValue !== null) return cachedValue
            if (initPromise) return initPromise

            initPromise = (async () => {
                try {
                    const val = await resolverFn()
                    cachedValue = val
                    return val
                } catch {
                    return null
                }
            })()

            return initPromise
        },
        getCached: () => cachedValue,
        startBackgroundInit: () => {
            if (!initPromise && cachedValue === null) {
                initPromise = (async () => {
                    try {
                        const val = await resolverFn()
                        cachedValue = val
                        return val
                    } catch {
                        return null
                    }
                })()
                initPromise.catch(() => { })
            }
        },
        reset: () => {
            cachedValue = null
            initPromise = null
        }
    }
}
