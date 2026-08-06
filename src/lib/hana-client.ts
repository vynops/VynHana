import type { HanaConnection } from './connection-store'
import { decryptPassword, isDemoConnection } from './connection-store'
import { mockQuery } from './mock-hana'

// Type shim — @sap/hana-client doesn't ship TS types by default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hana = require('@sap/hana-client') as {
  createConnection(): HanaClientConnection
}

export interface HanaClientConnection {
  connect(params: Record<string, unknown>, cb: (err: Error | null) => void): void
  exec(sql: string, cb: (err: Error | null, rows: Record<string, unknown>[]) => void): void
  exec(sql: string, params: unknown[], cb: (err: Error | null, rows: Record<string, unknown>[]) => void): void
  disconnect(): void
  state(): string
}

// Connection pool: one per HanaConnection id
const pool = new Map<string, HanaClientConnection>()

function isHanaCloudHost(host: string): boolean {
  const h = (host ?? '').toLowerCase()
  return h.includes('hanacloud.ondemand.com')
}

function buildParams(conn: HanaConnection): Record<string, unknown> {
  const params: Record<string, unknown> = {
    serverNode: `${conn.host}:${conn.port}`,
    uid: conn.username,
    pwd: decryptPassword(conn.passwordEnc),
    connectTimeout: 10000,
    communicationTimeout: 30000,
    encrypt: conn.ssl ? 'true' : 'false',
  }

  // HANA Cloud SQL endpoint typically resolves the target DB itself.
  // Passing an instance label like "hanadb" causes "database not connected".
  if (!isHanaCloudHost(conn.host) && conn.database) {
    params.databaseName = conn.database
  }

  if (conn.ssl && !conn.sslValidateCert) {
    params.sslValidateCertificate = 'false'
  }
  return params
}

export async function getHanaConnection(conn: HanaConnection): Promise<HanaClientConnection | null> {
  const existing = pool.get(conn.id)
  if (existing && existing.state() === 'connected') return existing

  return new Promise(resolve => {
    try {
      const c = hana.createConnection()
      c.connect(buildParams(conn), err => {
        if (err) {
          console.error(`[hana] connect failed for ${conn.name}:`, err.message)
          resolve(null)
        } else {
          pool.set(conn.id, c)
          resolve(c)
        }
      })
    } catch (e) {
      console.error(`[hana] driver error:`, (e as Error).message)
      resolve(null)
    }
  })
}

export async function execQuery(
  conn: HanaClientConnection,
  sql: string,
  params?: unknown[]
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null, rows: Record<string, unknown>[]) => {
      if (err) reject(err)
      else resolve(rows ?? [])
    }
    if (params && params.length > 0) {
      conn.exec(sql, params, cb)
    } else {
      conn.exec(sql, cb)
    }
  })
}

export function removeFromPool(id: string) {
  const c = pool.get(id)
  if (c) {
    try { c.disconnect() } catch { /* ignore */ }
    pool.delete(id)
  }
}

/** Convenience: get connection, run query, return rows or [] */
export async function queryHana(
  conn: HanaConnection,
  sql: string,
  params?: unknown[]
): Promise<Record<string, unknown>[]> {
  // Demo mode: return mock data without touching the network
  if (isDemoConnection(conn)) return mockQuery(sql)

  const c = await getHanaConnection(conn)
  if (!c) return []
  try {
    return await execQuery(c, sql, params)
  } catch (e) {
    console.error(`[hana] query error on ${conn.name}:`, (e as Error).message)
    return []
  }
}
