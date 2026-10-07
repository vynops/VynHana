import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { notificationStatus, retryNotification } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(notificationStatus())
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  if (!body || typeof body.notificationId !== 'string') return NextResponse.json({ error: 'notificationId is required' }, { status: 400 })
  if (!retryNotification(body.notificationId, auth.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ queued: true })
}