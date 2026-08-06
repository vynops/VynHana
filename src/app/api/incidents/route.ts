import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadIncidents, saveIncident, createIncident } from '@/lib/incident-store'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(loadIncidents())
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const inc = createIncident({
    title: body.title,
    description: body.description ?? '',
    severity: body.severity ?? 'medium',
    status: 'open',
    connectionId: body.connectionId,
    connectionName: body.connectionName,
    assignee: body.assignee,
    tags: body.tags ?? [],
  })
  saveIncident(inc)
  return NextResponse.json(inc, { status: 201 })
}
