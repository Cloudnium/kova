'use client'
import { useState } from 'react'
import { supabase, audit } from '../../../lib/supabase'
import { useApp } from '../../../lib/branch'
import { useTable, Modal, Head, Err } from '../../../lib/ui'
export default function Usuarios() {
  const { allBranches } = useApp(), act = allBranches.filter(b => b.active !== false)
  const [rows, load, e0] = useTable('profiles'), [f, setF] = useState(null), [err, setErr] = useState('')
  const call = async (method, body) => { const { data } = await supabase.auth.getSession()
    const r = await fetch('/api/users', { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify(body) }); return r.json() }
  const create = async () => { const r = await call('POST', f); if (r.error) return setErr(r.error); audit('Usuario creado', f.email); setF(null); setErr(''); load() }
  const edit = async () => { const r = await call('PATCH', { id: f.id, name: f.name, role: f.role, branch_ids: f.branch_ids }); if (r.error) return setErr(r.error); audit('Usuario editado', f.email); setF(null); setErr(''); load() }
  const toggle = async u => { const r = await call('PATCH', { id: u.id, active: !u.active }); if (r.error) return setErr(r.error); audit(u.active ? 'Usuario anulado' : 'Usuario reactivado', u.email); load() }
  const tgl = id => setF({ ...f, branch_ids: f.branch_ids.includes(id) ? f.branch_ids.filter(x => x !== id) : [...f.branch_ids, id] })
  const names = u => u.role === 'administrador' ? 'Todas' : u.role === 'marketing' ? '—' : (u.branch_ids || []).map(id => allBranches.find(b => b.id === id)?.name).filter(Boolean).join(', ') || 'Ninguna'
  return (<><Head t="Usuarios" s="Quién puede entrar al sistema y a qué sedes"><button className="btn" onClick={() => { setErr(''); setF({ email: '', password: '', name: '', role: 'trabajador', branch_ids: act.map(b => b.id) }) }}>+ Nuevo usuario</button></Head><Err e={err || e0} />
    <div className="panel"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Sedes</th><th>Estado</th><th></th></tr></thead><tbody>
      {rows.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td><small>{names(u)}</small></td><td><span className={'tag ' + (u.active ? 'g' : 'r')}>{u.active ? 'Activo' : 'Anulado'}</span></td>
        <td style={{ whiteSpace: 'nowrap' }}><button className="btn o mini" onClick={() => { setErr(''); setF({ ...u, branch_ids: u.branch_ids || [] }) }}>Editar</button> <button className="btn o mini" onClick={() => toggle(u)}>{u.active ? 'Anular' : 'Reactivar'}</button></td></tr>)}</tbody></table></div>
    {f && <Modal title={f.id ? 'Editar usuario' : 'Nuevo usuario'} onClose={() => setF(null)}><Err e={err} /><input placeholder="Nombre" value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} />
      {!f.id && <><input type="email" placeholder="Correo" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /><input type="password" placeholder="Contraseña (mín. 6)" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></>}
      <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}><option value="trabajador">Trabajador</option><option value="marketing">Marketing (solo fotos de productos y combos, y Anuncios)</option><option value="administrador">Administrador (ve todas las sedes y configuración)</option></select>
      {f.role === 'trabajador' && <><label>Sedes donde puede trabajar</label>{act.map(b => <label key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.branch_ids.includes(b.id)} onChange={() => tgl(b.id)} /> {b.name}</label>)}</>}
      <button className="btn" disabled={f.id ? false : !f.email || f.password.length < 6} onClick={f.id ? edit : create}>{f.id ? 'Guardar cambios' : 'Crear usuario'}</button></Modal>}</>)
}
