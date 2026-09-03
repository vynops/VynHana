import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, requireRole } from '@/lib/auth'
import { deleteUser, loadUsers, saveUser } from '@/lib/user-store'

const MIN_PASSWORD_LENGTH = 8
const ROLES = ['admin', 'editor', 'viewer'] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const user = loadUsers().find(item => item.id === id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json()
  const hasPassword = typeof body.password === 'string'
  const hasRole = typeof body.role === 'string'
  const hasActive = typeof body.active === 'boolean'
  if (!hasPassword && !hasRole && !hasActive) {
    return NextResponse.json({ error: 'Password, role, or active status is required' }, { status: 400 })
  }

  if (hasPassword && body.password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 })
  }

  if (hasRole && !ROLES.includes(body.role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const activeAdminCount = loadUsers().filter(item => item.role === 'admin' && item.active !== false).length
  if (user.role === 'admin' && user.active !== false && activeAdminCount === 1 && ((hasRole && body.role !== 'admin') || (hasActive && !body.active))) {
    return NextResponse.json({ error: 'At least one active administrator is required' }, { status: 400 })
  }

  saveUser({
    ...user,
    ...(hasPassword ? { passwordHash: hashPassword(body.password) } : {}),
    ...(hasRole ? { role: body.role } : {}),
    ...(hasActive ? { active: body.active } : {}),
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const users = loadUsers()
  const user = users.find(item => item.id === id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const activeAdminCount = users.filter(item => item.role === 'admin' && item.active !== false).length
  if (user.role === 'admin' && user.active !== false && activeAdminCount === 1) {
    return NextResponse.json({ error: 'At least one active administrator is required' }, { status: 400 })
  }

  deleteUser(id)
  return NextResponse.json({ ok: true })
}