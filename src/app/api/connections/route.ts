import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  loadConnections, saveConnection, newConnectionId, encryptPassword, HanaConnection
} from '@/lib/connection-store'
import { queryHana } from '@/lib/hana-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(loadConnections())
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const conn: HanaConnection = {
    id: newConnectionId(),
    name: body.name,
    host: body.host,
    port: Number(body.port) || 39015,
    database: body.database || 'SYSTEMDB',
    username: body.username,
    passwordEnc: encryptPassword(body.password ?? ''),
    ssl: body.ssl ?? false,
    sslValidateCert: body.sslValidateCert ?? true,
    environment: body.environment ?? 'development',
    isMDC: body.isMDC ?? true,
    isSystemDB: body.isSystemDB ?? false,
    sid: body.sid ?? '',
    instanceNumber: body.instanceNumber ?? '',
    tags: body.tags ?? [],
    notes: body.notes ?? '',
    status: 'unknown',
    healthScore: 0,
    lastChecked: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }
  // Quick connection test
  try {
    const rows = await queryHana(conn, "SELECT SYSTEM_ID, VERSION, USAGE FROM M_DATABASE")
    if (rows.length > 0) {
      conn.version = String(rows[0].VERSION ?? '')
      conn.status = 'connected'
      conn.healthScore = 100
    }
  } catch {
    conn.status = 'error'
  }
  conn.lastChecked = new Date().toISOString()
  saveConnection(conn)
  return NextResponse.json(conn, { status: 201 })
}
