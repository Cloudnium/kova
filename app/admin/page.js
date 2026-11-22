'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, money } from '../../lib/supabase'
import { useApp, useScope } from '../../lib/branch'
import { Bars, Err } from '../../lib/ui'
import { Ico } from '../../lib/icons'
import { fetchLowStock } from '../../lib/stockalert'
import { LineChart, BarChart, Donut } from '../../lib/charts'
const wk0 = () => { const d = new Date(); d.setDate(d.getDate() - 6); return d }
const dk = d => new Date(d).toLocaleDateString('en-CA')
const tot = a => a.reduce((s, x) => s + +x.total, 0)
const units = s => (s.items || []).reduce((b, i) => b + (+i.qty || 0), 0)
export default function Dashboard() {
  const { branch, allBranches, pending } = useApp(), scope = useScope()
  const [rows, setRows] = useState([]), [prods, setProds] = useState([]), [low, setLow] = useState([]), [err, setErr] = useState('')
  useEffect(() => { (async () => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5); d.setHours(0, 0, 0, 0)
    let all = [], from = 0, e = ''
    for (;;) {
      let q = supabase.from('sales').select('id,number,total,status,payment,voucher,source,customer_name,branch_id,created_at,items').eq('status', 'completado').gte('created_at', d.toISOString()).order('created_at', { ascending: false }); if (scope) q = q.eq('branch_id', scope)
      const r = await q.range(from, from + 999); if (r.error) { e = r.error.message; break }
      all = all.concat(r.data || []); if ((r.data || []).length < 1000 || from >= 19000) break; from += 1000
    }
    setErr(e); setRows(all)
    const p = await supabase.from('products').select('id,category'); setProds(p.data || [])
    const l = await fetchLowStock(scope); setLow(l.rows || [])
  })() }, [scope])
  const now = new Date(), y = new Date(); y.setDate(y.getDate() - 1)
  const today = rows.filter(s => dk(s.created_at) === dk(now)), yest = rows.filter(s => dk(s.created_at) === dk(y))
  const dlt = (a, b) => b ? Math.round((a - b) / b * 100) : (a ? 100 : 0)
  const D = ({ a, b }) => { const p = dlt(a, b); return <small className={p < 0 ? 'dn' : 'up'}>{p >= 0 ? '↗ +' : '↘ '}{p}% vs. ayer</small> }
  const cust = s => new Set(s.map(x => x.customer_name)).size
  const wk = Array.from({ length: 7 }, (_, k) => { const d = new Date(); d.setDate(d.getDate() - (6 - k)); const key = dk(d); return { l: d.toLocaleDateString('es-PE', { weekday: 'short' }).replace('.', ''), v: tot(rows.filter(s => dk(s.created_at) === key)) } })
  const mon = Array.from({ length: 6 }, (_, k) => { const d = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1); return { l: d.toLocaleDateString('es-PE', { month: 'short' }).replace('.', ''), v: tot(rows.filter(s => { const x = new Date(s.created_at); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() })) } })
  const cat = {}; prods.forEach(p => cat[p.id] = p.category || 'Otros')
  const w0 = dk(wk0()), week = rows.filter(s => dk(s.created_at) >= w0)
  const cm = {}; week.forEach(s => (s.items || []).forEach(i => { const c = cat[i.id] || 'Otros'; cm[c] = (cm[c] || 0) + (+i.price || 0) * (+i.qty || 0) }))
  const cats = Object.entries(cm).map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v).slice(0, 6)
  const bname = id => allBranches.find(b => b.id === id)?.name || ''
  const perBranch = !scope ? Object.entries(week.reduce((m, s) => (m[s.branch_id] = (m[s.branch_id] || 0) + +s.total, m), {})).map(([id, v]) => ({ l: bname(id) || '?', v })) : []
  const recent = rows.slice(0, 6), alerts = low.slice().sort((a, b) => (a.status === 'agotado' ? 0 : 1) - (b.status === 'agotado' ? 0 : 1) || a.total - b.total).slice(0, 6)
  return (<div className="dx"><div className="dx-head"><div><h1>Dashboard</h1><p className="sub">Resumen de {scope ? branch?.name : 'todas las sedes'}</p></div>
    <div className="dx-acts"><Link href="/admin/ventas" className="dx-btn g"><Ico n="cartplus" s={18} />Nueva venta</Link><Link href="/admin/productos" className="dx-btn b"><Ico n="plus" s={18} />Nuevo producto</Link><Link href="/admin/reportes" className="dx-btn p"><Ico n="chart" s={18} />Ver reportes</Link></div></div><Err e={err} />
    <div className="dx-kpis">
      <div className="dx-k g"><i className="dx-ic g"><Ico n="money" s={24} /></i><div><span>Ventas de hoy</span><b>{money(tot(today))}</b><D a={tot(today)} b={tot(yest)} /></div></div>
      <div className="dx-k b"><i className="dx-ic b"><Ico n="file" s={24} /></i><div><span>Comprobantes hoy</span><b>{today.length}</b><D a={today.length} b={yest.length} /></div></div>
      <div className="dx-k p"><i className="dx-ic p"><Ico n="users" s={24} /></i><div><span>Clientes atendidos</span><b>{cust(today)}</b><D a={cust(today)} b={cust(yest)} /></div></div>
      <div className="dx-k o"><i className="dx-ic o"><Ico n="box" s={24} /></i><div><span>Productos vendidos</span><b>{today.reduce((a, s) => a + units(s), 0)}</b><D a={today.reduce((a, s) => a + units(s), 0)} b={yest.reduce((a, s) => a + units(s), 0)} /></div></div>
      <Link href="/admin/pedidos" className="dx-k t"><i className="dx-ic t"><Ico n="bag" s={24} /></i><div><span>Pedidos web por confirmar</span><b>{pending}</b><small>Ver pedidos →</small></div></Link></div>
    <div className="dx-row c21"><div className="dx-p"><h3>Ventas de la Semana</h3><p className="dx-s">Últimos 7 días · {money(tot(week))}</p><LineChart series={[{ name: 'Ventas', color: '#22c55e', data: wk, area: true }]} /></div>
      <div className="dx-p"><h3>Ventas por Categoría</h3><p className="dx-s">Últimos 7 días</p><Donut data={cats} fmt={money} /></div></div>
    <div className="dx-p" style={{ marginBottom: 16 }}><h3>Evolución Mensual</h3><p className="dx-s">Ventas de los últimos 6 meses</p><BarChart data={mon} color="#3b82f6" /></div>
    <div className="dx-row c32"><div className="dx-p"><div className="dx-ph"><h3>Ventas Recientes</h3><Link href="/admin/comprobantes">Ver todas →</Link></div><div className="dx-tw"><table className="dx-t"><thead><tr><th>Comprobante</th><th className="hm">Cliente</th><th>Total</th><th>Pago</th></tr></thead><tbody>
      {recent.map(s => <tr key={s.id}><td><b>{s.number}</b><br /><small className="sub">{new Date(s.created_at).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></td><td className="hm">{s.customer_name || "—"}</td><td><b>{money(s.total)}</b></td><td><span className="dx-pill">{s.payment}</span></td></tr>)}{!recent.length && <tr><td colSpan="4">Aún no hay ventas.</td></tr>}</tbody></table></div></div>
      <div className="dx-p"><div className="dx-ph"><h3>Alertas de Stock</h3><Link href="/admin/almacen">Ver almacén →</Link></div><ul className="dx-al">
        {alerts.map(a => <li key={a.branch_id + a.product_id}><span className={'ai ' + (a.status === 'agotado' ? '' : 'w')}><Ico n="warn" s={20} /></span><div className="tx"><b>{a.name}</b><small>Mínimo: {a.min_stock} unidades{!scope ? ' · ' + a.branch_name : ''}</small></div><span className={'dx-pill ' + (a.status === 'agotado' ? 'r' : 'w')}>{a.status === 'agotado' ? 'Agotado' : 'Bajo'}</span></li>)}{!alerts.length && <li><div className="tx"><b>Todo en orden</b><small>No hay productos con stock bajo.</small></div></li>}</ul></div></div>
    {!scope && perBranch.length > 0 && <div className="dx-p"><h3>Ventas por sede</h3><p className="dx-s">Últimos 7 días</p><Bars data={perBranch} fmt={money} /></div>}</div>)
}
