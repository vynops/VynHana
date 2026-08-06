import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryHana } from '@/lib/hana-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const connId = searchParams.get('connId')
  const conns = loadConnections().filter(c => !connId || c.id === connId)

  const all = await Promise.all(conns.map(async conn => {
    const [status, sites, log] = await Promise.all([
      queryHana(conn, `
        SELECT HOST, PORT, VOLUME_ID,
          REPLICATION_MODE, REPLICATION_STATUS, REPLICATION_STATUS_DETAILS,
          SECONDARY_HOST, SECONDARY_PORT,
          0 AS ASYNC_BUFFER_FULL_COUNT, 0 AS REPLICATION_DELAY_MS
        FROM M_SERVICE_REPLICATION`).catch(() => [] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT SITE_ID, SITE_NAME, REPLICATION_MODE,
          FAILOVER_STATUS, FAILOVER_TIME, OPERATION_MODE
        FROM M_SYSTEM_REPLICATION_SITES`).catch(() => [] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT HOST, PORT, VOLUME_ID, REPLICATION_STATUS
        FROM M_SERVICE_REPLICATION LIMIT 20`).catch(() => [] as Record<string, unknown>[]),
    ])
    return { connId: conn.id, connName: conn.name, status, sites, log }
  }))

  return NextResponse.json(all)
}
