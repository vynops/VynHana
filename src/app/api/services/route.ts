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
    const rows = await queryHana(conn, `
      SELECT
        SERVICE_NAME,
        HOST,
        PORT,
        'YES' AS ACTIVE_STATUS,
        0 AS SQL_EXECUTION_COUNT,
        0 AS MEM_USED_MB,
        0 AS CPU_SEC,
        0 AS CONNECTION_COUNT,
        0 AS TRANSACTION_COUNT,
        COORDINATOR_TYPE
      FROM M_SERVICES
      ORDER BY HOST, SERVICE_NAME
    `).catch(() => [] as Record<string, unknown>[])
    return rows.map(r => ({ connId: conn.id, connName: conn.name, ...r }))
  }))

  return NextResponse.json(all.flat())
}
