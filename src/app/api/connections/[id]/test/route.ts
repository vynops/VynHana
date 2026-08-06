import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections, saveConnection, isDemoConnection } from '@/lib/connection-store'
import { queryHana, removeFromPool } from '@/lib/hana-client'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { id } = await ctx.params

  const conns = loadConnections()
  const conn = conns.find(c => c.id === id)
  if (!conn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Demo-like connections are always "connected"
  if (isDemoConnection(conn)) {
    return NextResponse.json({ ok: true, isDemo: true, version: conn.version ?? '2.00.070.00', status: 'connected' })
  }

  // Force a fresh connection attempt
  removeFromPool(id)
  const rows = await queryHana(conn, 'SELECT SYSTEM_ID, VERSION, USAGE FROM M_DATABASE')

  if (rows.length === 0) {
    conn.status = 'error'
    conn.healthScore = 0
  } else {
    conn.status = 'connected'
    conn.healthScore = 100
    conn.version = String(rows[0].VERSION ?? '')
  }
  conn.lastChecked = new Date().toISOString()
  saveConnection(conn)

  return NextResponse.json({ ok: conn.status === 'connected', conn })
}
