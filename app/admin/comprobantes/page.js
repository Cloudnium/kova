'use client'
import { useState } from 'react'
import { money, fmtDate, rpc } from '../../../lib/supabase'
import { useApp, useScope } from '../../../lib/branch'
import { useTable, Head, Err } from '../../../lib/ui'
import { printTicket } from '../../../lib/tickets'
import { TicketModal } from '../../../lib/ticketui'
import Link from 'next/link'
const PER = 10
export default function Comprobantes() {
  const { allBranches, settings, refreshPending } = useApp(), scope = useScope()
  const [all, load, err] = useTable('sales', 'created_at', 1000, true), [q, setQ] = useState(''), [tp, setTp] = useState(''), [st, setSt] = useState(''), [pg, setPg] = useState(0), [v, setV] = useState(null), [e2, setE2] = useState('')
  const rows = all.filter(s => s.status !== 'pendiente' && s.number)
  const bname = id => allBranches.find(b => b.id === id)?.name || ''
  const ctxOf = s => ({ settings, branch: allBranches.find(b => b.id === s.branch_id) })
  const list = rows.filter(s => ((s.number || '') + (s.order_number || '') + s.customer_name + (s.phone || '')).toLowerCase().includes(q.toLowerCase()) && (!tp || s.voucher === tp) && (!st || s.status === st))
  const pages = Math.max(1, Math.ceil(list.length / PER))
  const annul = async s => { if (!window.confirm(`¿Anular ${s.number}? El stock volverá a la sede.`)) return; const x = await rpc('annul_sale', { p_id: s.id }); if (x.error) return setE2(x.error); setE2(''); load(); refreshPending() }
  const tag = s => <span className={'tag ' + { completado: s.paid === false ? 'y' : 'g', anulado: 'r' }[s.status]}>{s.status === 'anulado' ? 'Anulado' : s.paid === false ? 'Por cobrar' : 'Pagado'}</span>
  const pend = all.filter(s => s.status === 'pendiente' && s.source === 'web').length
  return (<><Head t="Comprobantes" s="Notas de venta, boletas y facturas emitidas" /><Err e={err || e2} />
    <div className="kpis"><div className="kpi"><span>Total comprobantes</span><b>{rows.length}</b></div><div className="kpi"><span>Facturado</span><b>{money(rows.filter(s => s.status === 'completado').reduce((a, s) => a + +s.total, 0))}</b></div>
      <div className="kpi" style={{ borderLeftColor: '#f59e0b' }}><span>Pedidos web por confirmar</span><b>{pend}</b>{pend > 0 && <small><Link href="/admin/pedidos" style={{ color: 'var(--red)', fontWeight: 700 }}>Ir a Pedidos web →</Link></small>}</div></div>
    <div className="panel"><div className="row" style={{ marginBottom: 12 }}><input placeholder="Buscar por número, cliente o celular..." value={q} onChange={e => { setQ(e.target.value); setPg(0) }} />
      <select style={{ width: 170 }} value={tp} onChange={e => setTp(e.target.value)}><option value="">Todos los tipos</option>{['Boleta', 'Factura', 'Nota de Venta'].map(t => <option key={t}>{t}</option>)}</select>
      <select style={{ width: 190 }} value={st} onChange={e => setSt(e.target.value)}><option value="">Todos los estados</option><option value="completado">Emitidos</option><option value="anulado">Anulados</option></select></div>
      <table><thead><tr><th>Número</th><th>Tipo</th><th>Origen</th>{!scope && <th>Sede</th>}<th>Cliente</th><th>Fecha</th><th>Método</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {list.slice(pg * PER, pg * PER + PER).map(s => <tr key={s.id}><td><b>{s.number}</b>{s.order_number && <><br /><small>{s.order_number}</small></>}</td><td><span className="tag y">{s.voucher}</span></td><td>{s.source === 'web' ? 'Web' : 'Tienda'}</td>{!scope && <td>{bname(s.branch_id)}</td>}<td>{s.customer_name}<br /><small>{s.customer_doc || s.phone}</small></td><td>{fmtDate(s.created_at)}</td><td>{s.payment}</td><td><b>{money(s.total)}</b></td><td>{tag(s)}</td>
          <td style={{ whiteSpace: 'nowrap' }}><button className="chip" title="Ver" onClick={() => setV(s)}>👁</button> <button className="chip" title="Imprimir" onClick={() => printTicket(s, ctxOf(s))}>🖨</button> {s.status !== 'anulado' && <button className="chip" onClick={() => annul(s)}>Anular</button>}</td></tr>)}
        {!list.length && <tr><td colSpan="10">No hay comprobantes.</td></tr>}</tbody></table>
      <div className="row" style={{ marginTop: 12 }}><small>Mostrando {list.length ? pg * PER + 1 : 0} a {Math.min(list.length, pg * PER + PER)} de {list.length}</small><div><button className="btn o mini" disabled={!pg} onClick={() => setPg(pg - 1)}>‹</button> {pg + 1}/{pages} <button className="btn o mini" disabled={pg + 1 >= pages} onClick={() => setPg(pg + 1)}>›</button></div></div></div>
    {v && <TicketModal sale={v} ctx={ctxOf(v)} onClose={() => setV(null)} />}</>)
}
