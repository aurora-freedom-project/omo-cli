/**
 * MCP OAuth — Token Storage
 *
 * Manages OAuth token persistence with security-sensitive file permissions.
 * Partially migrated to StorageService for core read/write operations.
 * The chmod 0o600 security is handled at the write boundary.
 */
import { chmodSync } from "node:fs"
import { Effect } from "effect"
import { FileStorageLive } from "../../shared/effect/file-storage"
import { StorageService } from "../../shared/effect/services"
import { getOpenCodeConfigDir } from "../../shared"

export interface OAuthTokenData {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  clientInfo?: {
    clientId: string
    clientSecret?: string
  }
}

type TokenStore = Record<string, OAuthTokenData>

const STORAGE_FILE_NAME = "mcp-oauth.json"

/** Get the storage path for mcp-oauth token file. */
export function getMcpOauthStoragePath(): string {
  const configDir = getOpenCodeConfigDir({ binary: "opencode" })
  return `${configDir}/${STORAGE_FILE_NAME}`
}

function getStorageLayer() {
  const configDir = getOpenCodeConfigDir({ binary: "opencode" })
  return FileStorageLive(configDir)
}

function normalizeHost(serverHost: string): string {
  let host = serverHost.trim()
  if (!host) return host

  if (host.includes("://")) {
    try {
      host = new URL(host).hostname
    } catch {
      host = host.split("/")[0]
    }
  } else {
    host = host.split("/")[0]
  }

  if (host.startsWith("[")) {
    const closing = host.indexOf("]")
    if (closing !== -1) {
      host = host.slice(0, closing + 1)
    }
    return host
  }

  if (host.includes(":")) {
    host = host.split(":")[0]
  }

  return host
}

function normalizeResource(resource: string): string {
  return resource.replace(/^\/+/, "")
}

function buildKey(serverHost: string, resource: string): string {
  const host = normalizeHost(serverHost)
  const normalizedResource = normalizeResource(resource)
  return `${host}/${normalizedResource}`
}

function readStore(): TokenStore | null {
  return Effect.runSync(
    Effect.try({
      try: () =>
        Effect.runSync(
          Effect.provide(
            Effect.catchAll(
              Effect.gen(function* () {
                const storage = yield* StorageService
                const content = yield* storage.read(STORAGE_FILE_NAME)
                return yield* Effect.try({
                  try: () => JSON.parse(content) as TokenStore,
                  catch: () => new (class extends Error { readonly _tag = "ParseError" })(),
                })
              }),
              () => Effect.succeed(null as TokenStore | null)
            ),
            getStorageLayer()
          )
        ),
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))
  )
}

function writeStore(store: TokenStore): boolean {
  return Effect.runSync(
    Effect.try({
      try: () => {
        Effect.runSync(
          Effect.provide(
            Effect.gen(function* () {
              const storage = yield* StorageService
              yield* storage.write(STORAGE_FILE_NAME, JSON.stringify(store, null, 2))
            }),
            getStorageLayer()
          )
        )
        // Apply restrictive permissions after write (security requirement)
        const filePath = getMcpOauthStoragePath()
        chmodSync(filePath, 0o600)
        return true
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed(false)))
  )
}

/** Load an OAuth token for a specific server host and resource. */
export function loadToken(serverHost: string, resource: string): OAuthTokenData | null {
  const store = readStore()
  if (!store) return null

  const key = buildKey(serverHost, resource)
  return store[key] ?? null
}

/** Save an OAuth token for a specific server host and resource. */
export function saveToken(serverHost: string, resource: string, token: OAuthTokenData): boolean {
  const store = readStore() ?? {}
  const key = buildKey(serverHost, resource)
  store[key] = token
  return writeStore(store)
}

/** Delete an OAuth token for a specific server host and resource. */
export function deleteToken(serverHost: string, resource: string): boolean {
  const store = readStore()
  if (!store) return true

  const key = buildKey(serverHost, resource)
  if (!(key in store)) {
    return true
  }

  delete store[key]

  if (Object.keys(store).length === 0) {
    return Effect.runSync(
      Effect.try({
        try: () => {
          Effect.runSync(
            Effect.provide(
              Effect.catchAll(
                Effect.gen(function* () {
                  const storage = yield* StorageService
                  yield* storage.remove(STORAGE_FILE_NAME)
                }),
                () => Effect.succeed(undefined as void)
              ),
              getStorageLayer()
            )
          )
          return true
        },
        catch: () => "fail" as const,
      }).pipe(Effect.catchAll(() => Effect.succeed(false)))
    )
  }

  return writeStore(store)
}

/** List all tokens for a specific server host. */
export function listTokensByHost(serverHost: string): TokenStore {
  const store = readStore()
  if (!store) return {}

  const host = normalizeHost(serverHost)
  const prefix = `${host}/`
  const result: TokenStore = {}

  for (const [key, value] of Object.entries(store)) {
    if (key.startsWith(prefix)) {
      result[key] = value
    }
  }

  return result
}

/** List all stored OAuth tokens. */
export function listAllTokens(): TokenStore {
  return readStore() ?? {}
}
