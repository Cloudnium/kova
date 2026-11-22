'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { limaNow } from './promo'
import { Ico } from './icons'

// ---- Clasificación del movimiento a partir de su texto (sirve también para movimientos antiguos) ----
export function kindOf(m) {
  const d = m.direction || '', tb = (m.st_before ?? 0) + (m.wh_before ?? 0), ta = (m.st_after ?? 0) + (m.wh_after ?? 0), has = m.st_after != null
  let g, tipo, motivo, sign
  if (d.startsWith('Venta POS')) { g = 'venta'; tipo = 'Salida'; motivo = 'Venta'; sign = -1 }
  else if (d.startsWith('Pedido web')) { g = 'venta'; tipo = 'Salida'; motivo = 'Venta web'; sign = -1 }
  else if (d.startsWith('Anulación')) { g = 'anul'; tipo = 'Entrada'; motivo = 'Anulación'; sign = 1 }
  else if (d.startsWith('Compra')) { g = 'compra'; tipo = 'Entrada'; motivo = d.replace('Compra ', 'Compra '); sign = 1 }
  else if (d.startsWith('Ingreso')) { g = 'ing'; tipo = 'Entrada'; motivo = 'Ingreso'; sign = 1 }
  else if (d.startsWith('Almacén →')) { g = 'a_tienda'; tipo = 'Traslado'; motivo = 'Almacén → Tienda'; sign = 0 }
  else if (d.startsWith('Tienda →')) { g = 'a_almacen'; tipo = 'Traslado'; motivo = 'Tienda → Almacén'; sign = 0 }
  else if (d.startsWith('Traslado enviado')) { g = 'envio'; tipo = 'Salida'; motivo = d.replace('Traslado enviado a', 'Traslado a'); sign = -1 }
  else if (d.startsWith('Traslado recibido')) { g = 'recibo'; tipo = 'Entrada'; motivo = d.replace('Traslado recibido de', 'Traslado de'); sign = 1 }
  else if (d.startsWith('Ajuste')) { g = 'ajuste'; tipo = 'Ajuste'; motivo = 'Ajuste manual'; sign = has ? Math.sign(ta - tb) : 0 }
  else { g = 'otro'; tipo = 'Otro'; motivo = d; sign = 0 }
  const qty = g === 'ajuste' && has ? Math.abs(ta - tb) : +m.qty
  return { g, tipo, motivo, sign, units: qty, signed: sign * qty, tb: has ? tb : null, ta: has ? ta : null }
}
const nextDay = s => new Date(new Date(s + 'T12:00:00Z').getTime() + 864e5).toISOString().slice(0, 10)
export async function fetchMoves(scope, from, to) {
  const out = []
  for (let i = 0; i < 30; i++) {
    let q = supabase.from('stock_moves').select('*').gte('created_at', from + 'T00:00:00-05:00').lt('created_at', nextDay(to) + 'T00:00:00-05:00').order('created_at', { ascending: false }).range(i * 1000, i * 1000 + 999)
    if (scope) q = q.eq('branch_id', scope)
    const r = await q; if (r.error) throw new Error(r.error.message); out.push(...r.data); if (r.data.length < 1000) break
  }
  return out
}
const fDate = d => new Date(d).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' })
const fTime = d => new Date(d).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })

