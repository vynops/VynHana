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

  // For MDC: list all tenant databases from SYSTEMDB; for tenant DB, return current DB info
  const all = await Promise.all(conns.map(async conn => {
    const isMDCSystem = conn.isSystemDB && conn.isMDC
    const [tenants, tenantStatus] = await Promise.all([
      isMDCSystem
        ? queryHana(conn, `
            SELECT DATABASE_NAME, DESCRIPTION, ACTIVE_STATUS,
              HOST, SQL_PORT, INDEXSERVER_ACTUAL_ROLE,
              CURRENT_STATEMENT_COUNT, START_TIME
            FROM SYS_DATABASES
            ORDER BY DATABASE_NAME`)
        : queryHana(conn, `
            SELECT DATABASE_NAME, '' AS DESCRIPTION,
              'YES' AS ACTIVE_STATUS, HOST,
              0 AS SQL_PORT, 'MASTER' AS INDEXSERVER_ACTUAL_ROLE,
              0 AS CURRENT_STATEMENT_COUNT, START_TIME
            FROM SYS.M_DATABASE`),
      isMDCSystem
        ? queryHana(conn, `
            SELECT DATABASE_NAME, ACTIVE_STATUS, '' AS DETAIL
            FROM SYS.M_DATABASES
            ORDER BY DATABASE_NAME`)
        : queryHana(conn, `
            SELECT DATABASE_NAME, 'YES' AS ACTIVE_STATUS, '' AS DETAIL
            FROM SYS.M_DATABASE`),
    ])
    return { connId: conn.id, connName: conn.name, tenants, tenantStatus }
  }))

  return NextResponse.json(all)
}
