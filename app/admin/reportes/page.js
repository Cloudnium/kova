'use client'
import { useState } from 'react'
import { money } from '../../../lib/supabase'
import { useApp, useScope } from '../../../lib/branch'
import { useTable, useStockMap, Head, Err, AreaChart, Bars, byDay, byPay, sumItems } from '../../../lib/ui'
export default function Reportes() {
  const { branch, allBranches } = useApp(), scope = useScope()
  const [ss, , e1] = useTable('sales', 'created_at', 5000, true), [ex, , e2] = useTable('expenses', 'created_at', 5000, true), [ps] = useTable('products', 'name'), [sm] = useStockMap()
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toLocaleDateString('en-CA') }), [to, setTo] = useState(new Date().toLocaleDateString('en-CA')), [vo, setVo] = useState(''), [src, setSrc] = useState('')
  const inR = d => { const k = new Date(d).toLocaleDateString('en-CA'); return k >= from && k <= to }
  const sales = ss.filter(s => s.status === 'completado' && inR(s.created_at) && (!vo || s.voucher === vo) && (!src || s.source === src)), egr = ex.filter(e => inR(e.created_at))
  const tv = sales.reduce((a, s) => a + +s.total, 0), te = egr.reduce((a, e) => a + +e.amount, 0), uds = sumItems(sales)
  const bname = id => allBranches.find(b => b.id === id)?.name || '?'
  const perBranch = Object.entries(sales.reduce((m, s) => (m[s.branch_id] = (m[s.branch_id] || 0) + +s.total, m), {})).map(([id, v]) => ({ l: bname(id), v }))
  const bySrc = Object.entries(sales.reduce((m, s) => { const k = s.source === 'web' ? 'Web' : 'Tienda'; m[k] = (m[k] || 0) + +s.total; return m }, {})).map(([l, v]) => ({ l, v }))
  const csv = () => { const t = 'Número,Fecha,Sede,Origen,Cliente,Tipo,Método,Total\n' + sales.map(s => [s.number, s.created_at, bname(s.branch_id), s.source, `"${s.customer_name}"`, s.voucher, s.payment, s.total].join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv' })); a.download = 'reporte-ventas.csv'; a.click() }
  const K = ({ l, v, s, c = 'var(--red)' }) => <div className="kpi" style={{ borderLeftColor: c }}><span>{l}</span><b>{v}</b><small>{s}</small></div>
  const inv = ps.reduce((a, p) => a + p.price * ((sm[p.id]?.stock || 0) + (sm[p.id]?.wh || 0)), 0)
  return (<><Head t="Reportes" s={`Rendimiento de ${scope ? branch?.name : 'todas las sedes'}`}><button className="btn o" onClick={() => window.print()}>🖨 Imprimir</button><button className="btn" onClick={csv}>⬇ Exportar CSV</button></Head><Err e={e1 || e2} />
    <div className="panel noprint" style={{ marginBottom: 16 }}><div className="fgrid"><div><label>Desde</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div><div><label>Hasta</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
      <div><label>Comprobante</label><select value={vo} onChange={e => setVo(e.target.value)}><option value="">Todos</option>{['Boleta', 'Factura', 'Nota de Venta'].map(t => <option key={t}>{t}</option>)}</select></div>
      <div><label>Origen</label><select value={src} onChange={e => setSrc(e.target.value)}><option value="">Tienda y web</option><option value="pos">Solo tienda</option><option value="web">Solo web</option></select></div></div></div>
    <div className="kpis"><K l="Ventas totales" v={money(tv)} s={`Ticket promedio ${money(sales.length ? tv / sales.length : 0)}`} c="var(--ok)" /><K l="Egresos" v={money(te)} s={`${egr.length} registros`} /><K l="Diferencia" v={money(tv - te)} s="Ingresos − Egresos" c="#2563eb" />
      <K l="Productos vendidos" v={uds.reduce((a, x) => a + x.v, 0)} s={`${uds.length} únicos`} c="#9333ea" /><K l="Comprobantes" v={sales.length} s="Total ventas" c="#f59e0b" /><K l="Inventario" v={money(inv)} s={`${ps.length} productos`} c="#14b8a6" /></div>
    <div className="panel" style={{ marginBottom: 16 }}><b>Ventas de los últimos 7 días</b><AreaChart data={byDay(sales, 7)} /></div>
    <div className="two" style={{ gridTemplateColumns: '1fr 1fr' }}><div className="panel"><b>Métodos de pago</b><br /><br /><Bars data={byPay(sales)} fmt={money} /></div><div className="panel"><b>Top productos</b><br /><br /><Bars data={uds.slice(0, 6)} /></div></div>
    <div className="two" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16 }}>{!scope && <div className="panel"><b>Ventas por sede</b><br /><br /><Bars data={perBranch} fmt={money} /></div>}<div className="panel"><b>Tienda vs. web</b><br /><br /><Bars data={bySrc} fmt={money} /></div></div></>)
}
