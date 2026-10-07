import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadHistory } from '@/lib/operations-history'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const incidentId = req.nextUrl.searchParams.get('incidentId') ?? undefined
  return NextResponse.json(loadHistory(incidentId).slice(-500).reverse())
}