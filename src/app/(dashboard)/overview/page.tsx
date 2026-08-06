'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { Activity, AlertTriangle, Database, HardDrive, Server, Bell, MemoryStick, GitBranch, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { cn, formatBytes, timeAgo } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

function StatCard({ label, value, sub, color = 'text-white', icon: Icon, href }: {
  label: string; value: string | number; sub?: string; color?: string
  icon: React.ComponentType<{ className?: string }>; href?: string
}) {
  const inner = (
    <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5 hover:border-slate-700 transition-colors">
      <Icon className={cn('w-5 h-5 mb-3', color)} />
      <div className={cn('text-2xl font-black', color)}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
      {sub && <div className="text-xs text-slate-600 mt-1">{sub}</div>}
    </div>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}

function HealthBar({ score }: { score: number }) {
  const color = score >= 90 ? 'bg-emerald-500' : score >= 70 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold text-slate-400 w-8 text-right">{score}</span>
    </div>
  )
}

export default function OverviewPage() {
  const { data: systems, isLoading, mutate } = useSWR('/api/overview', fetcher, { refreshInterval: 30000 })
  const { data: incidents } = useSWR('/api/incidents', fetcher, { refreshInterval: 20000 })
  const { data: alerts } = useSWR('/api/alerts', fetcher, { refreshInterval: 20000 })

  const sysList = Array.isArray(systems) ? systems : []
  const incList = Array.isArray(incidents) ? incidents : []
  const alertList = Array.isArray(alerts) ? alerts.flatMap((a: { active: unknown[] }) => a.active ?? []) : []

  const healthy = sysList.filter((s: { status: string }) => s.status === 'connected').length
  const errored = sysList.filter((s: { status: string }) => s.status === 'error').length
  const openInc = incList.filter((i: { status: string }) => i.status === 'open').length
  const critAlerts = alertList.filter((a: unknown) => Number((a as Record<string, unknown>).ALERT_RATING ?? 0) >= 5).length

  return (
    <div className="space-y-6">
      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="HANA Systems" value={sysList.length} sub={`${healthy} healthy`} color="text-blue-400" icon={Database} href="/tenants" />
        <StatCard label="Active Alerts" value={alertList.length} sub={`${critAlerts} critical`} color={alertList.length > 0 ? 'text-red-400' : 'text-emerald-400'} icon={Bell} href="/alerts" />
        <StatCard label="Open Incidents" value={openInc} color={openInc > 0 ? 'text-orange-400' : 'text-emerald-400'} icon={AlertTriangle} href="/incidents" />
        <StatCard label="Systems Errored" value={errored} color={errored > 0 ? 'text-red-400' : 'text-emerald-400'} icon={XCircle} />
      </div>

      {/* System grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white">HANA Systems</h2>
          <button onClick={() => mutate()} className="text-slate-500 hover:text-slate-300 transition-colors">
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        </div>

        {isLoading && sysList.length === 0 ? (
          <div className="text-slate-600 text-sm py-8 text-center">Loading systems…</div>
        ) : sysList.length === 0 ? (
          <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-8 text-center">
            <Database className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No HANA connections yet.</p>
            <Link href="/settings" className="text-blue-400 text-sm hover:underline mt-1 block">Add a connection →</Link>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {sysList.map((s: {
              id: string; name: string; status: string; healthScore: number; version: string
              environment: string; host: string; memPct: number; memUsedGB: number; memLimitGB: number
              svcCount: number; activeSvcCount: number; lastChecked: string; systemId: string
            }) => (
              <div key={s.id} className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5 hover:border-slate-700 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-white text-sm">{s.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{s.host} {s.systemId ? `· SID: ${s.systemId}` : ''}</div>
                  </div>
                  <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5',
                    s.status === 'connected' ? 'bg-emerald-500/20 text-emerald-400' :
                    s.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  )}>{s.status}</span>
                </div>
                <HealthBar score={s.healthScore} />
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs font-bold text-white">{s.memPct}%</div>
                    <div className="text-[10px] text-slate-600">Memory</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{s.activeSvcCount}/{s.svcCount}</div>
                    <div className="text-[10px] text-slate-600">Services</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white capitalize">{s.environment}</div>
                    <div className="text-[10px] text-slate-600">Env</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-slate-600">{s.version ? `HANA ${s.version.split(' ')[0]}` : 'Unknown version'}</span>
                  <span className="text-[10px] text-slate-600">{timeAgo(s.lastChecked)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent incidents */}
      {incList.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-white mb-3">Recent Incidents</h2>
          <div className="rounded-2xl bg-[#0f1629] border border-slate-800 divide-y divide-slate-800">
            {incList.slice(0, 5).map((i: { id: string; title: string; severity: string; status: string; createdAt: string }) => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0',
                  i.severity === 'critical' ? 'bg-red-500' :
                  i.severity === 'high' ? 'bg-orange-500' :
                  i.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                )} />
                <span className="flex-1 text-sm text-slate-300 truncate">{i.title}</span>
                <span className="text-xs text-slate-500">{timeAgo(i.createdAt)}</span>
                <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5',
                  i.status === 'open' ? 'bg-red-500/20 text-red-400' :
                  i.status === 'investigating' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-emerald-500/20 text-emerald-400'
                )}>{i.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
