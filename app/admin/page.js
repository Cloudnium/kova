'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, money } from '../../lib/supabase'
import { useApp, useScope } from '../../lib/branch'
import { AreaChart, Bars, byDay, byPay, sumItems, Err, useStockMap } from '../../lib/ui'
const dk = d => new Date(d).toLocaleDateString('en-CA')
export default function Dashboard() {
  const { branch, allBranches, pending } = useApp(), scope = useScope()
  const [rows, setRows] = useState([]), [prods, setProds] = useState([]), [sm] = useStockMap(), [err, setErr] = useState('')
  useEffect(() => { (async () => {
    const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0)
    let q = supabase.from('sales').select('*').gte('created_at', d.toISOString()); if (scope) q = q.eq('branch_id', scope)
    const r = await q; setErr(r.error?.message || ''); setRows(r.data || [])
    const p = await supabase.from('products').select('id,name').eq('active', true); setProds(p.data || [])
  })() }, [scope])
  const ok = rows.filter(s => s.status === 'completado'), today = ok.filter(s => dk(s.created_at) === dk(new Date())), y = new Date(); y.setDate(y.getDate() - 1)
  const tot = a => a.reduce((s, x) => s + +x.total, 0), ty = tot(ok.filter(s => dk(s.created_at) === dk(y)))
  const pct = ty ? Math.round((tot(today) - ty) / ty * 100) : 0
  const low = prods.map(p => ({ name: p.name, stock: sm[p.id]?.stock || 0 })).filter(p => p.stock < 10).sort((a, b) => a.stock - b.stock).slice(0, 6)
  const perBranch = !scope ? Object.entries(ok.reduce((m, s) => (m[s.branch_id] = (m[s.branch_id] || 0) + +s.total, m), {})).map(([id, v]) => ({ l: allBranches.find(b => b.id === id)?.name || '?', v })) : []
  return (<><h1>Dashboard</h1><p className="sub">Resumen de {scope ? branch?.name : 'todas las sedes'}</p><Err e={err} />
    <div className="kpis"><div className="kpi"><span>Ventas de hoy</span><b>{money(tot(today))}</b><small style={{ color: pct < 0 ? '#b91c1c' : 'var(--ok)' }}>{pct >= 0 ? '+' : ''}{pct}% vs. ayer</small></div>
      <div className="kpi"><span>Comprobantes hoy</span><b>{today.length}</b></div>
      <div className="kpi"><span>Clientes atendidos</span><b>{new Set(today.map(s => s.customer_name)).size}</b></div>
      <div className="kpi"><span>Productos vendidos</span><b>{today.reduce((a, s) => a + (s.items || []).reduce((b, i) => b + i.qty, 0), 0)}</b></div>
      <Link href="/admin/pedidos" className="kpi" style={{ borderLeftColor: '#f59e0b' }}><span>Pedidos web por confirmar</span><b>{pending}</b></Link></div>
    <div className="two"><div className="panel"><b>Ventas de la semana</b><AreaChart data={byDay(ok, 7)} /></div>
      <div className="panel"><b>Ventas por método de pago (7 días)</b><br /><br /><Bars data={byPay(ok)} fmt={money} /></div></div>
    <div className="two"><div className="panel"><b>Más vendidos (7 días)</b><br /><br /><Bars data={sumItems(ok).slice(0, 5)} /></div>
      <div className="panel"><b>Stock bajo en tienda</b><table><tbody>{low.map(p => <tr key={p.name}><td>{p.name}</td><td>{p.stock}</td></tr>)}{!low.length && <tr><td>Todo en orden.</td></tr>}</tbody></table></div></div>
    {!scope && perBranch.length > 0 && <div className="panel"><b>Ventas por sede (7 días)</b><br /><br /><Bars data={perBranch} fmt={money} /></div>}</>)
}
