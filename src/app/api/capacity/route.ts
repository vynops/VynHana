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
    const [disk, volumes, dataArea] = await Promise.all([
      queryHana(conn, `
        SELECT HOST, USAGE_TYPE, '' AS PATH,
          0 AS TOTAL_GB,
          ROUND(USED_SIZE/1073741824, 2) AS USED_GB,
          0 AS FREE_GB,
          0 AS USED_PCT
        FROM M_DISK_USAGE
        ORDER BY USED_PCT DESC`).catch(() => [] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT VOLUME_ID, SERVICE_NAME, HOST, PORT,
          '' AS VOLUME_TYPE,
          0 AS MAX_GB,
          ROUND(USED_SIZE/1073741824, 2) AS USED_GB,
          '' AS PATH
        FROM M_VOLUMES
        ORDER BY USED_SIZE DESC`).catch(() => [] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT HOST,
          ROUND(USED_PHYSICAL_MEMORY/1073741824, 2) AS DATA_VOL_TOTAL_GB,
          ROUND(USED_PHYSICAL_MEMORY/1073741824, 2) AS DATA_VOL_USED_GB,
          0 AS LOG_VOL_TOTAL_GB, 0 AS LOG_VOL_USED_GB
        FROM M_HOST_RESOURCE_UTILIZATION`).catch(() => [] as Record<string, unknown>[]),
    ])
    return { connId: conn.id, connName: conn.name, disk, volumes, dataArea }
  }))

  return NextResponse.json(all)
}
