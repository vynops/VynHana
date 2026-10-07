import { loadSettings } from './settings-store'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { appendHistory, writeAtomic } from './operations-history'
import { isDemoWorkspace } from './connection-store'
import { loadSchedules } from './oncall-store'

export interface AlertPayload {
  title: string
  body: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  source: string
  url?: string
  incidentId?: string
  eventId?: string
  emailTo?: string[]
}

const TIMEOUT_MS = 10000
const DEDUPE_MS = 5 * 60 * 1000
const STATE_FILE = path.join(process.cwd(), 'data', 'notification-state.json')
const EMOJI: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: 'ℹ️' }

type Channel = 'slack' | 'teams' | 'email' | 'webhook'
interface Delivery {
  status: 'pending' | 'accepted' | 'failed' | 'skipped'
  attempts: number
  nextAttemptAt: number
}
interface Notification {
  id: string
  createdAt: number
  payload: AlertPayload
  deliveries: Partial<Record<Channel, Delivery>>
}
interface NotificationState { version: 2; notifications: Record<string, Notification> }
const runtime = globalThis as typeof globalThis & { vynhanaNotifications?: Set<string> }
const inFlight = runtime.vynhanaNotifications ??= new Set<string>()

function readState(): NotificationState {
  if (!fs.existsSync(STATE_FILE)) return { version: 2, notifications: {} }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  return state.version === 2 ? state : { version: 2, notifications: {} }
}

function emailRecipients(payload?: AlertPayload): string[] {
  const configured = (loadSettings().alertEmail ?? '').split(/[;,]/).map(value => value.trim()).filter(Boolean)
  const responders = isDemoWorkspace() ? [] : loadSchedules().flatMap(schedule => {
    const member = schedule.members.find(candidate => candidate.id === schedule.currentOnCall)
    return member?.email ? [member.email] : []
  })
  return [...new Set([...configured, ...responders, ...(payload?.emailTo ?? [])])]
}

function enabledChannels(payload?: AlertPayload): Channel[] {
  const settings = loadSettings()
  const enabled: Channel[] = []
  if (settings.slackWebhook) enabled.push('slack')
  if (settings.teamsWebhook) enabled.push('teams')
  if (settings.smtpHost && emailRecipients(payload).length) enabled.push('email')
  if (settings.customWebhook) enabled.push('webhook')
  return enabled
}

export async function sendSlack(payload: AlertPayload) {
  const url = loadSettings().slackWebhook
  if (!url) return
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS), body: JSON.stringify({ text: `${EMOJI[payload.severity] ?? '•'} *[${payload.severity.toUpperCase()}] ${payload.title}*`, blocks: [{ type: 'header', text: { type: 'plain_text', text: `${EMOJI[payload.severity] ?? '•'} ${payload.title}` } }, { type: 'section', text: { type: 'mrkdwn', text: payload.body } }, { type: 'context', elements: [{ type: 'mrkdwn', text: `*Source:* ${payload.source}` }] }] }) })
  if (!response.ok) throw new Error(`Slack webhook returned HTTP ${response.status}`)
}

export async function sendTeams(payload: AlertPayload) {
  const url = loadSettings().teamsWebhook
  if (!url) return
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS), body: JSON.stringify({ '@type': 'MessageCard', '@context': 'http://schema.org/extensions', summary: payload.title, themeColor: payload.severity === 'critical' ? 'FF0000' : '0078D7', sections: [{ activityTitle: `${EMOJI[payload.severity] ?? '•'} ${payload.title}`, activityText: payload.body, facts: [{ name: 'Source', value: payload.source }, { name: 'Severity', value: payload.severity }] }] }) })
  if (!response.ok) throw new Error(`Teams webhook returned HTTP ${response.status}`)
}

export async function sendCustomWebhook(payload: AlertPayload) {
  const url = loadSettings().customWebhook
  if (!url) return
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VynHana-Event': 'alert' }, signal: AbortSignal.timeout(TIMEOUT_MS), body: JSON.stringify({ event: 'vynhana.alert', source: payload.source, timestamp: new Date().toISOString(), payload }) })
  if (!response.ok) throw new Error(`Custom webhook returned HTTP ${response.status}`)
}

export async function sendEmail(payload: AlertPayload) {
  const settings = loadSettings()
  const recipients = emailRecipients(payload)
  if (!settings.smtpHost || !recipients.length) throw new Error('Email is not configured')
  const transporter = nodemailer.createTransport({ host: settings.smtpHost, port: settings.smtpPort ?? 587, secure: settings.smtpPort === 465, auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPass } : undefined, connectionTimeout: TIMEOUT_MS, greetingTimeout: TIMEOUT_MS, socketTimeout: TIMEOUT_MS })
  const result = await transporter.sendMail({ from: settings.smtpUser ?? 'vynhana@localhost', to: recipients, subject: `[VynHANA ${payload.severity.toUpperCase()}] ${payload.title}`, text: `${payload.title}\n\n${payload.body}\n\nSource: ${payload.source}` })
  if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP did not accept all recipients')
}

