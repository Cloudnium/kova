'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { useScope } from './branch'

// Lee una tabla. Con scoped=true filtra por la sede actual (o trae todas las sedes si está en "Todas las sedes").
export function useTable(t, order = 'created_at', limit = 500, scoped = false) {
  const [rows, setRows] = useState([]), [err, setErr] = useState(''), scope = useScope()
  const load = useCallback(() => { let q = supabase.from(t).select('*').order(order, { ascending: false }).limit(limit); if (scoped && scope) q = q.eq('branch_id', scope)
    return q.then(r => { setRows(r.data || []); setErr(r.error?.message || '') }) }, [t, scope, scoped])
  useEffect(() => { load() }, [load])
  return [rows, load, err]
}
// Stock por producto de la sede actual (o sumado de todas). map[product_id] = { stock, wh, by: { [branch_id]: {stock, wh} } }
export function useStockMap() {
  const [map, setMap] = useState({}), scope = useScope(), [err, setErr] = useState('')
  const load = useCallback(() => { let q = supabase.from('branch_stock').select('*').limit(20000); if (scope) q = q.eq('branch_id', scope)
    return q.then(r => { const m = {}; (r.data || []).forEach(x => { const e = m[x.product_id] ||= { stock: 0, wh: 0, by: {} }; e.stock += x.stock; e.wh += x.stock_warehouse; e.by[x.branch_id] = { stock: x.stock, wh: x.stock_warehouse } }); setMap(m); setErr(r.error?.message || '') }) }, [scope])
  useEffect(() => { load() }, [load])
  return [map, load, err]
}
export const useTableProducts = () => useTable('products', 'name')
export const Err = ({ e }) => e ? <p style={{ color: '#b91c1c', background: '#fee2e2', padding: 10, borderRadius: 8, marginBottom: 12 }}>⚠ {e}{/does not exist|schema cache|Could not find/.test(e) ? '. Ejecuta los scripts de la carpeta supabase/ en orden (hasta schema_v7.sql).' : ''}</p> : null
export const Modal = ({ title, onClose, children, wide }) => <div className="modal" onClick={onClose}><div className="mbox" style={wide ? { width: 'min(760px,94vw)' } : undefined} onClick={e => e.stopPropagation()}><div className="row"><b>{title}</b><button className="btn o" onClick={onClose}>✕</button></div>{children}</div></div>
export const Head = ({ t, s, children }) => <div className="head"><div><h1>{t}</h1><p className="sub">{s}</p></div><div className="noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div></div>
export const Seg = ({ opts, v, set }) => <div className="seg">{opts.map(o => <button type="button" key={o} className={v === o ? 'on' : ''} onClick={() => set(o)}>{o}</button>)}</div>
export const AllBanner = ({ what = 'esta acción' }) => <p style={{ background: '#fef3c7', padding: 12, borderRadius: 8, marginBottom: 12 }}>Estás viendo <b>Todas las sedes</b> (solo consulta). Elige una sede en la barra superior para {what}.</p>
export function AreaChart({ data }) {
  const max = Math.max(...data.map(d => d.v), 1), W = 600, H = 200, P = 30
  const pts = data.map((d, i) => [P + i * (W - 2 * P) / Math.max(data.length - 1, 1), H - P - d.v / max * (H - 2 * P)])
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join(' ')
  return <svg viewBox={`0 0 ${W} ${H + 10}`} style={{ width: '100%' }}><path d={`${line} L${pts.at(-1)[0]} ${H - P} L${P} ${H - P}Z`} style={{ fill: 'var(--red-soft)' }} /><path d={line} fill="none" style={{ stroke: 'var(--red)' }} strokeWidth="3" />
    {pts.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r="4" style={{ fill: 'var(--red)' }} /><text x={p[0]} y={H - 8} textAnchor="middle" fontSize="12" fill="#6b6361">{data[i].l}</text><text x={p[0]} y={p[1] - 9} textAnchor="middle" fontSize="11">{Math.round(data[i].v)}</text></g>)}</svg>
}
export const Bars = ({ data, fmt = x => x }) => { const m = Math.max(...data.map(d => d.v), 1); return <div>{data.map(d => <div key={d.l} style={{ marginBottom: 12 }}><div className="row"><span>{d.l}</span><b>{fmt(d.v)}</b></div><div className="bar2" style={{ width: d.v / m * 100 + '%' }} /></div>)}{!data.length && <p className="sub">Sin datos en este periodo.</p>}</div> }
export const sumItems = rows => { const m = {}; rows.forEach(s => (s.items || []).forEach(i => { m[i.name] = (m[i.name] || 0) + i.qty })); return Object.entries(m).map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v) }
export const byPay = rows => { const m = {}; rows.forEach(s => { m[s.payment] = (m[s.payment] || 0) + +s.total }); return Object.entries(m).map(([l, v]) => ({ l, v })) }
export const byDay = (rows, days) => Array.from({ length: days }, (_, k) => { const d = new Date(); d.setDate(d.getDate() - (days - 1 - k)); const key = d.toLocaleDateString('en-CA')
  return { l: d.toLocaleDateString('es-PE', { weekday: 'short' }).replace('.', ''), v: rows.filter(s => new Date(s.created_at).toLocaleDateString('en-CA') === key).reduce((a, s) => a + +s.total, 0) } })
