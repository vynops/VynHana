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
    const [active, definitions] = await Promise.all([
      queryHana(conn, `
        SELECT
          ALERT_ID,
          ALERT_TIMESTAMP,
          ALERT_RATING,
          ALERT_DETAILS,
          ALERT_USERACTION,
          HOST,
          PORT,
          SERVICE_NAME
        FROM SYS.M_ALERTS
        ORDER BY ALERT_TIMESTAMP DESC
        LIMIT 200`).catch(() => [] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT
          ALERT_ID,
          ALERT_NAME,
          ALERT_DESCRIPTION,
          ALERT_CATEGORY,
          DEFAULT_THRESHOLD_WARNING_VALUE,
          DEFAULT_THRESHOLD_CRITICAL_VALUE,
          UNIT
        FROM SYS.M_ALERT_DEFINITIONS
        ORDER BY ALERT_CATEGORY, ALERT_NAME`).catch(() => [] as Record<string, unknown>[]),
    ])
    return { connId: conn.id, connName: conn.name, active, definitions }
  }))

  return NextResponse.json(all)
}
