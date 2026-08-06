import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryHana } from '@/lib/hana-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const connId = searchParams.get('connId')
  const conns = loadConnections().filter(c => !connId || c.id === connId)

  const all = await Promise.all(conns.map(async conn => {
    const [users, roles, grants, auditPolicies, privileges] = await Promise.all([
      queryHana(conn, `
        SELECT USER_NAME,
          'ACTIVE' AS USER_STATUS,
          LAST_SUCCESSFUL_CONNECT,
          LAST_INVALID_CONNECT_ATTEMPT, INVALID_CONNECT_ATTEMPTS,
          NULL AS PASSWORD_CHANGE_TIME, '' AS PASSWORD_POLICY, '' AS IS_RESTRICTED,
          IS_PASSWORD_LIFETIME_CHECK_ENABLED, CREATOR, CREATE_TIME
        FROM USERS
        ORDER BY USER_NAME`).catch(() => [] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT ROLE_NAME, ROLE_MODE, 'YES' AS IS_ENABLED, '' AS COMMENT, CREATE_TIME
        FROM ROLES
        ORDER BY ROLE_NAME`).catch(() => [] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT GRANTEE, GRANTEE_TYPE, GRANTOR, PRIVILEGE, OBJECT_TYPE,
          SCHEMA_NAME, OBJECT_NAME, IS_VALID, IS_GRANTABLE
        FROM GRANTED_PRIVILEGES
        ORDER BY GRANTEE, PRIVILEGE
        LIMIT 500`).catch(() => [] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT POLICY_NAME, STATUS, AUDIT_LEVEL, EVENT_STATUS,
          TRAIL_TYPE, RETENTION_DAY, CREATE_TIME
        FROM AUDIT_POLICIES
        ORDER BY POLICY_NAME`).catch(() => [] as Record<string, unknown>[]),
      queryHana(conn, `
        SELECT GRANTEE, ROLE_NAME, GRANTOR, IS_GRANTABLE
        FROM GRANTED_ROLES
        ORDER BY GRANTEE, ROLE_NAME
        LIMIT 200`).catch(() => [] as Record<string, unknown>[]),
    ])
    return { connId: conn.id, connName: conn.name, users, roles, grants, auditPolicies, privileges }
  }))

  return NextResponse.json(all)
}
