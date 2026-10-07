import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const FILE = path.join(process.cwd(), 'data', 'operations-history.jsonl')

export interface HistoryEvent {
  id: string
  at: string
  actor: string
  action: string
  resourceId: string
  details: Record<string, unknown>
}

export function appendHistory(event: Omit<HistoryEvent, 'id' | 'at'>) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const record = { ...event, id: crypto.randomUUID(), at: new Date().toISOString() }
  const descriptor = fs.openSync(FILE, 'a', 0o600)
  try {
    fs.writeSync(descriptor, `${JSON.stringify(record)}\n`)
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  return record
}

export function loadHistory(resourceId?: string): HistoryEvent[] {
  if (!fs.existsSync(FILE)) return []
  const events = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as HistoryEvent)
  return resourceId ? events.filter(event => event.resourceId === resourceId) : events
}

export function writeAtomic(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  const descriptor = fs.openSync(temporary, 'wx', 0o600)
  try {
    fs.writeSync(descriptor, JSON.stringify(value, null, 2))
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  fs.renameSync(temporary, file)
}