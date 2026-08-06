'use client'

import useSWR from 'swr'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Database, Plus, X, Loader2, Trash2, RefreshCw, CheckCircle2, XCircle, Edit2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Conn {
  id: string; name: string; host: string; port: number; database: string
  username: string; environment: string; status: string; healthScore: number
  version: string; isMDC: boolean; isSystemDB: boolean; sid: string
  instanceNumber: string; tags: string[]; lastChecked: string; notes: string
  ssl: boolean
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5',
      status === 'connected' ? 'bg-emerald-500/20 text-emerald-400' :
      status === 'error' ? 'bg-red-500/20 text-red-400' :
      'bg-slate-500/20 text-slate-400'
    )}>{status}</span>
  )
}

function TenantsPageInner() {
  const { data, isLoading, mutate } = useSWR('/api/connections', fetcher)
  const { data: tenantData } = useSWR('/api/tenants', fetcher, { refreshInterval: 60000 })
  const searchParams = useSearchParams()
  const [showAdd, setShowAdd] = useState(searchParams.get('add') === 'true')
  const [form, setForm] = useState({ name: '', host: '', port: '39015', database: 'SYSTEMDB', username: 'SYSTEM', password: '', ssl: false, sslValidateCert: true, environment: 'production', isMDC: true, isSystemDB: false, sid: '', instanceNumber: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, boolean>>({})
  const [editConn, setEditConn] = useState<Conn | null>(null)
  const [editForm, setEditForm] = useState({ name: '', host: '', port: '39015', database: '', username: '', password: '', ssl: false, sslValidateCert: true, environment: 'production', isMDC: true, isSystemDB: false, sid: '', instanceNumber: '', notes: '' })

  const conns: Conn[] = Array.isArray(data) ? data : []
  const tenants = Array.isArray(tenantData) ? tenantData : []

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setShowAdd(false)
    mutate()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this HANA connection?')) return
    await fetch(`/api/connections/${id}`, { method: 'DELETE' })
    mutate()
  }

  function handleEditOpen(conn: Conn) {
    setEditForm({ name: conn.name, host: conn.host, port: String(conn.port), database: conn.database, username: conn.username, password: '', ssl: conn.ssl, sslValidateCert: true, environment: conn.environment, isMDC: conn.isMDC, isSystemDB: conn.isSystemDB, sid: conn.sid ?? '', instanceNumber: conn.instanceNumber ?? '', notes: conn.notes ?? '' })
    setEditConn(conn)
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editConn) return
    setSaving(true)
    const body: Record<string, unknown> = { ...editForm, port: Number(editForm.port) }
    if (!editForm.password) delete body.password
    await fetch(`/api/connections/${editConn.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    setEditConn(null)
    mutate()
  }

  async function handleTest(id: string) {
    setTesting(id)
    const r = await fetch(`/api/connections/${id}/test`, { method: 'POST' })
    const d = await r.json()
    setTestResult(prev => ({ ...prev, [id]: d.ok }))
    setTesting(null)
    mutate()
  }

  const f = (k: keyof typeof form, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">HANA Connections</h2>
          <p className="text-sm text-slate-400 mt-0.5">Manage SAP HANA system connections</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Connection
        </button>
      </div>

      {/* Connection list */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /><span>Loading…</span>
        </div>
      ) : conns.length === 0 ? (
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-10 text-center">
          <Database className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">No connections yet. Add your first HANA system.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {conns.map(conn => {
            const tenInfo = tenants.find((t: { connId: string }) => t.connId === conn.id)
            return (
              <div key={conn.id} className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      {conn.name}
                      <StatusBadge status={conn.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {conn.host}:{conn.port} · {conn.database}
                      {conn.sid && ` · SID: ${conn.sid}`}
                      {conn.isMDC && <span className="ml-2 text-blue-400 font-bold text-[10px]">MDC</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleTest(conn.id)} disabled={testing === conn.id}
                      className="p-1.5 text-slate-500 hover:text-blue-400 transition-colors" title="Refresh / test connection">
                      {testing === conn.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleEditOpen(conn)}
                      className="p-1.5 text-slate-500 hover:text-amber-400 transition-colors" title="Edit connection">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(conn.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 transition-colors" title="Delete connection">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-800/40 rounded-lg py-2">
                    <div className="text-sm font-bold text-white">{conn.healthScore}</div>
                    <div className="text-[10px] text-slate-500">Health</div>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg py-2">
                    <div className="text-sm font-bold text-white capitalize">{conn.environment}</div>
                    <div className="text-[10px] text-slate-500">Env</div>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg py-2">
                    <div className="text-sm font-bold text-white">{conn.ssl ? 'SSL' : 'Plain'}</div>
                    <div className="text-[10px] text-slate-500">Transport</div>
                  </div>
                </div>

                {/* MDC Tenants */}
                {tenInfo?.tenants?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Tenant DBs</div>
                    <div className="flex flex-wrap gap-1">
                      {tenInfo.tenants.map((t: { DATABASE_NAME: string; ACTIVE_STATUS: string }) => (
                        <span key={String(t.DATABASE_NAME)} className={cn('text-[10px] font-semibold rounded px-2 py-0.5',
                          t.ACTIVE_STATUS === 'YES' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        )}>
                          {String(t.DATABASE_NAME)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 text-[10px] text-slate-600">
                  {conn.version || 'Version unknown'} · Last checked: just now
                </div>

                {conn.id in testResult && (
                  <div className={cn('mt-2 text-xs flex items-center gap-1',
                    testResult[conn.id] ? 'text-emerald-400' : 'text-red-400')}>
                    {testResult[conn.id] ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {testResult[conn.id] ? 'Connection successful' : 'Connection failed'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Edit connection modal */}
      {editConn && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f1629] border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-white">Edit Connection</h3>
              <button onClick={() => setEditConn(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Display Name *</label>
                  <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Host *</label>
                  <input value={editForm.host} onChange={e => setEditForm(p => ({ ...p, host: e.target.value }))} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Port</label>
                  <input value={editForm.port} onChange={e => setEditForm(p => ({ ...p, port: e.target.value }))} type="number"
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Database Name</label>
                  <input value={editForm.database} onChange={e => setEditForm(p => ({ ...p, database: e.target.value }))}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">SID</label>
                  <input value={editForm.sid} onChange={e => setEditForm(p => ({ ...p, sid: e.target.value }))}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Instance #</label>
                  <input value={editForm.instanceNumber} onChange={e => setEditForm(p => ({ ...p, instanceNumber: e.target.value }))}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Username *</label>
                  <input value={editForm.username} onChange={e => setEditForm(p => ({ ...p, username: e.target.value }))} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">New Password <span className="text-slate-600 font-normal">(leave blank to keep)</span></label>
                  <input type="password" value={editForm.password} onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Environment</label>
                  <select value={editForm.environment} onChange={e => setEditForm(p => ({ ...p, environment: e.target.value }))}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                    <option value="test">Test</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.ssl} onChange={e => setEditForm(p => ({ ...p, ssl: e.target.checked }))} className="accent-blue-500" />
                  <span className="text-slate-300">SSL/TLS</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.isMDC} onChange={e => setEditForm(p => ({ ...p, isMDC: e.target.checked }))} className="accent-blue-500" />
                  <span className="text-slate-300">MDC Mode</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.isSystemDB} onChange={e => setEditForm(p => ({ ...p, isSystemDB: e.target.checked }))} className="accent-blue-500" />
                  <span className="text-slate-300">System DB</span>
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditConn(null)}
                  className="flex-1 border border-slate-700 text-slate-300 text-sm font-semibold py-2 rounded-lg hover:bg-slate-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add connection modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f1629] border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-white">Add HANA Connection</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Display Name *</label>
                  <input value={form.name} onChange={e => f('name', e.target.value)} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="Production HANA" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Host *</label>
                  <input value={form.host} onChange={e => f('host', e.target.value)} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="hana-host.example.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Port</label>
                  <input value={form.port} onChange={e => f('port', e.target.value)} type="number"
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="39015" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Database Name</label>
                  <input value={form.database} onChange={e => f('database', e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="SYSTEMDB" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">SID</label>
                  <input value={form.sid} onChange={e => f('sid', e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="HDB" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Instance #</label>
                  <input value={form.instanceNumber} onChange={e => f('instanceNumber', e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="00" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Username *</label>
                  <input value={form.username} onChange={e => f('username', e.target.value)} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="SYSTEM" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Password *</label>
                  <input type="password" value={form.password} onChange={e => f('password', e.target.value)} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Environment</label>
                  <select value={form.environment} onChange={e => f('environment', e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                    <option value="test">Test</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.ssl} onChange={e => f('ssl', e.target.checked)} className="accent-blue-500" />
                  <span className="text-slate-300">SSL/TLS</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isMDC} onChange={e => f('isMDC', e.target.checked)} className="accent-blue-500" />
                  <span className="text-slate-300">MDC Mode</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isSystemDB} onChange={e => f('isSystemDB', e.target.checked)} className="accent-blue-500" />
                  <span className="text-slate-300">System DB</span>
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Optional notes…" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 border border-slate-700 text-slate-300 text-sm font-semibold py-2 rounded-lg hover:bg-slate-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Adding…' : 'Add Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TenantsPage() {
  return (
    <Suspense>
      <TenantsPageInner />
    </Suspense>
  )
}
