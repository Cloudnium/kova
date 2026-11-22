'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase, money, rpc } from '../../../lib/supabase'
import { useApp, useScope } from '../../../lib/branch'
import { Modal, Head, Err, AllBanner } from '../../../lib/ui'
import { Ico } from '../../../lib/icons'
import { TICKET_CSS } from '../../../lib/tickets'
import { boxModel, boxTicketHTML, boxPDF, printHTML, fDT, fT } from '../../../lib/cajareport'
const rng = d => { const a = new Date(d + 'T00:00:00'), b = new Date(a); b.setDate(b.getDate() + 1); return [a.toISOString(), b.toISOString()] }
export default function Cajas() {
  const { askBox, reloadBox, allBranches, user, isAdmin, settings } = useApp(), scope = useScope()
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA')), [boxes, setBoxes] = useState([]), [sales, setSales] = useState([]), [voided, setVoided] = useState([]), [exp, setExp] = useState([]), [det, setDet] = useState(null), [tk, setTk] = useState(null)
  const [q, setQ] = useState(''), [cl, setCl] = useState(null), [err, setErr] = useState('')
  const load = useCallback(async () => {
    const [a, b] = rng(date), g = (t, c) => { let x = supabase.from(t).select('*').gte(c, a).lt(c, b).order(c, { ascending: false }); if (scope) x = x.eq('branch_id', scope); return x }
    const [x, y, z] = await Promise.all([g('cash_registers', 'opened_at'), g('sales', 'created_at').in('status', ['completado', 'anulado']), g('expenses', 'created_at')])
    // incluye cajas que siguen abiertas de días anteriores
    let o = supabase.from('cash_registers').select('*').eq('status', 'abierta').lt('opened_at', a); if (scope) o = o.eq('branch_id', scope); const old = await o
    setBoxes([...(x.data || []), ...(old.data || [])]); setSales((y.data || []).filter(s => s.status === 'completado')); setVoided((y.data || []).filter(s => s.status === 'anulado')); setExp(z.data || []); setErr(x.error?.message || '')
  }, [date, scope])
  useEffect(() => { load() }, [load])
  const mine = b => sales.filter(s => s.cash_id === b.id), tot = b => mine(b).reduce((a, s) => a + +s.total, 0)
  const cashIn = b => mine(b).filter(s => s.paid !== false && s.payment === 'Efectivo').reduce((a, s) => a + +s.total, 0), cashOut = b => exp.filter(e => e.cash_id === b.id && e.method === 'Efectivo').reduce((a, e) => a + +e.amount, 0)
  const expected = b => +b.opening_amount + cashIn(b) - cashOut(b)
  const close = async () => { const x = await rpc('close_cash', { p_id: cl.b.id, p_counted: cl.n === '' ? null : +cl.n }); if (x.error) return setCl({ ...cl, e: x.error }); setCl(null); load(); reloadBox() }
  const shown = boxes.filter(b => (b.name + b.user_email).toLowerCase().includes(q.toLowerCase())), t = d => new Date(d).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  const bname = id => allBranches.find(b => b.id === id)?.name
  const model = b => boxModel(b, mine(b), voided.filter(s => s.cash_id === b.id), exp.filter(e => e.cash_id === b.id), allBranches.find(x => x.id === b.branch_id) || {})
  return (<><Head t="Cajas del Día" s="Aperturas, cierres y movimientos por sede"><button className="btn g" disabled={!scope} onClick={askBox}>🔓 Abrir mi caja</button></Head><Err e={err} />{!scope && <AllBanner what="abrir una caja" />}
    <div className="kpis"><div className="kpi"><span>Cajas abiertas</span><b>{boxes.filter(b => b.status === 'abierta').length}</b></div><div className="kpi"><span>Cajas cerradas</span><b>{boxes.filter(b => b.status !== 'abierta').length}</b></div>
      <div className="kpi"><span>Ingresos totales</span><b>{money(sales.reduce((a, s) => a + +s.total, 0))}</b></div><div className="kpi"><span>Egresos totales</span><b>{money(exp.reduce((a, e) => a + +e.amount, 0))}</b></div></div>
    <div className="panel" style={{ marginBottom: 16 }}><div className="row" style={{ marginBottom: 14 }}><input placeholder="Buscar caja o usuario..." value={q} onChange={e => setQ(e.target.value)} /><input type="date" style={{ width: 170 }} value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="cards cajas">{shown.map(b => { const ex = exp.filter(e => e.cash_id === b.id).reduce((a, e) => a + +e.amount, 0); return <div className="card caja" key={b.id}><div className="row" style={{ alignItems: 'flex-start' }}><div className="caja-ic"><Ico n="till" s={22} /></div>
          <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 17 }}>{b.name}</b><small style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Ico n="user" s={13} /> {(b.user_email || '').split('@')[0]}{!scope && ` · ${bname(b.branch_id) || ''}`}</small></div><span className={'tag ' + (b.status === 'abierta' ? 'g' : '')}>{b.status === 'abierta' ? 'Abierta' : 'Cerrada'}</span></div>
        <small style={{ marginTop: 12 }}>Ingresos del turno</small><b style={{ fontSize: 30 }}>{money(tot(b))}</b><small>{mine(b).length} ventas · egresos {money(ex)}</small>
        <div className="caja-t"><span style={{ color: '#16a34a' }}>◔ Apertura {t(b.opened_at)}</span>{b.closed_at && <span style={{ color: '#dc2626' }}>◔ Cierre {t(b.closed_at)}</span>}</div>
        <div className="caja-b"><button className="btn o" onClick={() => setDet(model(b))}><Ico n="eye" s={16} /> Ver detalle</button><button className="btn o" onClick={() => setTk(model(b))}><Ico n="till" s={16} /> Ticket</button><button className="btn o" onClick={() => boxPDF(model(b), settings)}><Ico n="download" s={16} /> Descargar</button></div>
        {b.status === 'abierta' && (b.user_email === user?.email || isAdmin) && <button className="btn" style={{ marginTop: 8 }} onClick={() => setCl({ b, n: '', e: '' })}>Cerrar caja</button>}</div> })}
        {!shown.length && <p className="sub">No hay cajas en esta fecha.</p>}</div></div>
    <div className="panel"><b>Movimientos</b><table><thead><tr><th>Hora</th><th>Caja</th><th>Detalle</th><th>Método</th><th>Monto</th></tr></thead><tbody>
      {sales.map(s => <tr key={s.id}><td>{t(s.created_at)}</td><td>{boxes.find(b => b.id === s.cash_id)?.name || '-'}</td><td>Venta {s.number}{s.paid === false && ' (por cobrar)'}</td><td>{s.payment}</td><td style={{ color: 'var(--ok)', fontWeight: 600 }}>+ {money(s.total)}</td></tr>)}
      {exp.map(e => <tr key={e.id}><td>{t(e.created_at)}</td><td>{boxes.find(b => b.id === e.cash_id)?.name || '-'}</td><td>{e.concept}</td><td>{e.method}</td><td style={{ color: '#b91c1c', fontWeight: 600 }}>- {money(e.amount)}</td></tr>)}</tbody></table></div>
    {det && <DetalleCaja mo={det} t={t} onClose={() => setDet(null)} onTicket={() => { setTk(det); setDet(null) }} onPdf={() => boxPDF(det, settings)} />}
    {tk && <Modal title={`Ticket de ${tk.b.name}`} onClose={() => setTk(null)}><style>{TICKET_CSS}</style><div className="tkbox" dangerouslySetInnerHTML={{ __html: boxTicketHTML(tk, settings) }} />
      <div className="row" style={{ gap: 8 }}><button className="btn" style={{ flex: 1 }} onClick={() => printHTML(boxTicketHTML(tk, settings), 'Resumen de caja')}>🖨 Imprimir ticket</button><button className="btn o" style={{ flex: 1 }} onClick={() => boxPDF(tk, settings)}>⬇ Descargar PDF</button></div></Modal>}
    {cl && <Modal title={`Cerrar ${cl.b.name}`} onClose={() => setCl(null)}><Err e={cl.e} /><div className="row"><span>Apertura</span><b>{money(cl.b.opening_amount)}</b></div><div className="row"><span>+ Ventas cobradas en efectivo</span><b>{money(cashIn(cl.b))}</b></div><div className="row"><span>− Egresos en efectivo</span><b>{money(cashOut(cl.b))}</b></div>
      <div className="row"><b>Efectivo esperado</b><b className="price">{money(expected(cl.b))}</b></div><label>Efectivo contado en caja (S/)</label><input type="number" min="0" value={cl.n} placeholder={String(expected(cl.b).toFixed(2))} onChange={e => setCl({ ...cl, n: e.target.value })} />
      {cl.n !== '' && <small>Diferencia: <b style={{ color: +cl.n - expected(cl.b) < 0 ? '#b91c1c' : 'var(--ok)' }}>{money(+cl.n - expected(cl.b))}</b></small>}<button className="btn" onClick={close}>Cerrar caja</button></Modal>}</>)
}

