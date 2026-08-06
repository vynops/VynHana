'use client'

import useSWR from 'swr'
import { Server, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const SVC_COLOR: Record<string, string> = {
  nameserver: 'text-blue-400',
  indexserver: 'text-emerald-400',
  statisticsserver: 'text-yellow-400',
  webdispatcher: 'text-purple-400',
  xsengine: 'text-cyan-400',
  compileserver: 'text-orange-400',
}

export default function ServicesPage() {
  const { data, isLoading } = useSWR('/api/services', fetcher, { refreshInterval: 15000 })
  const rows = Array.isArray(data) ? data : []

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">HANA Services</h2>
        <p className="text-sm text-slate-400 mt-0.5">Real-time service status from M_SERVICES</p>
      </div>

      {isLoading ? (
        <div className="text-slate-600 text-sm py-8 text-center">Loading services…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-8 text-center text-slate-500 text-sm">
          No service data. Add a HANA connection first.
        </div>
      ) : (
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Service</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Host</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Port</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Status</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">Mem (MB)</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">Connections</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">Transactions</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Role</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">System</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((r: {
                SERVICE_NAME: string; HOST: string; PORT: number; ACTIVE_STATUS: string
                MEM_USED_MB: number; CONNECTION_COUNT: number; TRANSACTION_COUNT: number
                COORDINATOR_TYPE: string; connName: string
              }, i: number) => (
                <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Server className={cn('w-3.5 h-3.5', SVC_COLOR[String(r.SERVICE_NAME).toLowerCase()] ?? 'text-slate-400')} />
                      <span className="font-medium text-white text-xs">{String(r.SERVICE_NAME)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{String(r.HOST)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{String(r.PORT)}</td>
                  <td className="px-4 py-3">
                    {String(r.ACTIVE_STATUS) === 'YES'
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      : <XCircle className="w-4 h-4 text-red-400" />}
                  </td>
                  <td className="px-4 py-3 text-xs text-right text-slate-300">{Number(r.MEM_USED_MB).toFixed(0)}</td>
                  <td className="px-4 py-3 text-xs text-right text-slate-300">{String(r.CONNECTION_COUNT ?? 0)}</td>
                  <td className="px-4 py-3 text-xs text-right text-slate-300">{String(r.TRANSACTION_COUNT ?? 0)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{String(r.COORDINATOR_TYPE ?? '—')}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{String(r.connName)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
