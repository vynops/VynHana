import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadIncidents, saveIncident, createIncident } from '@/lib/incident-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(loadIncidents())
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.title !== 'string' || !body.title.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (body.severity !== undefined && !['critical', 'high', 'medium', 'low'].includes(body.severity)) return NextResponse.json({ error: 'Invalid severity' }, { status: 400 })
  if (['description', 'assignee', 'connectionId', 'connectionName'].some(key => body[key] !== undefined && typeof body[key] !== 'string')) return NextResponse.json({ error: 'Invalid text field' }, { status: 400 })
  if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((tag: unknown) => typeof tag !== 'string'))) return NextResponse.json({ error: 'Invalid tags' }, { status: 400 })
  const inc = createIncident({
    title: body.title,
    description: body.description ?? '',
    severity: body.severity ?? 'medium',
    status: 'open',
    connectionId: body.connectionId,
    connectionName: body.connectionName,
    assignee: body.assignee,
    tags: body.tags ?? [],
  }, auth.name)
  saveIncident(inc, auth.id)
  return NextResponse.json(inc, { status: 201 })
}