export function enqueueNotification(payload: AlertPayload): string {
  const key = crypto.createHash('sha256').update(payload.eventId ?? JSON.stringify(payload)).digest('hex')
  const state = readState()
  const previous = state.notifications[key]
  if (previous && (payload.eventId || Date.now() - previous.createdAt < DEDUPE_MS || Object.values(previous.deliveries).some(delivery => delivery.status === 'pending' || delivery.status === 'failed'))) return previous.id
  const notification: Notification = { id: crypto.randomUUID(), createdAt: Date.now(), payload, deliveries: {} }
  const channels = enabledChannels(payload)
  for (const channel of ['slack', 'teams', 'email', 'webhook'] as const) {
    notification.deliveries[channel] = { status: channels.includes(channel) ? 'pending' : 'skipped', attempts: 0, nextAttemptAt: 0 }
  }
  state.notifications[key] = notification
  writeAtomic(STATE_FILE, state)
  appendHistory({ actor: 'notifier', action: 'notification.queued', resourceId: payload.incidentId ?? notification.id, details: { notificationId: notification.id, channels, skippedChannels: Object.keys(notification.deliveries).filter(channel => !channels.includes(channel as Channel)) } })
  return notification.id
}

export async function processNotifications() {
  const senders = { slack: sendSlack, teams: sendTeams, email: sendEmail, webhook: sendCustomWebhook }
  for (const [key, notification] of Object.entries(readState().notifications)) {
    if (inFlight.has(key)) continue
    inFlight.add(key)
    try {
      for (const channel of Object.keys(notification.deliveries) as Channel[]) {
        const delivery = notification.deliveries[channel]!
        if (delivery.status === 'accepted' || delivery.status === 'skipped' || delivery.attempts >= 5 || delivery.nextAttemptAt > Date.now()) continue
        if (!enabledChannels(notification.payload).includes(channel)) continue
        delivery.attempts += 1
        delivery.nextAttemptAt = Date.now() + Math.min(30_000 * 2 ** (delivery.attempts - 1), 15 * 60_000)
        let state = readState()
        state.notifications[key].deliveries[channel] = delivery
        writeAtomic(STATE_FILE, state)
        appendHistory({ actor: 'notifier', action: 'notification.attempted', resourceId: notification.payload.incidentId ?? notification.id, details: { notificationId: notification.id, channel, attempt: delivery.attempts } })
        try {
          await senders[channel](notification.payload)
          delivery.status = 'accepted'
        } catch {
          delivery.status = 'failed'
        }
        state = readState()
        state.notifications[key].deliveries[channel] = delivery
        writeAtomic(STATE_FILE, state)
        appendHistory({ actor: 'notifier', action: `notification.${delivery.status}`, resourceId: notification.payload.incidentId ?? notification.id, details: { notificationId: notification.id, channel, attempt: delivery.attempts, exhausted: delivery.status === 'failed' && delivery.attempts >= 5 } })
      }
    } finally {
      inFlight.delete(key)
    }
  }
}

export async function notify(payload: AlertPayload) {
  const id = enqueueNotification(payload)
  await processNotifications()
  return id
}

export function queueIncidentNotification(incident: { id: string; title: string; description: string; status: string; severity: AlertPayload['severity']; updatedAt: string; connectionName?: string }) {
  const revision = crypto.createHash('sha256').update(JSON.stringify(incident)).digest('hex')
  return enqueueNotification({ title: `${incident.status.toUpperCase()}: ${incident.title}`, body: incident.description, severity: incident.status === 'resolved' || incident.status === 'closed' ? 'info' : incident.severity, source: incident.connectionName ?? 'VynHANA incidents', incidentId: incident.id, eventId: `incident:${incident.id}:${revision}` })
}

export function notificationStatus() {
  return Object.values(readState().notifications).map(notification => ({ id: notification.id, incidentId: notification.payload.incidentId, createdAt: new Date(notification.createdAt).toISOString(), deliveries: notification.deliveries }))
}

export function retryNotification(id: string, actor: string) {
  const state = readState()
  const notification = Object.values(state.notifications).find(entry => entry.id === id)
  if (!notification) return false
  const enabled = enabledChannels(notification.payload)
  const channels = (Object.keys(notification.deliveries) as Channel[]).filter(channel => notification.deliveries[channel]!.status !== 'accepted' && enabled.includes(channel))
  appendHistory({ actor, action: 'notification.retry.requested', resourceId: notification.payload.incidentId ?? notification.id, details: { notificationId: id, channels } })
  for (const channel of channels) notification.deliveries[channel] = { status: 'pending', attempts: 0, nextAttemptAt: 0 }
  writeAtomic(STATE_FILE, state)
  return true
}