// ---- Exportar ----
const save = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }
const esc = v => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
export function toExcel(name, head, rows) {
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr>${head.map(h => `<th style="background:#e11d48;color:#fff">${esc(h)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></body></html>`
  save(name + '.xls', new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' }))
}
export async function toPdf(name, title, sub, head, rows, widths) {
  const { jsPDF } = await import('jspdf'), doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), W = 297, M = 10, tw = W - 2 * M, sum = widths.reduce((a, b) => a + b, 0), cw = widths.map(w => w / sum * tw)
  let y = 0, pg = 0
  const header = () => { pg++; doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(title, M, 14); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110); doc.text(sub, M, 19.5); doc.setTextColor(0)
    y = 25; doc.setFillColor(225, 29, 72); doc.rect(M, y - 4.5, tw, 6.5, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); let x = M; head.forEach((h, i) => { doc.text(h, x + 1.5, y); x += cw[i] }); doc.setTextColor(0); doc.setFont('helvetica', 'normal'); y += 6 }
  header()
  rows.forEach((r, k) => {
    if (y > 197) { doc.setFontSize(8); doc.setTextColor(130); doc.text('Página ' + pg, W - M - 14, 205); doc.setTextColor(0); doc.addPage(); header() }
    if (k % 2) { doc.setFillColor(246, 246, 248); doc.rect(M, y - 3.6, tw, 5.2, 'F') }
    doc.setFontSize(7.6); let x = M; r.forEach((c, i) => { const t = doc.splitTextToSize(String(c ?? ''), cw[i] - 2)[0] || ''; doc.text(t, x + 1.5, y); x += cw[i] }); y += 5.2
  })
  doc.setFontSize(8); doc.setTextColor(130); doc.text('Página ' + pg, W - M - 14, 205)
  doc.save(name + '.pdf')
}

// ---- Datos compartidos por los dos modales ----
function useMoves(scope, products) {
  const t = limaNow().date, [from, setFrom] = useState(t), [to, setTo] = useState(t), [raw, setRaw] = useState([]), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const pm = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products])
  const run = useCallback(async (f = from, t2 = to) => { if (f > t2) return setErr('La fecha «Desde» no puede ser mayor que «Hasta».'); setBusy(true); setErr(''); try { setRaw(await fetchMoves(scope, f, t2)) } catch (e) { setErr(e.message + ' · ¿Ejecutaste schema_v10.sql?') } setBusy(false) }, [scope, from, to])
  useEffect(() => { run() }, [scope]) // eslint-disable-line
  const rows = useMemo(() => raw.map(m => ({ ...m, ...kindOf(m), cat: pm[m.product_id]?.category || '' })), [raw, pm])
  return { from, setFrom, to, setTo, rows, busy, err, run, today: t }
}
const Shell = ({ title, sub, icon, onClose, children, foot }) => <div className="modal" onClick={onClose}><div className="mbox mvbox" onClick={e => e.stopPropagation()}>
  <div className="mv-h"><span className="mv-ic"><Ico n={icon} s={22} /></span><div style={{ flex: 1 }}><b className="mv-t">{title}</b>{sub && <small className="mv-s">{sub}</small>}</div><button className="mv-x" aria-label="Cerrar" onClick={onClose}>✕</button></div>
  <div className="mv-body">{children}</div><div className="mv-f">{foot}</div></div></div>
const Foot = ({ n, onClose, xl, pdf, off }) => <><small style={{ color: 'var(--mut)', marginRight: 'auto' }}>{n} movimientos encontrados</small>
  <button className="btn o" onClick={onClose}>✕ Cerrar</button><button className="btn mv-xl" disabled={off} onClick={xl}>Excel</button><button className="btn mv-pdf" disabled={off} onClick={pdf}>PDF</button></>

