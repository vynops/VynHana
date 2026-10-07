import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { loadConnections, isDemoConnection, type HanaConnection } from './connection-store'
import { getHanaConnection, execQuery } from './hana-client'
import { loadIncidents, createIncident, saveIncident, type Incident, type IncidentSeverity } from './incident-store'
import { loadSettings } from './settings-store'
import { appendHistory, writeAtomic } from './operations-history'
import { processNotifications, queueIncidentNotification } from './notifications'

const STATE_FILE = path.join(process.cwd(), 'data', 'monitor-state.json')
export const ALERT_SQL = `SELECT ALERT_ID, ALERT_TIMESTAMP, ALERT_RATING, ALERT_DETAILS, HOST, PORT, SERVICE_NAME
FROM (SELECT ALERT_ID, ALERT_TIMESTAMP, ALERT_RATING, ALERT_DETAILS, HOST, PORT, SERVICE_NAME,
ROW_NUMBER() OVER (PARTITION BY ALERT_ID, HOST, PORT, SERVICE_NAME ORDER BY ALERT_TIMESTAMP DESC) AS RN
FROM SYS.M_ALERTS) WHERE RN = 1`

function updateStatus(incident: Incident, status: Incident['status'], note: string, severity = incident.severity) {
  const now = new Date().toISOString()
  saveIncident({ ...incident, status, severity, updatedAt: now, resolvedAt: status === 'resolved' ? now : undefined, timeline: [...incident.timeline, { at: now, by: 'monitor', note }] }, 'monitor')
}

export function reconcileAlerts(connection: HanaConnection, rows: Record<string, unknown>[]) {
  for (const row of rows) {
    if (row.ALERT_ID === undefined || !Number.isFinite(Number(row.ALERT_RATING))) throw new Error('Invalid alert row')
    const key = crypto.createHash('sha256').update(JSON.stringify([connection.id, row.ALERT_ID, row.HOST, row.PORT, row.SERVICE_NAME])).digest('hex')
    const previous = loadIncidents().filter(incident => incident.alertKey === key).at(-1)
    const rating = Number(row.ALERT_RATING)
    if (rating < 3) {
      if (previous && (previous.status === 'open' || previous.status === 'investigating')) updateStatus(previous, 'resolved', 'HANA reported a recovered alert rating')
      continue
    }
    const severity: IncidentSeverity = rating >= 5 ? 'critical' : rating >= 4 ? 'high' : 'medium'
    if (!previous) {
      const incident = createIncident({ title: `HANA alert ${String(row.ALERT_ID)}`, description: String(row.ALERT_DETAILS ?? 'HANA reported an alert'), severity, status: 'open', connectionId: connection.id, connectionName: connection.name, tags: ['hana-alert', 'automatic'], alertKey: key }, 'monitor')
      saveIncident(incident, 'monitor')
    } else if (previous.status === 'resolved' || previous.status === 'closed' || previous.severity !== severity) {
      updateStatus(previous, previous.status === 'investigating' ? 'investigating' : 'open', `HANA alert active with severity ${severity}`, severity)
    }
  }
}

export async function readAlerts(connection: HanaConnection) {
  const client = await getHanaConnection(connection)
  if (!client) throw new Error('HANA connection unavailable')
  return execQuery(client, ALERT_SQL)
}

export async function runMonitorCycle(query = readAlerts) {
  const startedAt = new Date().toISOString()
  const previous = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {}
  writeAtomic(STATE_FILE, { status: 'running', startedAt, completedAt: previous.completedAt, pid: process.pid })
  const connections = loadConnections().filter(connection => !isDemoConnection(connection))
  const results: { connectionId: string; status: string; alerts?: number }[] = []
  for (const connection of connections) {
    const key = `monitor-health:${connection.id}`
    try {
      const rows = await query(connection)
      reconcileAlerts(connection, rows)
      const failure = loadIncidents().find(incident => incident.alertKey === key && (incident.status === 'open' || incident.status === 'investigating'))
      if (failure) updateStatus(failure, 'resolved', 'HANA monitoring query succeeded')
      results.push({ connectionId: connection.id, status: 'healthy', alerts: rows.length })
    } catch {
      results.push({ connectionId: connection.id, status: 'failed' })
      const previous = loadIncidents().find(incident => incident.alertKey === key && (incident.status === 'open' || incident.status === 'investigating'))
      if (!previous) {
        saveIncident(createIncident({ title: 'HANA monitoring query failed', description: 'Could not retrieve HANA alerts. Check connectivity, credentials and monitoring privileges.', severity: 'high', status: 'open', connectionId: connection.id, connectionName: connection.name, tags: ['monitor-health', 'automatic'], alertKey: key }, 'monitor'), 'monitor')
      }
    }
  }
  for (const incident of loadIncidents().filter(incident => !incident.id.startsWith('demo-'))) queueIncidentNotification(incident)
  await processNotifications()
  const status = results.some(result => result.status === 'failed') ? 'degraded' : connections.length ? 'healthy' : 'demo'
  writeAtomic(STATE_FILE, { status, startedAt, completedAt: new Date().toISOString(), pid: process.pid, connections: results })
  return { status, connections: results }
}

export function monitorStatus() {
  if (process.env.VYNHANA_MONITOR_ENABLED === 'false') return { status: 'disabled', stale: true }
  if (!fs.existsSync(STATE_FILE)) return { status: 'not-started', stale: true }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  const configured = Number(loadSettings().monitorIntervalSec ?? 60)
  const interval = Number.isFinite(configured) ? Math.max(15, Math.min(configured, 3600)) : 60
  return { ...state, stale: !state.completedAt || Date.now() - Date.parse(state.completedAt) > Math.max(interval * 3, 180) * 1000 }
}

const runtime = globalThis as typeof globalThis & { vynhanaMonitorStarted?: boolean }
export function startIncidentMonitor() {
  if (runtime.vynhanaMonitorStarted || process.env.VYNHANA_MONITOR_ENABLED === 'false') return
  runtime.vynhanaMonitorStarted = true
  const tick = async () => {
    try {
      await runMonitorCycle()
    } catch {
      writeAtomic(STATE_FILE, { status: 'failed', completedAt: new Date().toISOString(), pid: process.pid })
      appendHistory({ actor: 'monitor', action: 'monitor.failed', resourceId: 'monitor', details: {} })
      console.error('[monitor] Cycle failed; inspect monitoring state and history')
    } finally {
      const configured = Number(loadSettings().monitorIntervalSec ?? 60)
      const interval = Number.isFinite(configured) ? Math.max(15, Math.min(configured, 3600)) : 60
      setTimeout(tick, interval * 1000).unref()
    }
  }
  void tick()
}