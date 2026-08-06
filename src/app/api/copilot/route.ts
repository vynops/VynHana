import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { askCopilotDetailed, HANA_COPILOT_SYSTEM } from '@/lib/copilot'
import {
  addCopilotHistoryEntry,
  clearCopilotHistory,
  getCopilotUsageSummary,
  loadCopilotHistory,
} from '@/lib/copilot-history-store'
import { loadConnections } from '@/lib/connection-store'
import { queryHana } from '@/lib/hana-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  return NextResponse.json({
    history: loadCopilotHistory(),
    usage: getCopilotUsageSummary(),
  })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  clearCopilotHistory()
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { message, connId, history } = await req.json()
  if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 })

  // Optionally attach live HANA context
  let context = ''
  if (connId) {
    const conn = loadConnections().find(c => c.id === connId)
    if (conn) {
      const [db, svc] = await Promise.all([
        queryHana(conn, 'SELECT SYSTEM_ID, VERSION, USAGE FROM M_DATABASE LIMIT 1'),
        queryHana(conn, 'SELECT COUNT(*) AS SVC FROM M_SERVICES'),
      ])
      context = `\n\nConnected HANA System: ${conn.name} | Version: ${db[0]?.VERSION ?? 'unknown'} | Active services: ${svc[0]?.SVC ?? 0}`
    }
  }

  const systemPrompt = HANA_COPILOT_SYSTEM + context

  // Build conversation
  const historyStr = Array.isArray(history)
    ? history.slice(-6).map((h: { role: string; content: string }) => `${h.role}: ${h.content}`).join('\n')
    : ''

  const userMsg = historyStr ? `${historyStr}\nuser: ${message}` : message
  const result = await askCopilotDetailed(systemPrompt, userMsg)
  const connName = connId ? loadConnections().find(c => c.id === connId)?.name : undefined

  const saved = addCopilotHistoryEntry({
    connId,
    connName,
    prompt: message,
    reply: result.reply,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
  })

  return NextResponse.json({
    reply: result.reply,
    usage: {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
    },
    historyEntry: saved,
  })
}