// ---- Historial general (Productos) ----
export function MovesModal({ onClose, scope, products, branches, scopeName }) {
  const { from, setFrom, to, setTo, rows, busy, err, run } = useMoves(scope, products), [prod, setProd] = useState(''), [tipo, setTipo] = useState('')
  const bn = id => branches.find(b => b.id === id)?.name || ''
  const list = useMemo(() => rows.filter(m => (!prod || m.product_id === prod) && (!tipo || (tipo === 'Entrada' ? m.sign > 0 : tipo === 'Salida' ? m.sign < 0 : m.tipo === tipo))), [rows, prod, tipo])
  const inn = list.filter(m => m.sign > 0).reduce((a, m) => a + m.units, 0), out = list.filter(m => m.sign < 0).reduce((a, m) => a + m.units, 0)
  const head = ['Fecha', 'Hora', ...(scope ? [] : ['Sede']), 'Producto', 'Categoría', 'Tipo', 'Motivo', 'Cantidad', 'Stock', 'Usuario']
  const cells = m => [fDate(m.created_at), fTime(m.created_at), ...(scope ? [] : [bn(m.branch_id)]), m.product_name, m.cat, m.tipo, m.motivo, m.sign ? (m.sign > 0 ? '+' : '-') + m.units : m.units, m.ta == null ? '' : `${m.tb} → ${m.ta}`, m.user_email]
  const name = `movimientos-${from}_${to}`
  return <Shell icon="history" title="Historial de Movimientos de Almacén" sub={scopeName ? `Sede: ${scopeName}` : 'Todas las sedes'} onClose={onClose} foot={<Foot n={list.length} onClose={onClose} off={!list.length}
    xl={() => toExcel(name, head, list.map(cells))} pdf={() => toPdf(name, 'Historial de movimientos de almacén', `${scopeName || 'Todas las sedes'} · ${from} al ${to}`, head, list.map(cells), scope ? [11, 8, 30, 15, 9, 14, 8, 9, 13] : [11, 8, 12, 28, 13, 9, 13, 8, 9, 13])} />}>
    <div className="mv-fil"><div><label>Desde</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div><div><label>Hasta</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
      <div style={{ flex: 2 }}><label>Producto</label><select value={prod} onChange={e => setProd(e.target.value)}><option value="">Todos los productos</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label>Tipo</label><select value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Todos</option><option>Entrada</option><option>Salida</option><option>Traslado</option><option>Ajuste</option></select></div>
      <button className="mv-go" aria-label="Buscar" disabled={busy} onClick={() => run()}><Ico n="search" s={20} /></button></div>
    {err && <div className="err">{err}</div>}
    <div className="mv-k"><div className="mv-k1"><span>TOTAL MOVIMIENTOS</span><b>{list.length}</b></div><div className="mv-k2"><span>UNIDADES INGRESADAS</span><b>+{inn}</b></div><div className="mv-k3"><span>UNIDADES SALIDAS</span><b>-{out}</b></div></div>
    <div className="mv-tw"><table><thead><tr>{head.map(h => <th key={h}>{h.toUpperCase()}</th>)}</tr></thead><tbody>
      {list.map(m => <tr key={m.id}><td>{fDate(m.created_at)}</td><td>{fTime(m.created_at)}</td>{!scope && <td>{bn(m.branch_id)}</td>}<td><b>{m.product_name}</b></td><td style={{ color: 'var(--mut)' }}>{m.cat}</td>
        <td><span className={'tag ' + (m.tipo === 'Salida' ? 'r' : m.tipo === 'Entrada' ? 'g' : 'y')}>{m.tipo}</span></td><td>{m.motivo}</td>
        <td style={{ fontWeight: 700, color: m.sign < 0 ? '#dc2626' : m.sign > 0 ? '#16a34a' : 'inherit' }}>{m.sign ? (m.sign > 0 ? '+' : '-') + m.units : m.units}</td><td style={{ whiteSpace: 'nowrap' }}>{m.ta == null ? '—' : `${m.tb} → ${m.ta}`}</td><td>{(m.user_email || '').split('@')[0]}</td></tr>)}
      {!list.length && <tr><td colSpan={head.length}>{busy ? 'Cargando…' : 'No hay movimientos en ese rango.'}</td></tr>}</tbody></table></div>
  </Shell>
}