const METH = [['Efectivo', 'till'], ['Yape', 'bell'], ['Tarjeta', 'money'], ['Transferencia', 'building']]
function DetalleCaja({ mo, t, onClose, onTicket, onPdf }) {
  const m = n => money(n), nEf = mo.by.Efectivo, otros = mo.by.Yape.total + mo.by.Tarjeta.total + mo.by.Transferencia.total
  return <div className="modal" onClick={onClose}><div className="mbox mvbox" style={{ width: 'min(760px,96vw)' }} onClick={e => e.stopPropagation()}>
    <div className="mv-h"><div style={{ flex: 1 }}><b className="mv-t" style={{ fontSize: 20 }}>Detalle de {mo.b.name}</b><small className="mv-s">{mo.branch?.name} · {(mo.seller || '').split('@')[0]} · {fDT(mo.b.opened_at)}{mo.b.closed_at ? ' → ' + fT(mo.b.closed_at) : ' (abierta)'}</small></div><button className="mv-x" aria-label="Cerrar" onClick={onClose}>✕</button></div>
    <div className="mv-body">
      <div className="caja-m">{METH.map(([k, ic]) => <div key={k}><small><Ico n={ic} s={13} /> {k.toUpperCase()}</small><b>{m(mo.by[k].total)}</b><small>{mo.by[k].n} {mo.by[k].n === 1 ? 'venta' : 'ventas'}</small></div>)}</div>
      <div className="caja-s"><div style={{ background: '#ecfdf5', color: '#047857' }}><small>En efectivo</small><b>{m(nEf.total)}</b></div><div style={{ background: '#eff6ff', color: '#1d4ed8' }}><small>Tarjetas / Yape / Transferencia</small><b>{m(otros)}</b></div><div style={{ background: '#fef2f2', color: '#b91c1c' }}><small>Egresos</small><b>- {m(mo.egresos)}</b></div></div>
      <div className="caja-r"><div className="row"><span>Apertura</span><b>{m(mo.opening)}</b></div><div className="row"><span>Total ingresos</span><b style={{ color: '#16a34a' }}>{m(mo.ingresos)}</b></div><div className="row"><span>Neto (ingresos − egresos)</span><b>{m(mo.neto)}</b></div>
        <div className="row" style={{ borderTop: '1px dashed var(--line)', paddingTop: 10 }}><b>Efectivo a entregar</b><b style={{ color: '#16a34a', fontSize: 20 }}>{m(mo.entregar)}</b></div></div>
      <b>Ventas ({mo.sales.length})</b>
      <div className="mv-tw"><table><thead><tr><th>FECHA Y HORA</th><th>COMPROBANTE</th><th>PRODUCTOS</th><th>CANT.</th><th>MÉTODO</th><th>TOTAL</th></tr></thead><tbody>
        {mo.sales.map(s => <tr key={s.id}><td style={{ whiteSpace: 'nowrap' }}>{fDT(s.created_at)}</td><td><b>{s.number}</b></td><td><small>{(s.items || []).map(i => `${i.qty} × ${i.name} (${(+i.price).toFixed(2)})`).join(', ')}</small></td><td>{(s.items || []).reduce((a, i) => a + i.qty, 0)}</td><td>{s.payment}</td><td style={{ whiteSpace: 'nowrap' }}>{m(s.total)}</td></tr>)}
        {!mo.sales.length && <tr><td colSpan={6}>Sin ventas en este turno.</td></tr>}</tbody></table></div>
      <b>Egresos ({mo.exps.length})</b>
      <div className="mv-tw"><table><thead><tr><th>HORA</th><th>CATEGORÍA</th><th>CONCEPTO</th><th>MONTO</th></tr></thead><tbody>{mo.exps.map(e => <tr key={e.id}><td>{t(e.created_at)}</td><td>{e.category}</td><td>{e.concept}</td><td style={{ color: '#b91c1c' }}>- {m(e.amount)}</td></tr>)}{!mo.exps.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--mut)' }}>Sin egresos en este turno.</td></tr>}</tbody></table></div>
    </div>
    <div className="mv-f" style={{ justifyContent: 'flex-end' }}><button className="btn o" onClick={onClose}>Cerrar</button><button className="btn o" onClick={onTicket}><Ico n="till" s={16} /> Ticket</button><button className="btn mv-pdf" onClick={onPdf}><Ico n="download" s={16} /> Descargar</button></div></div></div>
}
