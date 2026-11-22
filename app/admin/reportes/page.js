'use client'
import { useState } from 'react'
import { money } from '../../../lib/supabase'
import { useApp, useScope } from '../../../lib/branch'
import { useTable, useStockMap, Err, Bars, sumItems } from '../../../lib/ui'
import { Ico } from '../../../lib/icons'
import { LineChart, Donut, PAL } from '../../../lib/charts'
const dk = d => new Date(d).toLocaleDateString('en-CA')
const addD = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return dk(d) }
export default function Reportes() {
  const { branch, allBranches } = useApp(), scope = useScope()
  const [ss, , e1] = useTable('sales', 'created_at', 5000, true), [ex, , e2] = useTable('expenses', 'created_at', 5000, true), [ps] = useTable('products', 'name'), [sm] = useStockMap()
  const def = () => { const d = new Date(); d.setDate(d.getDate() - 29); return dk(d) }
  const [from, setFrom] = useState(def), [to, setTo] = useState(dk(new Date())), [vo, setVo] = useState(''), [src, setSrc] = useState(''), [tipo, setTipo] = useState('Ventas'), [sede, setSede] = useState('')
  const inR = (d, a, b) => { const k = dk(d); return k >= a && k <= b }
  const span = Math.max(Math.round((new Date(to) - new Date(from)) / 864e5) + 1, 1), pFrom = addD(from, -span), pTo = addD(from, -1)
  const okS = s => s.status === 'completado' && (!vo || s.voucher === vo) && (!src || s.source === src) && (!sede || s.branch_id === sede)
  const sales = ss.filter(s => okS(s) && inR(s.created_at, from, to)), prev = ss.filter(s => okS(s) && inR(s.created_at, pFrom, pTo))
  const okE = e => !sede || e.branch_id === sede
  const egr = ex.filter(e => okE(e) && inR(e.created_at, from, to)), pegr = ex.filter(e => okE(e) && inR(e.created_at, pFrom, pTo))
  const sum = (a, k = 'total') => a.reduce((x, s) => x + +s[k], 0), tv = sum(sales), te = sum(egr, 'amount'), pv = sum(prev), pe = sum(pegr, 'amount'), uds = sumItems(sales)
  const P = {}; ps.forEach(p => P[p.id] = p)
  const cogs = r => r.reduce((a, s) => a + (s.items || []).reduce((b, i) => b + (+i.qty || 0) * (+P[i.id]?.cost || 0), 0), 0)
  const util = tv - cogs(sales), putil = pv - cogs(prev)
  const pct = (a, b) => b ? Math.round((a - b) / b * 100) : (a ? 100 : 0)
  const Pc = ({ a, b }) => { const p = pct(a, b); return <small className={p < 0 ? 'dn' : 'up'}>{p >= 0 ? '↗ +' : '↘ '}{p}% vs. periodo anterior</small> }
  const bname = id => allBranches.find(b => b.id === id)?.name || '?'
  const inv = ps.filter(p => p.kind !== 'combo').reduce((a, p) => a + p.price * ((sm[p.id]?.stock || 0) + (sm[p.id]?.wh || 0)), 0)
  const nprod = ps.filter(p => p.kind !== 'combo').length
  const days = Array.from({ length: 7 }, (_, k) => { const key = addD(to, k - 6), d = new Date(key + 'T12:00:00'); return { key, l: d.toLocaleDateString('es-PE', { weekday: 'short' }).replace('.', '') } })
  const sV = days.map(d => ({ l: d.l, v: sum(sales.filter(s => dk(s.created_at) === d.key)) })), sU = days.map(d => ({ l: d.l, v: Math.max(sum(sales.filter(s => dk(s.created_at) === d.key)) - cogs(sales.filter(s => dk(s.created_at) === d.key)), 0) }))
  const pay = Object.entries(sales.reduce((m, s) => (m[s.payment] = (m[s.payment] || 0) + +s.total, m), {})).map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v)
  const cm = {}; sales.forEach(s => (s.items || []).forEach(i => { const c = P[i.id]?.category || 'Otros'; cm[c] = (cm[c] || 0) + (+i.price || 0) * (+i.qty || 0) }))
  const cats = Object.entries(cm).map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v).slice(0, 6)
  const perBranch = Object.entries(sales.reduce((m, s) => (m[s.branch_id] = (m[s.branch_id] || 0) + +s.total, m), {})).map(([id, v]) => ({ l: bname(id), v }))
  const csv = () => { const rows = tipo === 'Egresos'
      ? 'Fecha,Sede,Categoría,Descripción,Monto\n' + egr.map(e => [e.created_at, bname(e.branch_id), e.category, `"${(e.description || e.concept || '').replace(/"/g, "'")}"`, e.amount].join(',')).join('\n')
      : 'Número,Fecha,Sede,Origen,Cliente,Tipo,Método,Total\n' + sales.map(s => [s.number, s.created_at, bname(s.branch_id), s.source, `"${s.customer_name}"`, s.voucher, s.payment, s.total].join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows], { type: 'text/csv' })); a.download = tipo === 'Egresos' ? 'reporte-egresos.csv' : 'reporte-ventas.csv'; a.click() }
  const reset = () => { setFrom(def()); setTo(dk(new Date())); setVo(''); setSrc(''); setTipo('Ventas'); setSede('') }
  const K = ({ c, ic, l, v, s, badge }) => <div className={'dx-k ' + c}><i className={'dx-ic ' + c}><Ico n={ic} s={24} /></i><div><span>{l}</span><b>{v}</b><small className={badge || ''}>{s}</small></div></div>
  return (<div className="dx"><div className="dx-head"><div><h1>Reportes</h1><p className="sub">Rendimiento de {scope ? branch?.name : 'todas las sedes'}</p></div>
    <div className="dx-acts"><button className="dx-btn" onClick={() => window.print()}><Ico n="printer" s={18} />Imprimir</button><button className="dx-btn g" onClick={csv}><Ico n="download" s={18} />Exportar</button></div></div><Err e={e1 || e2} />
    <div className="dx-fil"><h3>Filtros del reporte</h3><div className="dx-fg">
      <div><label>Tipo de reporte</label><select value={tipo} onChange={e => setTipo(e.target.value)}><option>Ventas</option><option>Egresos</option></select></div>
      <div><label>Desde</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
      <div><label>Hasta</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
      {!scope && <div><label>Sede</label><select value={sede} onChange={e => setSede(e.target.value)}><option value="">Todas las sedes</option>{allBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
      <div><label>Comprobante</label><select value={vo} onChange={e => setVo(e.target.value)}><option value="">Todos</option>{['Boleta', 'Factura', 'Nota de Venta'].map(t => <option key={t}>{t}</option>)}</select></div>
      <div><label>Origen</label><select value={src} onChange={e => setSrc(e.target.value)}><option value="">Tienda y web</option><option value="pos">Solo tienda</option><option value="web">Solo web</option></select></div>
      <div className="noprint"><button className="dx-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={reset}>↺ Restablecer</button></div></div></div>
    <div className="dx-kpis six">
      <K c="g" ic="money" l="Ventas totales" v={money(tv)} s={`Ticket promedio ${money(sales.length ? tv / sales.length : 0)}`} />
      <K c="r" ic="truck" l="Egresos" v={money(te)} s={`${egr.length} registros`} />
      <K c="b" ic="chart" l="Diferencia" v={money(tv - te)} s="Ingresos − Egresos" />
      <K c="p" ic="box" l="Productos vendidos" v={uds.reduce((a, x) => a + x.v, 0)} s={`${uds.length} únicos`} />
      <K c="o" ic="file" l="Comprobantes" v={sales.length} s="Total ventas" />
      <K c="t" ic="layers" l="Inventario" v={money(inv)} s={`${nprod} productos`} /></div>
    <div className="dx-p" style={{ marginBottom: 16 }}><h3>Resumen del Periodo</h3><p className="dx-s">{from.split('-').reverse().join('/')} – {to.split('-').reverse().join('/')} · {span} días</p><div className="dx-sum">
      <div><span>Ventas</span><b>{money(tv)}</b><Pc a={tv} b={pv} /></div><div><span>Egresos</span><b>{money(te)}</b><Pc a={te} b={pe} /></div><div><span>Utilidad estimada</span><b>{money(util)}</b><Pc a={util} b={putil} /></div><div><span>Comprobantes</span><b>{sales.length}</b><Pc a={sales.length} b={prev.length} /></div></div></div>
    <div className="dx-p" style={{ marginBottom: 16 }}><h3>Ventas de la Semana</h3><p className="dx-s">Últimos 7 días hasta {to.split('-').reverse().join('/')}</p><div className="dx-lg"><span><i style={{ background: '#3b82f6' }} />Ventas</span><span><i style={{ background: '#22c55e' }} />Utilidad</span></div>
      <LineChart series={[{ name: 'Ventas', color: '#3b82f6', data: sV, area: true }, { name: 'Utilidad', color: '#22c55e', data: sU }]} /></div>
    <div className="dx-row" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
      <div className="dx-p"><h3>Métodos de Pago</h3><p className="dx-s">Distribución del periodo</p><div className="dx-bk">{pay.map((p, i) => <div key={p.l}><div className="rw"><span>{p.l}</span><b>{money(p.v)} · {tv ? Math.round(p.v / tv * 100) : 0}%</b></div><div className="tr"><i style={{ width: (tv ? p.v / tv * 100 : 0) + '%', background: PAL[i % PAL.length] }} /></div></div>)}{!pay.length && <p className="sub">Sin datos en este periodo.</p>}</div></div>
      <div className="dx-p"><h3>Top Productos</h3><p className="dx-s">Más vendidos (unidades)</p><ul className="dx-top">{uds.slice(0, 6).map((u, i) => <li key={u.l}><span className="n">{i + 1}</span><span className="nm">{u.l}</span><b>{u.v}</b><small>uds</small></li>)}{!uds.length && <li className="sub">Sin datos en este periodo.</li>}</ul></div>
      <div className="dx-p"><h3>Top Categorías</h3><p className="dx-s">Por monto vendido</p><Donut data={cats} fmt={money} /></div></div>
    {!scope && !sede && perBranch.length > 0 && <div className="dx-p"><h3>Ventas por sede</h3><br /><Bars data={perBranch} fmt={money} /></div>}</div>)
}
