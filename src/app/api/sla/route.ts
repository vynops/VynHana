import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { loadIncidents } from '@/lib/incident-store'
import { loadSettings } from '@/lib/settings-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const settings = loadSettings()
  const target = settings.slaTargetUptimePct ?? 99.9
  const conns = loadConnections()
  const incidents = loadIncidents()

  // Calculate uptime from incident durations
  const now = Date.now()
  const thirtyDays = 30 * 24 * 3600 * 1000
  const periodStart = now - thirtyDays

  const slaEntries = conns.map(conn => {
    const connInc = incidents.filter(i =>
      i.connectionId === conn.id &&
      new Date(i.createdAt).getTime() > periodStart
    )
    const downtimeMs = connInc.reduce((sum, i) => {
      const start = Math.max(new Date(i.createdAt).getTime(), periodStart)
      const end = i.resolvedAt ? new Date(i.resolvedAt).getTime() : now
      return sum + (end - start)
    }, 0)
    const uptimePct = ((thirtyDays - downtimeMs) / thirtyDays) * 100
    const resolved = connInc.filter(i => !!i.resolvedAt)
    const mttrMin = resolved.length === 0
      ? 0
      : Math.round(resolved.reduce((sum, i) => {
          const s = new Date(i.createdAt).getTime()
          const e = new Date(i.resolvedAt as string).getTime()
          return sum + Math.max(0, e - s)
        }, 0) / resolved.length / 60000)

    const allowedDowntimeMin = Math.round((1 - target / 100) * thirtyDays / 60000)
    const downtimeMin = Math.round(downtimeMs / 60000)
    const errorBudgetRemainingMin = Math.max(0, allowedDowntimeMin - downtimeMin)

    return {
      connId: conn.id, connName: conn.name,
      environment: conn.environment,
      uptimePct: Math.min(100, Math.max(0, parseFloat(uptimePct.toFixed(4)))),
      targetPct: target,
      breached: uptimePct < target,
      incidentCount: connInc.length,
      downtimeMin,
      openIncidents: connInc.filter(i => i.status === 'open' || i.status === 'investigating').length,
      mttrMin,
      errorBudgetRemainingMin,
      allowedDowntimeMin,
    }
  })

  const breaches = slaEntries.filter(e => e.breached).length
  const globalUptime = slaEntries.length === 0
    ? 100
    : parseFloat((slaEntries.reduce((n, e) => n + e.uptimePct, 0) / slaEntries.length).toFixed(4))

  return NextResponse.json({
    target,
    entries: slaEntries,
    summary: {
      systems: slaEntries.length,
      breaches,
      globalUptime,
      avgMttrMin: slaEntries.length === 0
        ? 0
        : Math.round(slaEntries.reduce((n, e) => n + e.mttrMin, 0) / slaEntries.length),
    },
  })
}
