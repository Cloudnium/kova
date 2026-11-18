'use client'
import { useState } from 'react'
import { supabase, money, fmtDate, audit } from '../../../lib/supabase'
import { useApp, useScope } from '../../../lib/branch'
import { useTable, Head, Err, AllBanner } from '../../../lib/ui'
const E = { concept: '', category: 'Compra', method: 'Efectivo', amount: '' }
export default function Egresos() {
  const { box, user, allBranches } = useApp(), scope = useScope()
  const [rows, load, err] = useTable('expenses', 'created_at', 500, true), [f, setF] = useState(E), [e2, setE2] = useState('')
  const save = async () => {
    const { error } = await supabase.from('expenses').insert({ ...f, amount: +f.amount, branch_id: scope, user_email: user.email, cash_id: f.method === 'Efectivo' && box ? box.id : null })
    if (error) return setE2(error.message); audit('Egreso registrado', `${f.category}: ${f.concept} · ${money(f.amount)}`); setE2(''); setF(E); load()
  }
  return (<><Head t="Egresos" s="Compras, pagos a personal, servicios y otras salidas de dinero" /><Err e={err || e2} />{!scope && <AllBanner what="registrar egresos" />}
    <div className="kpis"><div className="kpi"><span>Total egresos</span><b>{money(rows.reduce((a, e) => a + +e.amount, 0))}</b></div></div>
    {scope && <div className="panel" style={{ marginBottom: 16 }}><div className="fgrid"><div><label>Concepto</label><input value={f.concept} onChange={e => setF({ ...f, concept: e.target.value })} /></div>
      <div><label>Categoría</label><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{['Compra', 'Pago personal', 'Servicios', 'Alquiler', 'Otros'].map(c => <option key={c}>{c}</option>)}</select></div>
      <div><label>Método</label><select value={f.method} onChange={e => setF({ ...f, method: e.target.value })}>{['Efectivo', 'Yape', 'Tarjeta', 'Transferencia'].map(c => <option key={c}>{c}</option>)}</select></div>
      <div><label>Monto (S/)</label><input type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></div><button className="btn" disabled={!f.concept || !f.amount} onClick={save}>Registrar egreso</button></div>
      {f.method === 'Efectivo' && !box && <small style={{ color: 'var(--mut)' }}>Sin caja abierta: este egreso no descontará del cuadre de caja.</small>}</div>}
    <div className="panel"><table><thead><tr><th>Fecha</th>{!scope && <th>Sede</th>}<th>Concepto</th><th>Categoría</th><th>Método</th><th>Monto</th></tr></thead><tbody>
      {rows.map(e => <tr key={e.id}><td>{fmtDate(e.created_at)}</td>{!scope && <td>{allBranches.find(b => b.id === e.branch_id)?.name}</td>}<td>{e.concept}</td><td><span className="tag">{e.category}</span></td><td>{e.method}</td><td style={{ color: '#b91c1c', fontWeight: 600 }}>- {money(e.amount)}</td></tr>)}</tbody></table></div></>)
}
