import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadIncidents, saveIncident, deleteIncident } from '@/lib/incident-store'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const inc = loadIncidents().find(i => i.id === id)
  if (!inc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(inc)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const incs = loadIncidents()
  const idx = incs.findIndex(i => i.id === id)
  if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid incident update' }, { status: 400 })
  const allowed = ['title', 'description', 'severity', 'status', 'assignee', 'tags', 'note']
  if (Object.keys(body).some(key => !allowed.includes(key))) return NextResponse.json({ error: 'Unsupported incident field' }, { status: 400 })
  if (body.status !== undefined && !['open', 'investigating', 'resolved', 'closed'].includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  if (body.severity !== undefined && !['critical', 'high', 'medium', 'low'].includes(body.severity)) return NextResponse.json({ error: 'Invalid severity' }, { status: 400 })
  if (['title', 'description', 'assignee', 'note'].some(key => body[key] !== undefined && typeof body[key] !== 'string')) return NextResponse.json({ error: 'Invalid text field' }, { status: 400 })
  if (body.title !== undefined && !body.title.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((tag: unknown) => typeof tag !== 'string'))) return NextResponse.json({ error: 'Invalid tags' }, { status: 400 })
  const nowIso = new Date().toISOString()
  const prev = incs[idx]
  if (body.status === 'closed' && prev.status !== 'resolved' && prev.status !== 'closed') return NextResponse.json({ error: 'Resolve an incident before closing it' }, { status: 409 })
  if (!Object.keys(body).length) return NextResponse.json({ error: 'No changes supplied' }, { status: 400 })
  const { note, ...changes } = body
  if (!note && Object.keys(changes).every(field => JSON.stringify(changes[field]) === JSON.stringify(prev[field as keyof typeof prev]))) return NextResponse.json(prev)
  const updated = { ...prev, ...changes, timeline: [...prev.timeline], updatedAt: nowIso }

  for (const field of ['title', 'description', 'severity', 'assignee', 'tags']) {
    if (changes[field] !== undefined && JSON.stringify(changes[field]) !== JSON.stringify(prev[field as keyof typeof prev])) {
      updated.timeline.push({ at: nowIso, by: auth.name, note: `${field} changed from ${JSON.stringify(prev[field as keyof typeof prev] ?? null)} to ${JSON.stringify(changes[field])}` })
    }
  }

  if (prev.status !== body.status && body.status) {
    updated.timeline = [...(updated.timeline ?? []), {
      at: nowIso,
      by: (auth as { name?: string }).name ?? 'user',
      note: `Status changed from ${prev.status} to ${body.status}`,
    }]
  }

  if ((body.status === 'resolved' || body.status === 'closed') && !updated.resolvedAt) {
    updated.resolvedAt = nowIso
  }

  if (body.status && body.status !== 'resolved' && body.status !== 'closed') {
    updated.resolvedAt = undefined
  }

  if (note) {
    updated.timeline = [...(updated.timeline ?? []), {
      at: nowIso,
      by: (auth as { name?: string }).name ?? 'user',
      note,
    }]
  }
  saveIncident(updated, auth.id)
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const inc = loadIncidents().find(item => item.id === id)
  if (!inc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (inc.status !== 'resolved' && inc.status !== 'closed') return NextResponse.json({ error: 'Only resolved or closed incidents can be deleted' }, { status: 409 })
  deleteIncident(id, auth.id)
  return NextResponse.json({ ok: true })
}