// ---- Historial de traslados (Almacén) ----
const MODES = [['todos', 'Todos', 'Traslados en todas las direcciones', 'layers', '#16a34a'], ['a_tienda', 'Almacén → Tienda', 'Solo traspasos al punto de venta', 'store', '#2563eb'], ['a_almacen', 'Tienda → Almacén', 'Solo devoluciones a bodega', 'building', '#ea580c'], ['sedes', 'Entre sedes', 'Envíos y recepciones de otras sedes', 'truck', '#9333ea']]
export function TransfersModal({ onClose, scope, products, branches, scopeName }) {
  const { from, setFrom, to, setTo, rows, busy, err, run, today } = useMoves(scope, products), [mode, setMode] = useState('todos'), [range, setRange] = useState(false), [q, setQ] = useState('')
  const bn = id => branches.find(b => b.id === id)?.name || ''
  const list = useMemo(() => rows.filter(m => ['a_tienda', 'a_almacen', 'envio', 'recibo'].includes(m.g) && (mode === 'todos' || (mode === 'sedes' ? (m.g === 'envio' || m.g === 'recibo') : m.g === mode)) && (!q || m.product_name.toLowerCase().includes(q.toLowerCase()))), [rows, mode, q])
  const head = ['Fecha', 'Hora', ...(scope ? [] : ['Sede']), 'Producto', 'Categoría', 'Movimiento', 'Cantidad', 'Tienda', 'Almacén', 'Usuario']
  const cells = m => [fDate(m.created_at), fTime(m.created_at), ...(scope ? [] : [bn(m.branch_id)]), m.product_name, m.cat, m.motivo, m.units, m.st_after == null ? '' : `${m.st_before} → ${m.st_after}`, m.wh_after == null ? '' : `${m.wh_before} → ${m.wh_after}`, m.user_email]
  const name = `traslados-${from}_${to}`, setDay = v => { setFrom(v); setTo(v) }
  return <Shell icon="file" title="Historial de Traslados" sub="Registro de movimientos entre tienda, almacén y otras sedes" onClose={onClose} foot={<Foot n={list.length} onClose={onClose} off={!list.length}
    xl={() => toExcel(name, head, list.map(cells))} pdf={() => toPdf(name, 'Historial de traslados', `${scopeName || 'Todas las sedes'} · ${from} al ${to}`, head, list.map(cells), scope ? [11, 8, 28, 12, 17, 8, 10, 10, 14] : [11, 8, 12, 26, 11, 16, 8, 10, 10, 13])} />}>
    <div className="mv-modes">{MODES.map(([k, t, d, ic, c]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}><span style={{ color: c }}><Ico n={ic} s={22} /></span><span><b>{t}</b><small>{d}</small></span></button>)}</div>
    <div className="mv-dates">{range ? <><input type="date" value={from} onChange={e => setFrom(e.target.value)} /><span>al</span><input type="date" value={to} onChange={e => setTo(e.target.value)} /></> : <input type="date" value={from} onChange={e => setDay(e.target.value)} />}
      <button className="btn o mini" onClick={() => { setRange(!range); if (range) setTo(from) }}>{range ? 'Un solo día' : 'Rango de fechas'}</button>
      <button className="btn o mini" onClick={() => { setRange(false); setDay(today); run(today, today) }}>Hoy</button>
      <button className="mv-go" aria-label="Buscar" disabled={busy} onClick={() => run(from, range ? to : from)}><Ico n="search" s={20} /></button></div>
    <input className="mv-q" placeholder="Buscar por nombre..." value={q} onChange={e => setQ(e.target.value)} />
    {err && <div className="err">{err}</div>}
    <div className="mv-cards">{list.map(m => <div className="mv-card" key={m.id}><div className="mv-ch"><div><b>{m.product_name}</b><small>{m.cat}</small></div>
      <div style={{ textAlign: 'right' }}><span className={'mv-pill ' + m.g}>{m.motivo}</span><small>{fDate(m.created_at)}, {fTime(m.created_at)}</small></div></div>
      <div className="mv-cn"><div className="mv-q1"><small>Cantidad</small><b>{m.units}</b></div><div className="mv-q2"><small>Tienda</small><b>{m.st_after == null ? '—' : `${m.st_before} → ${m.st_after}`}</b></div><div className="mv-q3"><small>Almacén</small><b>{m.wh_after == null ? '—' : `${m.wh_before} → ${m.wh_after}`}</b></div></div>
      <small className="mv-by">⇄ {!scope && bn(m.branch_id) ? bn(m.branch_id) + ' · ' : ''}{(m.user_email || '').split('@')[0]}</small></div>)}
      {!list.length && <p style={{ textAlign: 'center', color: 'var(--mut)' }}>{busy ? 'Cargando…' : 'No hay traslados en ese rango.'}</p>}</div>
  </Shell>
}
