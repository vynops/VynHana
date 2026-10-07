import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { isDemoWorkspace, loadConnections } from './connection-store'
import { appendHistory, writeAtomic } from './operations-history'
import { queueIncidentNotification } from './notifications'

const FILE = path.join(process.cwd(), 'data', 'incidents.json')

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low'
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed'

export interface Incident {
  id: string
  title: string
  description: string
  severity: IncidentSeverity
  status: IncidentStatus
  connectionId?: string
  connectionName?: string
  assignee?: string
  tags: string[]
  timeline: { at: string; by: string; note: string }[]
  createdAt: string
  updatedAt: string
  resolvedAt?: string
  alertKey?: string
}

function read(): Incident[] {
  if (!fs.existsSync(FILE)) return []
  const list = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  if (!Array.isArray(list)) throw new Error('Invalid incident store')
  return list
}
function write(list: Incident[]) {
  writeAtomic(FILE, list)
}

function demoIncidents(): Incident[] {
  const conn = loadConnections()[0]
  const now = Date.now()
  const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600 * 1000).toISOString()

  return [
    {
      id: 'demo-inc-1',
      title: 'Indexserver CPU saturation on reporting workload',
      description: 'Morning reporting burst pushed indexserver CPU over sustained threshold; query queue depth increased.',
      severity: 'high',
      status: 'investigating',
      connectionId: conn?.id,
      connectionName: conn?.name,
      assignee: 'Priya DBA',
      tags: ['cpu', 'reporting', 'production'],
      timeline: [
        { at: iso(6), by: 'monitor', note: 'Incident created from sustained CPU spike alert' },
        { at: iso(5.5), by: 'Priya DBA', note: 'Initial triage started; isolating expensive statements' },
      ],
      createdAt: iso(6),
      updatedAt: iso(5.5),
    },
    {
      id: 'demo-inc-2',
      title: 'Backup catalog lag detected',
      description: 'Scheduled backup completed later than expected and exceeded backup policy target by 42 minutes.',
      severity: 'medium',
      status: 'open',
      connectionId: conn?.id,
      connectionName: conn?.name,
      assignee: 'Alex DBA',
      tags: ['backup', 'sla'],
      timeline: [
        { at: iso(3), by: 'monitor', note: 'Incident created from backup freshness rule' },
      ],
      createdAt: iso(3),
      updatedAt: iso(3),
    },
    {
      id: 'demo-inc-3',
      title: 'Column store unload storm stabilized',
      description: 'Frequent unloads on BALDAT and INDX tables impacted user response times during peak traffic.',
      severity: 'critical',
      status: 'resolved',
      connectionId: conn?.id,
      connectionName: conn?.name,
      assignee: 'Maria SRE',
      tags: ['memory', 'column-store'],
      timeline: [
        { at: iso(28), by: 'monitor', note: 'Incident opened for repeated unload activity' },
        { at: iso(26), by: 'Maria SRE', note: 'Triggered manual delta merge and adjusted memory pressure thresholds' },
        { at: iso(22), by: 'Maria SRE', note: 'Incident resolved after unload rate normalized' },
      ],
      createdAt: iso(28),
      updatedAt: iso(22),
      resolvedAt: iso(22),
    },
  ]
}

export function loadIncidents(): Incident[] {
  const list = read()
  if (list.length === 0 && isDemoWorkspace()) return demoIncidents()
  return list
}

export function saveIncident(inc: Incident, actor = 'system') {
  const list = read()
  const idx = list.findIndex(i => i.id === inc.id)
  const action = idx >= 0 ? 'incident.updated' : 'incident.created'
  const request = appendHistory({ actor, action: `${action}.requested`, resourceId: inc.id, details: { before: idx >= 0 ? list[idx] : null, after: inc } })
  if (idx >= 0) list[idx] = inc
  else list.push(inc)
  write(list)
  appendHistory({ actor, action, resourceId: inc.id, details: { requestId: request.id } })
  queueIncidentNotification(inc)
}

export function deleteIncident(id: string, actor = 'system') {
  const list = read()
  const previous = list.find(inc => inc.id === id)
  if (!previous) return
  const request = appendHistory({ actor, action: 'incident.deleted.requested', resourceId: id, details: { before: previous } })
  write(list.filter(inc => inc.id !== id))
  appendHistory({ actor, action: 'incident.deleted', resourceId: id, details: { requestId: request.id } })
}

export function createIncident(partial: Omit<Incident, 'id' | 'createdAt' | 'updatedAt' | 'timeline'>, actor = 'system'): Incident {
  const now = new Date().toISOString()
  return {
    ...partial,
    id: `inc-${crypto.randomUUID()}`,
    timeline: [{ at: now, by: actor, note: 'Incident created' }],
    createdAt: now,
    updatedAt: now,
  }
}
