import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections, saveConnection } from '@/lib/connection-store'
import { queryHana, removeFromPool } from '@/lib/hana-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const conns = loadConnections()
  const results = await Promise.all(conns.map(async conn => {
    try {
      removeFromPool(conn.id)
      const [dbRows, memRows, svcRows] = await Promise.all([
        queryHana(conn, "SELECT SYSTEM_ID, VERSION, USAGE, HOST FROM M_DATABASE"),
        queryHana(conn, "SELECT ROUND(USED_PHYSICAL_MEMORY/1024/1024/1024, 2) AS MEM_USED_GB, ROUND(FREE_PHYSICAL_MEMORY/1024/1024/1024, 2) AS MEM_FREE_GB, ROUND(ALLOCATION_LIMIT/1024/1024/1024, 2) AS MEM_LIMIT_GB FROM M_HOST_RESOURCE_UTILIZATION"),
        queryHana(conn, "SELECT COUNT(*) AS SVC_COUNT, COUNT(*) AS ACTIVE_COUNT FROM SYS.M_SERVICES"),
      ])
      const db = dbRows[0] ?? {}
      const mem = memRows[0] ?? {}
      const svc = svcRows[0] ?? {}
      const memUsed = Number(mem.MEM_USED_GB ?? 0)
      const memLimit = Number(mem.MEM_LIMIT_GB ?? 1)
      const memPct = memLimit > 0 ? Math.round((memUsed / memLimit) * 100) : 0
      // HANA Cloud M_DATABASE does not have ACTIVE_STATUS; treat successful query as active
      const isActive = dbRows.length > 0
      const healthScore = isActive ? Math.max(0, 100 - memPct / 2) : 0
      const updated = {
        ...conn,
        version: String(db.VERSION ?? conn.version ?? ''),
        status: isActive ? 'connected' as const : 'error' as const,
        healthScore: Math.round(healthScore),
        lastChecked: new Date().toISOString(),
      }
      saveConnection(updated)
      return {
        ...updated,
        memUsedGB: memUsed,
        memLimitGB: memLimit,
        memPct,
        svcCount: Number(svc.SVC_COUNT ?? 0),
        activeSvcCount: Number(svc.ACTIVE_COUNT ?? 0),
        host: String(db.HOST ?? conn.host),
        systemId: String(db.SYSTEM_ID ?? ''),
        usage: String(db.USAGE ?? ''),
      }
    } catch {
      const updated = { ...conn, status: 'error' as const, healthScore: 0, lastChecked: new Date().toISOString() }
      saveConnection(updated)
      return { ...updated, memUsedGB: 0, memLimitGB: 0, memPct: 0, svcCount: 0, activeSvcCount: 0 }
    }
  }))

  return NextResponse.json(results)
}
