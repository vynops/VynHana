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
    const [cpuRows, memRows, ioRows, connRows] = await Promise.all([
      queryHana(conn, `
        SELECT HOST, 0 AS CPU_USED_PCT, 0 AS OPEN_FILE_COUNT, 0 AS SWAP_MB
        FROM M_HOST_RESOURCE_UTILIZATION`).catch(() => [{}] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT HOST,
          ROUND(USED_PHYSICAL_MEMORY/1024/1024/1024, 2) AS MEM_USED_GB,
          ROUND(FREE_PHYSICAL_MEMORY/1024/1024/1024, 2) AS MEM_FREE_GB,
          ROUND(ALLOCATION_LIMIT/1024/1024/1024, 2) AS MEM_LIMIT_GB,
          ROUND(INSTANCE_TOTAL_MEMORY_USED_SIZE/1024/1024/1024, 2) AS HANA_USED_GB
        FROM M_HOST_RESOURCE_UTILIZATION`).catch(() => [{}] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT HOST, 0 AS READ_MB, 0 AS WRITE_MB, 0 AS READ_OPS, 0 AS WRITE_OPS
        FROM M_HOST_RESOURCE_UTILIZATION`).catch(() => [{}] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT COUNT(*) AS TOTAL_CONN,
          SUM(CASE WHEN CONNECTION_STATUS='RUNNING' THEN 1 ELSE 0 END) AS RUNNING,
          SUM(CASE WHEN CONNECTION_STATUS='IDLE' THEN 1 ELSE 0 END) AS IDLE
        FROM M_CONNECTIONS`).catch(() => [{}] as Record<string, unknown>[]),
    ])
    return {
      connId: conn.id, connName: conn.name,
      cpu: cpuRows[0] ?? {},
      memory: memRows[0] ?? {},
      io: ioRows[0] ?? {},
      connections: connRows[0] ?? {},
    }
  }))

  return NextResponse.json(all)
}
