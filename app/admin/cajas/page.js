'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase, money, rpc } from '../../../lib/supabase'
import { useApp, useScope } from '../../../lib/branch'
import { Modal, Head, Err, AllBanner } from '../../../lib/ui'
const rng = d => { const a = new Date(d + 'T00:00:00'), b = new Date(a); b.setDate(b.getDate() + 1); return [a.toISOString(), b.toISOString()] }
export default function Cajas() {
  const { askBox, reloadBox, allBranches, user, isAdmin } = useApp(), scope = useScope()
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA')), [boxes, setBoxes] = useState([]), [sales, setSales] = useState([]), [exp, setExp] = useState([])
  const [q, setQ] = useState(''), [cl, setCl] = useState(null), [err, setErr] = useState('')
  const load = useCallback(async () => {
    const [a, b] = rng(date), g = (t, c) => { let x = supabase.from(t).select('*').gte(c, a).lt(c, b).order(c, { ascending: false }); if (scope) x = x.eq('branch_id', scope); return x }
    const [x, y, z] = await Promise.all([g('cash_registers', 'opened_at'), g('sales', 'created_at').eq('status', 'completado'), g('expenses', 'created_at')])
    // incluye cajas que siguen abiertas de días anteriores
    let o = supabase.from('cash_registers').select('*').eq('status', 'abierta').lt('opened_at', a); if (scope) o = o.eq('branch_id', scope); const old = await o
    setBoxes([...(x.data || []), ...(old.data || [])]); setSales(y.data || []); setExp(z.data || []); setErr(x.error?.message || '')
  }, [date, scope])
  useEffect(() => { load() }, [load])
  const mine = b => sales.filter(s => s.cash_id === b.id), tot = b => mine(b).reduce((a, s) => a + +s.total, 0)
  const cashIn = b => mine(b).filter(s => s.paid !== false && s.payment === 'Efectivo').reduce((a, s) => a + +s.total, 0), cashOut = b => exp.filter(e => e.cash_id === b.id && e.method === 'Efectivo').reduce((a, e) => a + +e.amount, 0)
  const expected = b => +b.opening_amount + cashIn(b) - cashOut(b)
  const close = async () => { const x = await rpc('close_cash', { p_id: cl.b.id, p_counted: cl.n === '' ? null : +cl.n }); if (x.error) return setCl({ ...cl, e: x.error }); setCl(null); load(); reloadBox() }
  const shown = boxes.filter(b => (b.name + b.user_email).toLowerCase().includes(q.toLowerCase())), t = d => new Date(d).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  const bname = id => allBranches.find(b => b.id === id)?.name
  return (<><Head t="Cajas del Día" s="Aperturas, cierres y movimientos por sede"><button className="btn g" disabled={!scope} onClick={askBox}>🔓 Abrir mi caja</button></Head><Err e={err} />{!scope && <AllBanner what="abrir una caja" />}
    <div className="kpis"><div className="kpi"><span>Cajas abiertas</span><b>{boxes.filter(b => b.status === 'abierta').length}</b></div><div className="kpi"><span>Cajas cerradas</span><b>{boxes.filter(b => b.status !== 'abierta').length}</b></div>
      <div className="kpi"><span>Ingresos totales</span><b>{money(sales.reduce((a, s) => a + +s.total, 0))}</b></div><div className="kpi"><span>Egresos totales</span><b>{money(exp.reduce((a, e) => a + +e.amount, 0))}</b></div></div>
    <div className="panel" style={{ marginBottom: 16 }}><div className="row" style={{ marginBottom: 14 }}><input placeholder="Buscar caja o usuario..." value={q} onChange={e => setQ(e.target.value)} /><input type="date" style={{ width: 170 }} value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="cards">{shown.map(b => <div className="card" key={b.id}><div className="row"><b>{b.name}</b><span className={'tag ' + (b.status === 'abierta' ? 'g' : '')}>{b.status === 'abierta' ? 'Abierta' : 'Cerrada'}</span></div>
        {!scope && <small>🏬 {bname(b.branch_id)}</small>}<small>👤 {b.user_email}</small><small>Ingresos del turno</small><b style={{ fontSize: 26 }}>{money(tot(b))}</b>
        <small>{mine(b).length} ventas · apertura {money(b.opening_amount)}</small>
        <small>Efectivo esperado: <b>{money(b.status === 'abierta' ? expected(b) : b.expected_amount)}</b>{b.status !== 'abierta' && <> · contado {money(b.closing_amount)} · dif. {money(b.closing_amount - b.expected_amount)}</>}</small>
        <small>🟢 {t(b.opened_at)} {b.closed_at && ` · 🔴 ${t(b.closed_at)}`}</small>
        {b.status === 'abierta' && (b.user_email === user?.email || isAdmin) && <button className="btn" onClick={() => setCl({ b, n: '', e: '' })}>Cerrar caja</button>}</div>)}
        {!shown.length && <p className="sub">No hay cajas en esta fecha.</p>}</div></div>
    <div className="panel"><b>Movimientos</b><table><thead><tr><th>Hora</th><th>Caja</th><th>Detalle</th><th>Método</th><th>Monto</th></tr></thead><tbody>
      {sales.map(s => <tr key={s.id}><td>{t(s.created_at)}</td><td>{boxes.find(b => b.id === s.cash_id)?.name || '-'}</td><td>Venta {s.number}{s.paid === false && ' (por cobrar)'}</td><td>{s.payment}</td><td style={{ color: 'var(--ok)', fontWeight: 600 }}>+ {money(s.total)}</td></tr>)}
      {exp.map(e => <tr key={e.id}><td>{t(e.created_at)}</td><td>{boxes.find(b => b.id === e.cash_id)?.name || '-'}</td><td>{e.concept}</td><td>{e.method}</td><td style={{ color: '#b91c1c', fontWeight: 600 }}>- {money(e.amount)}</td></tr>)}</tbody></table></div>
    {cl && <Modal title={`Cerrar ${cl.b.name}`} onClose={() => setCl(null)}><Err e={cl.e} /><div className="row"><span>Apertura</span><b>{money(cl.b.opening_amount)}</b></div><div className="row"><span>+ Ventas cobradas en efectivo</span><b>{money(cashIn(cl.b))}</b></div><div className="row"><span>− Egresos en efectivo</span><b>{money(cashOut(cl.b))}</b></div>
      <div className="row"><b>Efectivo esperado</b><b className="price">{money(expected(cl.b))}</b></div><label>Efectivo contado en caja (S/)</label><input type="number" min="0" value={cl.n} placeholder={String(expected(cl.b).toFixed(2))} onChange={e => setCl({ ...cl, n: e.target.value })} />
      {cl.n !== '' && <small>Diferencia: <b style={{ color: +cl.n - expected(cl.b) < 0 ? '#b91c1c' : 'var(--ok)' }}>{money(+cl.n - expected(cl.b))}</b></small>}<button className="btn" onClick={close}>Cerrar caja</button></Modal>}</>)
}
