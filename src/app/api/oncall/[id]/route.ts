import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  loadSchedules,
  saveSchedule,
  deleteSchedule,
  rotateOnCall,
  addEscalation,
} from '@/lib/oncall-store'
import { loadIncidents, saveIncident } from '@/lib/incident-store'
import { appendHistory } from '@/lib/operations-history'
import { enqueueNotification } from '@/lib/notifications'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth

  const { id } = await ctx.params
  const body = await req.json()

  if (body.action === 'rotate') {
    const updated = rotateOnCall(id)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(updated)
  }

  if (body.action === 'escalate') {
    if (body.incidentId !== undefined && typeof body.incidentId !== 'string') return NextResponse.json({ error: 'Invalid incidentId' }, { status: 400 })
    if (body.reason !== undefined && typeof body.reason !== 'string') return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
    const schedules = loadSchedules()
    const schedule = schedules.find(s => s.id === id)
    if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const incidentId = String(body.incidentId ?? '')
    const incident = incidentId ? loadIncidents().find(i => i.id === incidentId) : undefined
    if (incidentId && !incident) return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    if (incident?.status === 'resolved' || incident?.status === 'closed') return NextResponse.json({ error: 'Cannot escalate a resolved incident' }, { status: 409 })

    const member = schedule.escalation?.[0] ?? schedule.members.find(m => m.id === schedule.currentOnCall)
    if (!member) return NextResponse.json({ error: 'No escalation target available' }, { status: 400 })

    const esc = addEscalation({
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      incidentId: incident?.id,
      incidentTitle: incident?.title,
      escalatedTo: `${member.name} <${member.email}>`,
      reason: String(body.reason ?? 'Manual escalation'),
    })
    appendHistory({ actor: auth.id, action: 'incident.escalated', resourceId: incident?.id ?? esc.id, details: { escalationId: esc.id, scheduleId: schedule.id, targetMemberId: member.id, reason: esc.reason } })
    if (incident) {
      const now = new Date().toISOString()
      saveIncident({ ...incident, updatedAt: now, timeline: [...incident.timeline, { at: now, by: auth.name, note: `Escalated to ${member.name}: ${esc.reason}` }] }, auth.id)
    }
    enqueueNotification({ title: `ESCALATED: ${incident?.title ?? schedule.name}`, body: esc.reason, severity: incident?.severity ?? 'high', source: 'VynHANA on-call', incidentId: incident?.id, eventId: `escalation:${esc.id}`, emailTo: member.email ? [member.email] : [] })
    return NextResponse.json(esc)
  }

  const schedules = loadSchedules()
  const idx = schedules.findIndex(s => s.id === id)
  if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = {
    ...schedules[idx],
    ...body,
    updatedAt: new Date().toISOString(),
  }
  saveSchedule(updated)
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const { id } = await ctx.params
  deleteSchedule(id)
  return NextResponse.json({ ok: true })
}
