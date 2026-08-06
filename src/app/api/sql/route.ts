import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { getHanaConnection, execQuery } from '@/lib/hana-client'

const AUTO_LIMIT = 500

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth

  const { connId, sql } = await req.json()
  if (!connId) return NextResponse.json({ error: 'Select a connection first.' }, { status: 400 })
  if (!sql?.trim()) return NextResponse.json({ error: 'Enter a SQL statement.' }, { status: 400 })

  const conn = loadConnections().find(c => c.id === connId)
  if (!conn) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 })

  const isSelect = /^\s*SELECT\b/i.test(sql.trim())
  const hasLimit = /\bLIMIT\s+\d+/i.test(sql)
  const finalSql = isSelect && !hasLimit ? `${sql.trim()}\nLIMIT ${AUTO_LIMIT}` : sql.trim()

  const start = Date.now()
  try {
    const c = await getHanaConnection(conn)
    if (!c) return NextResponse.json({ error: 'Could not connect to HANA. Check connection settings.' }, { status: 503 })
    const rows = await execQuery(c, finalSql, [])
    return NextResponse.json({
      rows,
      rowCount: rows.length,
      elapsed: Date.now() - start,
      autoLimited: isSelect && !hasLimit,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, elapsed: Date.now() - start }, { status: 400 })
  }
}
