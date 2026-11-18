'use client'
import { useState } from 'react'
import { supabase, audit } from '../../../lib/supabase'
import { useTable, Modal, Head, Err } from '../../../lib/ui'
const E = { name: '', address: '', city: '', phone: '', ticket_footer: '', web_enabled: true, active: true }
export default function Sedes() {
  const [rows, load, err] = useTable('branches', 'created_at'), [f, setF] = useState(null), [e2, setE2] = useState('')
  const list = [...rows].reverse()
  const save = async () => {
    const { id, created_at, code, series, ...d } = f
    const r = await (id ? supabase.from('branches').update(d).eq('id', id) : supabase.from('branches').insert(d))
    if (r.error) return setE2(r.error.message); audit(id ? 'Sede editada' : 'Sede creada', f.name, id || null); setE2(''); setF(null); load()
  }
  const toggle = async s => { if (s.active !== false && !confirm(`¿Desactivar ${s.name}? Nadie podrá trabajar ni recibir pedidos web en esa sede (el historial se conserva).`)) return
    await supabase.from('branches').update({ active: s.active === false }).eq('id', s.id); audit(s.active === false ? 'Sede activada' : 'Sede desactivada', s.name, s.id); load() }
  return (<><Head t="Sedes" s="Cada sede tiene su propio stock, cajas, series de comprobantes y pedidos web"><button className="btn" onClick={() => { setE2(''); setF(E) }}>+ Nueva Sede</button></Head><Err e={err} />
    <div className="kpis"><div className="kpi"><span>Sedes activas</span><b>{rows.filter(s => s.active !== false).length}</b></div></div>
    <div className="cards">{list.map(s => <div className="card" key={s.id} style={s.active === false ? { opacity: .6 } : undefined}><div className="row"><b>{s.name}</b><span className={'tag ' + (s.active === false ? 'r' : 'g')}>{s.active === false ? 'Inactiva' : 'Activa'}</span></div>
      <small>Series {s.series} · PW{s.code} (pedidos web)</small><span>📍 {[s.address, s.city].filter(Boolean).join(', ') || '-'}</span><span>📞 {s.phone || '-'}</span><small>{s.web_enabled === false ? '🛒 No recibe pedidos web' : '🛒 Recibe pedidos web'}</small>
      <div className="row"><button className="btn o mini" onClick={() => { setE2(''); setF(s) }}>✏️ Editar</button><button className="btn o mini" onClick={() => toggle(s)}>{s.active === false ? 'Activar' : 'Desactivar'}</button></div></div>)}
      {!rows.length && <p className="sub">Aún no hay sedes. Crea la primera.</p>}</div>
    {f && <Modal title={f.id ? 'Editar sede' : 'Nueva sede'} onClose={() => setF(null)}><Err e={e2} />{[['name', 'Nombre'], ['address', 'Dirección (sale en el ticket)'], ['city', 'Ciudad'], ['phone', 'Teléfono (sale en el ticket)'], ['ticket_footer', 'Mensaje al pie del ticket (opcional)']].map(([k, l]) => <div key={k}><label>{l}</label><input value={f[k] || ''} onChange={e => setF({ ...f, [k]: e.target.value })} /></div>)}
      <label><input type="checkbox" style={{ width: 'auto' }} checked={f.web_enabled !== false} onChange={e => setF({ ...f, web_enabled: e.target.checked })} /> Recibe pedidos de la tienda web</label>
      {!f.id && <small style={{ color: 'var(--mut)' }}>La sede nueva empieza con stock 0: cárgalo en Productos o Almacén. Asígnala a tus trabajadores en Usuarios (los administradores ya la ven).</small>}
      <button className="btn" disabled={!f.name} onClick={save}>Guardar</button></Modal>}</>)
}
