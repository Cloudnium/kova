'use client'
import { useState } from 'react'
import { useTable, Head, Err, Modal } from '../../../lib/ui'
import { supabase, money, fmtDate, audit } from '../../../lib/supabase'
import { useApp } from '../../../lib/branch'

const ST = { pendiente: ['Pendiente', 'y'], en_proceso: ['En proceso', ''], atendido: ['Atendido', 'g'] }
const days = d => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
const wa = p => { const n = String(p || '').replace(/\D/g, ''); return n ? 'https://wa.me/' + (n.length === 9 ? '51' + n : n) : '' }

export default function Reclamos() {
  const { isAdmin } = useApp(), [rows, load, err] = useTable('claims', 'created_at', 1000)
  const [q, setQ] = useState(''), [flt, setFlt] = useState('todos'), [sel, setSel] = useState(null), [f, setF] = useState({ status: 'pendiente', response: '' }), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const cnt = s => rows.filter(r => r.status === s).length
  const list = rows.filter(r => (flt === 'todos' || r.status === flt) && (r.code + r.name + r.doc_number + r.phone + r.email + r.product + (r.order_ref || '')).toLowerCase().includes(q.toLowerCase()))
  const open = r => { setSel(r); setF({ status: r.status, response: r.response || '' }); setMsg('') }
  const save = async () => {
    setBusy(true); setMsg('')
    if (f.status === 'atendido' && !f.response.trim()) { setBusy(false); return setMsg('Escribe la respuesta que verá el cliente antes de marcarlo como atendido.') }
    const { data: u } = await supabase.auth.getSession(), who = u.session?.user?.email || ''
    const patch = { status: f.status, response: f.response.trim() || null }
    if (patch.response && (patch.response !== (sel.response || '') || sel.status !== f.status)) { patch.responded_at = new Date().toISOString(); patch.responded_by = who }
    const { error } = await supabase.from('claims').update(patch).eq('id', sel.id)
    setBusy(false); if (error) return setMsg(error.message)
    audit('Reclamo ' + sel.code, `Estado: ${ST[f.status][0]}`); setSel(null); load(); window.dispatchEvent(new Event('claims-changed'))
  }
  const del = async () => {
    if (!window.confirm(`¿Eliminar el reclamo ${sel.code}? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('claims').delete().eq('id', sel.id); if (error) return setMsg(error.message)
    audit('Reclamo eliminado', sel.code); setSel(null); load(); window.dispatchEvent(new Event('claims-changed'))
  }
  return (<><Head t="Reclamos" s="Libro de Reclamaciones: lo que los clientes registran desde el footer de la tienda" />
    <Err e={err} />{/claims/.test(err) && <p style={{ background: '#fef3c7', padding: 12, borderRadius: 8, marginBottom: 12 }}>Ejecuta <code>supabase/schema_v21_reclamos.sql</code> en Supabase (SQL Editor) y recarga la página.</p>}
    <div className="panel">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['todos', 'Todos', rows.length], ['pendiente', 'Pendientes', cnt('pendiente')], ['en_proceso', 'En proceso', cnt('en_proceso')], ['atendido', 'Atendidos', cnt('atendido')]].map(([k, l, n]) =>
          <button key={k} type="button" className={'btn mini ' + (flt === k ? '' : 'o')} style={{ width: 'auto' }} onClick={() => setFlt(k)}>{l} ({n})</button>)}
      </div>
      <input placeholder="Buscar por código, nombre, documento, celular, correo o producto..." value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <table><thead><tr><th>Código</th><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Producto / servicio</th><th>Monto</th><th>Estado</th><th></th></tr></thead><tbody>
        {list.map(r => <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => open(r)}>
          <td><b>{r.code}</b></td><td>{fmtDate(r.created_at)}{r.status !== 'atendido' && days(r.created_at) >= 10 && <><br /><small style={{ color: '#b91c1c' }}>⚠ {days(r.created_at)} días sin atender</small></>}</td>
          <td>{r.name}<br /><small>{r.doc_type} {r.doc_number} · {r.phone}</small></td><td><span className="tag">{r.kind}</span></td><td>{r.product}</td><td>{money(r.amount)}</td>
          <td><span className={'tag ' + ST[r.status][1]}>{ST[r.status][0]}</span></td><td><button className="btn o mini" style={{ width: 'auto' }} onClick={e => { e.stopPropagation(); open(r) }}>Atender</button></td></tr>)}
        {!list.length && <tr><td colSpan={8}>{rows.length ? 'No hay reclamos con ese filtro.' : 'Aún no hay reclamos registrados.'}</td></tr>}</tbody></table>
    </div>
    {sel && <Modal title={`${sel.kind} ${sel.code}`} onClose={() => setSel(null)} wide>
      <Err e={msg} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '6px 18px', marginBottom: 12, fontSize: 14 }}>
        <div><small>Registrado</small><br /><b>{fmtDate(sel.created_at)}</b></div><div><small>Fecha indicada</small><br /><b>{sel.claim_date || '-'}</b></div>
        <div><small>Cliente</small><br /><b>{sel.name}</b></div><div><small>Documento</small><br /><b>{sel.doc_type} {sel.doc_number}</b></div>
        <div><small>Nacionalidad</small><br /><b>{sel.nationality || '-'}</b></div><div><small>Domicilio</small><br /><b>{sel.address}</b></div>
        <div><small>Teléfono</small><br /><b>{sel.phone}</b> {wa(sel.phone) && <a href={wa(sel.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}</div>
        <div><small>Correo</small><br /><b>{sel.email}</b> <a href={'mailto:' + sel.email}>Escribir</a></div>
        <div><small>Producto o servicio</small><br /><b>{sel.product}</b></div><div><small>N.º de pedido</small><br /><b>{sel.order_ref || '-'}</b></div>
        <div><small>Monto reclamado</small><br /><b>{money(sel.amount)}</b></div><div><small>Conciliación</small><br /><b>{sel.desire || '-'}</b></div>
      </div>
      <label>Descripción de los hechos</label><p style={{ whiteSpace: 'pre-wrap', background: '#faf7f6', padding: 10, borderRadius: 8, margin: '4px 0 12px' }}>{sel.detail}</p>
      <label>Estado</label><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{Object.entries(ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
      <label>Respuesta al cliente (la verá al consultar su reclamo en la tienda)</label>
      <textarea rows={5} maxLength={3000} value={f.response} onChange={e => setF({ ...f, response: e.target.value })} placeholder="Escribe la respuesta o solución que se le dará al cliente..." />
      {sel.responded_at && <small>Última respuesta: {fmtDate(sel.responded_at)} · {sel.responded_by}</small>}
      <button className="btn g" onClick={save} disabled={busy}>{busy ? 'Guardando...' : 'Guardar'}</button>
      <button className="btn o" onClick={() => setSel(null)}>Cerrar</button>
      {isAdmin && <button className="btn o" style={{ color: '#b91c1c' }} onClick={del}>Eliminar reclamo</button>}
    </Modal>}
  </>)
}
