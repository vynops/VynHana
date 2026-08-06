import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryHana } from '@/lib/hana-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const connId = searchParams.get('connId')
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const conns = loadConnections().filter(c => !connId || c.id === connId)

  const all = await Promise.all(conns.map(async conn => {
    const [catalog, status, volumes] = await Promise.all([
      queryHana(conn, `
        SELECT
          ENTRY_ID,
          ENTRY_TYPE_NAME,
          BACKUP_ID,
          SYS_START_TIME,
          SYS_END_TIME,
          STATE_NAME,
          '' AS DESTINATION_TYPE_NAME,
          0 AS BACKUP_SIZE,
          0 AS SIZE_GB,
          '' AS COMMENT,
          SOURCE_ID
        FROM M_BACKUP_CATALOG
        ORDER BY SYS_START_TIME DESC
        LIMIT ${limit}`).catch(() => [] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT
          ENTRY_ID,
          '' AS DESTINATION_TYPE_NAME, '' AS PATH,
          0 AS BACKUP_SIZE, '' AS MESSAGE, SOURCE_ID
        FROM M_BACKUP_CATALOG_FILES
        ORDER BY ENTRY_ID DESC
        LIMIT ${limit}`).catch(() => [] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT
          VOLUME_ID, SERVICE_NAME, HOST, PORT,
          '' AS VOLUME_TYPE, 0 AS MAX_SIZE, 0 AS USED_SIZE, '' AS PATH
        FROM M_VOLUMES`).catch(() => [] as Record<string, unknown>[]),
    ])
    return { connId: conn.id, connName: conn.name, catalog, status, volumes }
  }))

  return NextResponse.json(all)
}
