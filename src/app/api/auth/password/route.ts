import { NextRequest, NextResponse } from 'next/server'
import { getSession, hashPassword, verifyPassword } from '@/lib/auth'
import { findUserByEmail, saveUser } from '@/lib/user-store'

const MIN_PASSWORD_LENGTH = 8

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const currentPassword = String(body.currentPassword ?? '')
  const newPassword = String(body.newPassword ?? '')
  const confirmation = String(body.confirmation ?? '')
  const user = findUserByEmail(session.email)

  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 })
  }
  if (newPassword !== confirmation) {
    return NextResponse.json({ error: 'New passwords do not match' }, { status: 400 })
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: 'New password must be different from the current password' }, { status: 400 })
  }

  saveUser({ ...user, passwordHash: hashPassword(newPassword) })
  return NextResponse.json({ ok: true })
}