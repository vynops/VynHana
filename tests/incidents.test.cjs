const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const crypto = require('node:crypto')
const Module = require('node:module')
const { spawn } = require('node:child_process')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const sandbox = process.env.VYNHANA_TEST_DATA_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'vynhana-incidents-'))
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : request, ...args)
}
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
}
process.chdir(sandbox)
process.env.VYNHANA_MONITOR_ENABLED = 'true'
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex')
const lib = name => require(path.join(root, 'src/lib', `${name}.ts`))
const write = (file, value) => {
  fs.mkdirSync(path.join(sandbox, 'data'), { recursive: true })
  fs.writeFileSync(path.join(sandbox, 'data', file), JSON.stringify(value))
}
const connection = { id: 'test-hana', name: 'Test HANA', host: '127.0.0.1', port: 39015, tags: [], notes: '', _isDemo: false }
const alert = rating => ({ ALERT_ID: 42, ALERT_RATING: rating, HOST: 'test-host', PORT: 39015, SERVICE_NAME: 'indexserver', ALERT_DETAILS: 'Test alert', ALERT_TIMESTAMP: '2026-10-07T00:00:00Z' })

if (process.argv.includes('--startup')) {
  const hana = lib('hana-client')
  hana.getHanaConnection = async () => ({})
  hana.execQuery = async () => [alert(5)]
  process.env.NEXT_RUNTIME = 'nodejs'
  process.env.VYNHANA_MONITOR_ENABLED = 'true'
  require(path.join(root, 'src/instrumentation.ts')).register().then(() => setImmediate(() => {
    assert.equal(lib('incident-monitor').monitorStatus().status, 'healthy')
    assert.equal(lib('incident-store').loadIncidents().length, 1)
    console.log('startup-monitor-passed')
  })).catch(error => { console.error(error); process.exitCode = 1 })
} else if (process.argv.includes('--resume')) {
  lib('notifications').processNotifications().catch(error => { console.error(error); process.exitCode = 1 })
} else {
  const { test, before, beforeEach, after } = require('node:test')
  const { NextRequest } = require('next/server')
  const auth = lib('auth')
  const store = lib('incident-store')
  const history = lib('operations-history')
  const notifications = lib('notifications')
  const monitor = lib('incident-monitor')
  const collection = require(path.join(root, 'src/app/api/incidents/route.ts'))
  const item = require(path.join(root, 'src/app/api/incidents/[id]/route.ts'))
  const historyRoute = require(path.join(root, 'src/app/api/incidents/history/route.ts'))
  const monitorRoute = require(path.join(root, 'src/app/api/incidents/monitor/route.ts'))
  const notificationRoute = require(path.join(root, 'src/app/api/incidents/notifications/route.ts'))
  const oncallRoute = require(path.join(root, 'src/app/api/oncall/[id]/route.ts'))
  const alertsRoute = require(path.join(root, 'src/app/api/alerts/route.ts'))
  let server, base, rejectChannels, counts, messages
  const actors = ['admin', 'editor', 'viewer'].map(role => ({ id: role, name: `Test ${role}`, email: `${role}@example.invalid`, role, active: true }))
  async function request(method, body, role = 'editor', url = '/api/incidents') {
    const token = role ? await auth.signToken(actors.find(actor => actor.role === role)) : null
    return new NextRequest(`http://localhost${url}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `vh_token=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  }
  const context = id => ({ params: Promise.resolve({ id }) })
  const readQueue = () => JSON.parse(fs.readFileSync(path.join(sandbox, 'data/notification-state.json'), 'utf8'))
  const child = mode => new Promise((resolve, reject) => {
    const process = spawn(global.process.execPath, [__filename, mode], { cwd: root, env: { ...global.process.env, VYNHANA_TEST_DATA_DIR: sandbox }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    process.stdout.on('data', data => { output += data })
    process.stderr.on('data', data => { output += data })
    process.on('error', reject)
    process.on('exit', code => code === 0 ? resolve(output) : reject(new Error(output)))
  })
  before(async () => {
    server = http.createServer((req, res) => {
      let body = ''
      req.on('data', data => { body += data })
      req.on('end', () => {
        const channel = req.url.slice(1)
        counts[channel] = (counts[channel] ?? 0) + 1
        messages.push({ channel, body: JSON.parse(body) })
        res.writeHead(rejectChannels.has(channel) ? 503 : 200)
        res.end('ok')
      })
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })
  beforeEach(() => {
    fs.rmSync(path.join(sandbox, 'data'), { recursive: true, force: true })
    write('connections.json', [connection])
    write('incidents.json', [])
    write('settings.json', {})
    write('oncall.json', { schedules: [], escalations: [] })
    write('users.json', actors)
    rejectChannels = new Set()
    counts = {}
    messages = []
  })
  after(async () => {
    await new Promise(resolve => server.close(resolve))
    process.chdir(root)
    fs.rmSync(sandbox, { recursive: true, force: true })
  })

  test('authenticated incident lifecycle retains attribution and deletion history', async () => {
    const created = await collection.POST(await request('POST', { title: 'Test incident', severity: 'critical', assignee: 'Test responder' }))
    assert.equal(created.status, 201)
    const incident = await created.json()
    assert.equal(incident.timeline[0].by, 'Test editor')
    const change = await item.PATCH(await request('PATCH', { status: 'investigating', note: 'Triaged', assignee: 'Another responder' }), context(incident.id))
    assert.equal(change.status, 200)
    assert.equal((await change.json()).timeline.length, 4)
    assert.equal((await item.DELETE(await request('DELETE', undefined, 'admin'), context(incident.id))).status, 409)
    await item.PATCH(await request('PATCH', { status: 'resolved' }), context(incident.id))
    assert.ok(store.loadIncidents()[0].resolvedAt)
    await item.PATCH(await request('PATCH', { status: 'open' }), context(incident.id))
    assert.equal(store.loadIncidents()[0].resolvedAt, undefined)
    await item.PATCH(await request('PATCH', { status: 'resolved' }), context(incident.id))
    assert.equal((await item.DELETE(await request('DELETE', undefined, 'admin'), context(incident.id))).status, 200)
    assert.equal(store.loadIncidents().length, 0)
    const response = await historyRoute.GET(await request('GET', undefined, 'viewer', `/api/incidents/history?incidentId=${incident.id}`))
    const events = await response.json()
    assert.ok(events.some(event => event.action === 'incident.created' && event.actor === 'editor'))
    assert.ok(events.some(event => event.action === 'incident.deleted' && event.actor === 'admin'))
    assert.ok(events.find(event => event.action === 'incident.deleted.requested').details.before.timeline.some(event => event.note === 'Triaged'))
  })

  test('real authentication rejects unauthenticated, viewer writes and editor deletion', async () => {
    assert.equal((await collection.POST(await request('POST', { title: 'Forbidden' }, null))).status, 401)
    assert.equal((await collection.POST(await request('POST', { title: 'Forbidden' }, 'viewer'))).status, 403)
    assert.equal((await item.DELETE(await request('DELETE', undefined, 'editor'), context('missing'))).status, 403)
    assert.equal((await historyRoute.GET(await request('GET', undefined, null))).status, 401)
    assert.equal((await monitorRoute.GET(await request('GET', undefined, null))).status, 401)
    write('users.json', actors.map(actor => ({ ...actor, active: false })))
    assert.equal((await collection.GET(await request('GET', undefined, 'admin'))).status, 401)
  })

  test('invalid inputs cannot overwrite identity, timeline or resolution timestamps', async () => {
    for (const body of [null, {}, { title: '' }, { title: 'Test', severity: 'invalid' }, { title: 'Test', tags: 'invalid' }]) {
      assert.equal((await collection.POST(await request('POST', body))).status, 400)
    }
    const incident = await (await collection.POST(await request('POST', { title: 'Test' }))).json()
    for (const body of [{ id: 'replacement' }, { timeline: [] }, { resolvedAt: 'forged' }, { severity: 'invalid' }, { status: 'invalid' }, { tags: [42] }, { note: 42 }, { title: '' }, null]) {
      assert.equal((await item.PATCH(await request('PATCH', body), context(incident.id))).status, 400)
    }
    assert.equal(store.loadIncidents()[0].id, incident.id)
    assert.equal(store.loadIncidents()[0].timeline.length, 1)
    assert.equal((await item.DELETE(await request('DELETE', undefined, 'admin'), context('missing'))).status, 404)
  })

  test('closing requires resolution and unchanged updates do not create duplicate history', async () => {
    const incident = await (await collection.POST(await request('POST', { title: 'Lifecycle test' }))).json()
    assert.equal((await item.PATCH(await request('PATCH', { status: 'closed' }), context(incident.id))).status, 409)
    assert.equal((await item.PATCH(await request('PATCH', {}), context(incident.id))).status, 400)
    const before = history.loadHistory().length
    assert.equal((await item.PATCH(await request('PATCH', { status: 'open' }), context(incident.id))).status, 200)
    assert.equal(history.loadHistory().length, before)
    await item.PATCH(await request('PATCH', { status: 'resolved' }), context(incident.id))
    assert.equal((await item.PATCH(await request('PATCH', { status: 'closed' }), context(incident.id))).status, 200)
  })

  test('distinct revisions with identical timestamps each queue an event', () => {
    const incident = store.createIncident({ title: 'Revision test', description: '', severity: 'low', status: 'open', tags: [] })
    store.saveIncident(incident)
    store.saveIncident({ ...incident, severity: 'critical' })
    assert.equal(Object.keys(readQueue().notifications).length, 2)
  })

  test('admin retry is audited and replays only failed configured channels', async () => {
    write('settings.json', { slackWebhook: `${base}/slack`, teamsWebhook: `${base}/teams` })
    rejectChannels.add('teams')
    const id = await notifications.notify({ title: 'Retry test', body: 'Test', source: 'Test', severity: 'high', eventId: 'admin-retry' })
    assert.equal((await notificationRoute.POST(await request('POST', { notificationId: id }, 'editor'))).status, 403)
    assert.equal((await notificationRoute.POST(await request('POST', { notificationId: 'missing' }, 'admin'))).status, 404)
    rejectChannels.clear()
    assert.equal((await notificationRoute.POST(await request('POST', { notificationId: id }, 'admin'))).status, 200)
    await notifications.processNotifications()
    assert.deepEqual(counts, { slack: 1, teams: 2 })
    assert.ok(history.loadHistory().some(event => event.action === 'notification.retry.requested' && event.actor === 'admin'))
    const response = await notificationRoute.GET(await request('GET', undefined, 'viewer'))
    assert.equal(response.status, 200)
    assert.ok(!JSON.stringify(await response.json()).includes(base))
  })

  test('incident escalation is attributed, updates the timeline and queues target notification', async () => {
    write('oncall.json', { schedules: [{ id: 'schedule', name: 'Test rotation', members: [{ id: 'primary', name: 'Primary', email: 'primary@example.invalid' }], currentOnCall: 'primary', escalation: [{ id: 'secondary', name: 'Secondary', email: 'secondary@example.invalid' }] }], escalations: [] })
    const incident = await (await collection.POST(await request('POST', { title: 'Escalation test' }))).json()
    const response = await oncallRoute.PATCH(await request('PATCH', { action: 'escalate', incidentId: incident.id, reason: 'Needs assistance' }), context('schedule'))
    assert.equal(response.status, 200)
    const escalation = await response.json()
    assert.equal(escalation.incidentId, incident.id)
    assert.ok(store.loadIncidents()[0].timeline.some(event => event.by === 'Test editor' && event.note.includes('Escalated')))
    assert.ok(history.loadHistory(incident.id).some(event => event.action === 'incident.escalated' && event.actor === 'editor'))
    const queued = Object.values(readQueue().notifications).find(entry => entry.payload.eventId.startsWith('escalation:'))
    assert.deepEqual(queued.payload.emailTo, ['secondary@example.invalid'])
    assert.equal((await oncallRoute.PATCH(await request('PATCH', { action: 'escalate', incidentId: 'missing' }), context('schedule'))).status, 404)
    await item.PATCH(await request('PATCH', { status: 'resolved' }), context(incident.id))
    assert.equal((await oncallRoute.PATCH(await request('PATCH', { action: 'escalate', incidentId: incident.id }), context('schedule'))).status, 409)
  })

  test('SMTP routes to configured, current on-call and escalation recipients with TLS on port 465', async () => {
    const nodemailer = require('nodemailer')
    const original = nodemailer.createTransport
    let options, message
    nodemailer.createTransport = settings => {
      options = settings
      return { sendMail: async mail => { message = mail; return { accepted: mail.to, rejected: [] } } }
    }
    try {
      write('settings.json', { smtpHost: 'smtp.example.invalid', smtpPort: 465, alertEmail: 'operations@example.invalid' })
      write('oncall.json', { schedules: [{ members: [{ id: 'primary', email: 'primary@example.invalid' }], currentOnCall: 'primary' }], escalations: [] })
      await notifications.sendEmail({ title: 'SMTP test', body: 'Test', source: 'Test', severity: 'critical', emailTo: ['secondary@example.invalid'] })
      assert.equal(options.secure, true)
      assert.deepEqual(message.to, ['operations@example.invalid', 'primary@example.invalid', 'secondary@example.invalid'])
      nodemailer.createTransport = () => ({ sendMail: async () => ({ accepted: ['operations@example.invalid'], rejected: ['primary@example.invalid'] }) })
      await assert.rejects(notifications.sendEmail({ title: 'Partial SMTP test', body: 'Test', source: 'Test', severity: 'critical' }), /did not accept all recipients/)
    } finally {
      nodemailer.createTransport = original
    }
  })

  test('automatic alerts dedupe, change severity, recover and reopen without browser requests', async () => {
    const query = async () => [alert(5)]
    assert.equal((await monitor.runMonitorCycle(query)).status, 'healthy')
    await monitor.runMonitorCycle(query)
    assert.equal(store.loadIncidents().length, 1)
    assert.equal(history.loadHistory().filter(event => event.action === 'incident.created').length, 1)
    await monitor.runMonitorCycle(async () => [alert(3)])
    assert.equal(store.loadIncidents()[0].severity, 'medium')
    await monitor.runMonitorCycle(async () => [alert(1)])
    assert.equal(store.loadIncidents()[0].status, 'resolved')
    await monitor.runMonitorCycle(query)
    assert.equal(store.loadIncidents()[0].status, 'open')
    assert.equal(store.loadIncidents().length, 1)
    await monitor.runMonitorCycle(async () => [])
    assert.equal(store.loadIncidents()[0].status, 'open')
    assert.equal(monitor.monitorStatus().stale, false)
  })

  test('HANA failures create one monitoring incident and resolve only after successful queries', async () => {
    const query = async () => { throw new Error('Test failure') }
    assert.equal((await monitor.runMonitorCycle(query)).status, 'degraded')
    await monitor.runMonitorCycle(query)
    assert.equal(store.loadIncidents().length, 1)
    assert.equal(store.loadIncidents()[0].status, 'open')
    await monitor.runMonitorCycle(async () => [])
    assert.equal(store.loadIncidents()[0].status, 'resolved')
  })

  test('demo sources never query or generate automatic incidents and heartbeat detects stale cycles', async () => {
    write('connections.json', [])
    const result = await monitor.runMonitorCycle(async () => { throw new Error('Demo queried') })
    assert.equal(result.status, 'demo')
    assert.equal(fs.existsSync(path.join(sandbox, 'data/notification-state.json')), false)
    write('monitor-state.json', { status: 'healthy', completedAt: '2000-01-01T00:00:00Z' })
    assert.equal(monitor.monitorStatus().stale, true)
  })

  test('webhooks deliver per channel, retain history and do not resend accepted channels', async () => {
    write('settings.json', { slackWebhook: `${base}/slack`, teamsWebhook: `${base}/teams`, customWebhook: `${base}/webhook` })
    rejectChannels.add('teams')
    const payload = { title: 'Test', body: 'Test message', severity: 'critical', source: 'Test', incidentId: 'test-incident', eventId: 'test-event' }
    await notifications.notify(payload)
    assert.deepEqual(counts, { slack: 1, teams: 1, webhook: 1 })
    await notifications.notify(payload)
    assert.deepEqual(counts, { slack: 1, teams: 1, webhook: 1 })
    const state = readQueue()
    const queued = Object.values(state.notifications)[0]
    assert.equal(queued.deliveries.email.status, 'skipped')
    assert.equal(queued.deliveries.teams.status, 'failed')
    queued.deliveries.teams.nextAttemptAt = 0
    write('notification-state.json', state)
    rejectChannels.clear()
    await notifications.processNotifications()
    assert.deepEqual(counts, { slack: 1, teams: 2, webhook: 1 })
    assert.ok(history.loadHistory('test-incident').some(event => event.action === 'notification.failed' && event.details.channel === 'teams'))
    assert.ok(history.loadHistory('test-incident').some(event => event.action === 'notification.accepted' && event.details.channel === 'teams'))
    assert.ok(messages.find(message => message.channel === 'slack').body.blocks)
    assert.equal(messages.find(message => message.channel === 'webhook').body.event, 'vynhana.alert')
    assert.ok(!JSON.stringify(history.loadHistory()).includes(base))
  })

  test('queued notifications survive process restart and retry exhaustion is auditable', async () => {
    write('settings.json', { slackWebhook: `${base}/slack` })
    notifications.enqueueNotification({ title: 'Restart test', body: 'Test', severity: 'high', source: 'Test', eventId: 'restart' })
    await child('--resume')
    assert.equal(counts.slack, 1)
    await child('--resume')
    assert.equal(counts.slack, 1)
    rejectChannels.add('slack')
    notifications.enqueueNotification({ title: 'Failure test', body: 'Test', severity: 'high', source: 'Test', eventId: 'failure' })
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const state = readQueue()
      for (const queued of Object.values(state.notifications)) queued.deliveries.slack.nextAttemptAt = 0
      write('notification-state.json', state)
      await notifications.processNotifications()
    }
    assert.equal(counts.slack, 6)
    assert.ok(history.loadHistory().some(event => event.action === 'notification.failed' && event.details.exhausted))
  })

  test('concurrent notification processing does not duplicate delivery', async () => {
    write('settings.json', { slackWebhook: `${base}/slack` })
    const payload = { title: 'Concurrent test', body: 'Test', severity: 'high', source: 'Test', eventId: 'concurrent' }
    await Promise.all([notifications.notify(payload), notifications.notify(payload), notifications.processNotifications()])
    assert.equal(counts.slack, 1)
  })

  test('server startup runs a monitoring cycle in a fresh process without HTTP traffic', async () => {
    assert.match(await child('--startup'), /startup-monitor-passed/)
    assert.equal(store.loadIncidents().length, 1)
    assert.equal(monitor.monitorStatus().status, 'healthy')
  })

  test('reading alerts has no notification side effects', async () => {
    const hana = lib('hana-client')
    const original = hana.queryHana
    hana.queryHana = async () => [alert(5)]
    try {
      assert.equal((await alertsRoute.GET(await request('GET', undefined, 'viewer', '/api/alerts'))).status, 200)
      assert.equal(fs.existsSync(path.join(sandbox, 'data/notification-state.json')), false)
    } finally {
      hana.queryHana = original
    }
  })

  test('corrupt incident storage fails closed instead of losing existing records', () => {
    fs.writeFileSync(path.join(sandbox, 'data/incidents.json'), 'invalid JSON')
    assert.throws(() => store.saveIncident(store.createIncident({ title: 'Test', description: '', severity: 'low', status: 'open', tags: [] })))
    assert.equal(fs.readFileSync(path.join(sandbox, 'data/incidents.json'), 'utf8'), 'invalid JSON')
  })

  test('incident mutations fail before persistence if audit storage is unavailable', () => {
    fs.mkdirSync(path.join(sandbox, 'data/operations-history.jsonl'))
    assert.throws(() => store.saveIncident(store.createIncident({ title: 'Audit failure', description: '', severity: 'low', status: 'open', tags: [] })))
    assert.equal(store.loadIncidents().length, 0)
  })

  test('on-call reader accepts legacy arrays and partial objects without losing records', () => {
    const oncall = lib('oncall-store')
    const schedule = { id: 'test-schedule', name: 'Test schedule', members: [], escalation: [], rotation: 'weekly', createdAt: '2026-10-07T00:00:00Z' }
    for (const value of [[], {}, null, { schedules: [] }, { escalations: [] }]) {
      write('oncall.json', value)
      assert.deepEqual(oncall.loadSchedules(), [])
      assert.deepEqual(oncall.loadEscalations(), [])
    }
    for (const value of [[schedule], { schedules: [schedule] }]) {
      write('oncall.json', value)
      assert.deepEqual(oncall.loadSchedules(), [schedule])
      assert.deepEqual(oncall.loadEscalations(), [])
      oncall.saveSchedule({ ...schedule, name: 'Updated schedule' })
      assert.equal(oncall.loadSchedules().length, 1)
      assert.equal(oncall.loadSchedules()[0].name, 'Updated schedule')
    }
    const escalation = { id: 'test-escalation', scheduleId: schedule.id, escalatedTo: 'Test responder', reason: 'Test', at: schedule.createdAt, resolved: false }
    write('oncall.json', { escalations: [escalation] })
    oncall.saveSchedule(schedule)
    assert.deepEqual(oncall.loadEscalations(), [escalation])
    write('oncall.json', { schedules: 'invalid' })
    assert.throws(() => oncall.saveSchedule(schedule), /Invalid on-call collections/)
    fs.writeFileSync(path.join(sandbox, 'data/oncall.json'), 'invalid JSON')
    assert.throws(() => oncall.saveSchedule(schedule))
    assert.equal(fs.readFileSync(path.join(sandbox, 'data/oncall.json'), 'utf8'), 'invalid JSON')
  })
}