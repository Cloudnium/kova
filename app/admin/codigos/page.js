'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, money, fmtDate, rpc } from '../../../lib/supabase'
import { useApp } from '../../../lib/branch'
import { Modal, Head, Err } from '../../../lib/ui'
import { limaNow } from '../../../lib/promo'

const E = { id: null, code: '', description: '', applies_to: 'productos', disc_type: 'percent', value: '', min_purchase: '', max_discount: '', max_uses: '', per_customer: '1', starts_at: '', expires_at: '', branch_id: '', active: true }
const ST = { Disponible: 'g', Programado: 'y', Agotado: 'r', Vencido: 'r', Pausado: '' }
const dmy = d => d ? d.split('-').reverse().join('/') : ''
const rand = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', a = new Uint32Array(6); crypto.getRandomValues(a); return 'KOVA' + Array.from(a, n => A[n % A.length]).join('') }
const rule = c => c.applies_to === 'delivery' ? (c.disc_type === 'percent' ? (+c.value >= 100 ? 'Delivery GRATIS' : `${+c.value}% del delivery`) : `${money(c.value)} del delivery`) : (c.disc_type === 'percent' ? `${+c.value}% de la compra` : `${money(c.value)} de la compra`)

export default function Codigos() {
  const { allBranches } = useApp(), [codes, setCodes] = useState([]), [reds, setReds] = useState([]), [err, setErr] = useState(''), [tab, setTab] = useState('codigos'), [flt, setFlt] = useState('Todos'), [q, setQ] = useState('')
  const [f, setF] = useState(null), [fe, setFe] = useState(''), [busy, setBusy] = useState(false), [hist, setHist] = useState(null), [copied, setCopied] = useState('')
  const bname = id => allBranches.find(b => b.id === id)?.name || ''
  const load = useCallback(async () => {
    const [c, r] = await Promise.all([supabase.from('discount_codes').select('*').order('created_at', { ascending: false }).limit(1000), supabase.from('discount_redemptions').select('*').order('used_at', { ascending: false }).limit(5000)])
    const e = c.error || r.error; setErr(e ? e.message + (/does not exist|schema cache|Could not find/.test(e.message) ? ' · Ejecuta supabase/schema_v22_codigos_descuento.sql en Supabase (SQL Editor).' : '') : '')
    setCodes(c.data || []); setReds(r.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const today = limaNow().date
  const stats = useMemo(() => { const m = {}; reds.forEach(r => { const s = m[r.code_id] ||= { used: 0, last: null, total: 0 }; if (!r.released_at) { s.used++; s.total += +r.discount; if (!s.last) s.last = r.used_at } }); return m }, [reds])
  const status = c => { const u = stats[c.id]?.used || 0
    if (!c.active) return 'Pausado'; if (c.expires_at && today > c.expires_at) return 'Vencido'; if (c.starts_at && today < c.starts_at) return 'Programado'; if (c.max_uses && u >= c.max_uses) return 'Agotado'; return 'Disponible' }
  const rows = useMemo(() => codes.filter(c => {
    const s = status(c), u = stats[c.id]?.used || 0, t = q.trim().toLowerCase()
    const okF = { Todos: true, Usados: u > 0, 'Sin usar': u === 0, Disponibles: s === 'Disponible', Agotados: s === 'Agotado', Vencidos: s === 'Vencido', Pausados: s === 'Pausado' }[flt]
    if (!okF) return false
    return !t || c.code.toLowerCase().includes(t) || (c.description || '').toLowerCase().includes(t) || (c.created_by_name || '').toLowerCase().includes(t) }), [codes, stats, flt, q, today])
  const live = reds.filter(r => !r.released_at)
  const histRows = useMemo(() => reds.filter(r => (!hist || r.code_id === hist.id) && (!q.trim() || [r.code, r.customer_name, r.phone, r.order_number].some(x => (x || '').toLowerCase().includes(q.trim().toLowerCase())))), [reds, hist, q])

  const save = async () => {
    setFe(''); setBusy(true)
    const x = await rpc('save_discount_code', { p: { ...f, code: f.code.trim().toUpperCase(), branch_id: f.branch_id || null, max_discount: f.disc_type === 'percent' ? f.max_discount : '' } }); setBusy(false)
    if (x.error) return setFe(x.error + (/Could not find the function|schema cache/.test(x.error) ? ' · Ejecuta schema_v22_codigos_descuento.sql' : '')); setF(null); load()
  }
  const toggle = async c => { const x = await rpc('set_discount_active', { p_id: c.id, p_active: !c.active }); x.error ? setErr(x.error) : load() }
  const del = async c => { if (!window.confirm(`¿Eliminar el código ${c.code}? No se puede deshacer.`)) return; const x = await rpc('delete_discount_code', { p_id: c.id }); x.error ? setErr(x.error) : load() }
  const copy = async c => { try { await navigator.clipboard.writeText(c.code); setCopied(c.id); setTimeout(() => setCopied(''), 1800) } catch (e) {} }
  const edit = c => { setFe(''); setF({ ...E, ...c, description: c.description || '', min_purchase: +c.min_purchase || '', max_discount: c.max_discount ?? '', max_uses: c.max_uses ?? '', per_customer: String(c.per_customer), starts_at: c.starts_at || '', expires_at: c.expires_at || '', branch_id: c.branch_id || '' }) }
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const usedRows = f?.id ? stats[f.id]?.used || 0 : 0

  return (<><Head t="Código de descuento" s="Crea códigos para el carrito de la tienda y revisa quién los creó, cuándo y si ya se usaron"><button className="btn" onClick={() => { setFe(''); setF({ ...E, code: rand() }) }}>+ Nuevo código</button></Head><Err e={err} />
    <div className="dc-kpis">
      <div><small>Códigos disponibles</small><b>{codes.filter(c => status(c) === 'Disponible').length}</b></div>
      <div><small>Códigos ya usados</small><b>{codes.filter(c => stats[c.id]?.used).length}</b></div>
      <div><small>Usos totales</small><b>{live.length}</b></div>
      <div><small>Descuento entregado</small><b>{money(live.reduce((a, r) => a + +r.discount, 0))}</b></div></div>
    <div className="chips" style={{ marginTop: 0 }}>
      <button className={'chip' + (tab === 'codigos' ? ' on' : '')} onClick={() => { setTab('codigos'); setHist(null) }}>Códigos ({codes.length})</button>
      <button className={'chip' + (tab === 'usos' ? ' on' : '')} onClick={() => setTab('usos')}>Historial de usos ({reds.length})</button></div>
    <div className="panel">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input style={{ flex: 1, minWidth: 180 }} placeholder={tab === 'codigos' ? 'Buscar por código, descripción o creador...' : 'Buscar por código, cliente, celular o pedido...'} value={q} onChange={e => setQ(e.target.value)} />
        {tab === 'codigos' && <select style={{ width: 160 }} value={flt} onChange={e => setFlt(e.target.value)}>{['Todos', 'Disponibles', 'Usados', 'Sin usar', 'Agotados', 'Vencidos', 'Pausados'].map(o => <option key={o}>{o}</option>)}</select>}
        {tab === 'usos' && hist && <button className="chip on" onClick={() => setHist(null)}>Código: {hist.code} ✕</button>}</div>

      {tab === 'codigos' && <table><thead><tr><th>Código</th><th>Descuento</th><th>Condiciones</th><th>Usos</th><th>Estado</th><th>Creado por</th><th>Último uso</th><th>Acciones</th></tr></thead><tbody>
        {rows.map(c => { const s = status(c), st = stats[c.id], u = st?.used || 0; return <tr key={c.id}>
          <td><span className="dc-code">{c.code}</span> <button className="chip" onClick={() => copy(c)} title="Copiar código">{copied === c.id ? '✓' : 'Copiar'}</button>{c.description && <><br /><small>{c.description}</small></>}</td>
          <td><b>{rule(c)}</b><br /><small>{c.applies_to === 'delivery' ? 'Sobre el delivery' : 'Sobre tu lista de compra'}</small></td>
          <td><small>{+c.min_purchase > 0 ? `Compra desde ${money(c.min_purchase)}` : 'Sin mínimo'}{c.max_discount ? ` · tope ${money(c.max_discount)}` : ''}<br />{c.per_customer > 0 ? `${c.per_customer} uso(s) por celular` : 'Sin límite por celular'}<br />{c.starts_at || c.expires_at ? `${c.starts_at ? 'desde ' + dmy(c.starts_at) : ''} ${c.expires_at ? 'hasta ' + dmy(c.expires_at) : ''}` : 'Sin fecha límite'}<br />{c.branch_id ? bname(c.branch_id) : 'Todas las sedes'}</small></td>
          <td><b>{u}</b>{c.max_uses ? ` / ${c.max_uses}` : ' / ∞'}{st && <><br /><small>{money(st.total)} descontados</small></>}</td>
          <td><span className={'tag ' + ST[s]}>{s}</span>{u > 0 && <><br /><span className="tag y" style={{ marginTop: 4 }}>Usado</span></>}</td>
          <td>{c.created_by_name || c.created_by || '-'}<br /><small>{fmtDate(c.created_at)}</small></td>
          <td>{st?.last ? <small>{fmtDate(st.last)}</small> : <small>Sin usar</small>}</td>
          <td style={{ whiteSpace: 'nowrap' }}><button className="chip" onClick={() => { setHist(c); setQ(''); setTab('usos') }}>Ver usos</button> <button className="chip" onClick={() => edit(c)}>Editar</button> <button className="chip" onClick={() => toggle(c)}>{c.active ? 'Pausar' : 'Activar'}</button> {!u && !reds.some(r => r.code_id === c.id) && <button className="chip" onClick={() => del(c)}>Eliminar</button>}</td></tr> })}
        {!rows.length && <tr><td colSpan="8">{codes.length ? 'No hay códigos con ese filtro.' : 'Aún no creaste códigos. Pulsa «+ Nuevo código».'}</td></tr>}</tbody></table>}

      {tab === 'usos' && <table><thead><tr><th>Código</th><th>Fecha de uso</th><th>Cliente</th><th>Pedido</th><th>Sede</th><th>Descuento</th><th>Estado</th></tr></thead><tbody>
        {histRows.map(r => <tr key={r.id}><td><span className="dc-code">{r.code}</span></td><td>{fmtDate(r.used_at)}</td><td>{r.customer_name || '-'}<br /><small>{r.phone}</small></td><td>{r.order_number || '-'}</td><td>{bname(r.branch_id) || '-'}</td><td><b>{money(r.discount)}</b></td>
          <td>{r.released_at ? <><span className="tag">Liberado</span><br /><small>{fmtDate(r.released_at)}{r.release_reason ? ' · ' + r.release_reason : ''}</small></> : <span className="tag g">Usado</span>}</td></tr>)}
        {!histRows.length && <tr><td colSpan="7">Todavía no hay usos registrados.</td></tr>}</tbody></table>}
    </div>

    {f && <Modal wide title={f.id ? 'Editar código' : 'Nuevo código de descuento'} onClose={() => setF(null)}>
      <Err e={fe} />
      <div className="fgrid"><div><label>Código *</label><input value={f.code} maxLength={24} disabled={usedRows > 0} onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} placeholder="Ej: KOVA10" /></div>
        <div style={{ display: 'flex', alignItems: 'end' }}><button type="button" className="btn o" disabled={usedRows > 0} onClick={() => set('code', rand())}>Generar al azar</button></div></div>
      <label>Descripción (solo la ves tú)</label><input value={f.description} maxLength={200} onChange={e => set('description', e.target.value)} placeholder="Ej: Campaña de Año Nuevo en Instagram" />
      <div className="chips" style={{ margin: '8px 0 0' }}><small style={{ alignSelf: 'center' }}>Atajos:</small>
        <button type="button" className="chip" onClick={() => setF(x => ({ ...x, applies_to: 'delivery', disc_type: 'percent', value: 100, max_discount: '' }))}>🛵 Delivery gratis</button>
        <button type="button" className="chip" onClick={() => setF(x => ({ ...x, applies_to: 'productos', disc_type: 'percent', value: 10 }))}>10 % en la compra</button>
        <button type="button" className="chip" onClick={() => setF(x => ({ ...x, applies_to: 'productos', disc_type: 'fixed', value: 10, min_purchase: 100 }))}>S/ 10 en compras desde S/ 100</button></div>
      <div className="fgrid">
        <div><label>¿Sobre qué se descuenta?</label><select value={f.applies_to} onChange={e => set('applies_to', e.target.value)}><option value="productos">Total de la lista de compra (productos)</option><option value="delivery">Costo del delivery</option></select></div>
        <div><label>Tipo</label><select value={f.disc_type} onChange={e => set('disc_type', e.target.value)}><option value="percent">Porcentaje (%)</option><option value="fixed">Monto fijo (S/)</option></select></div>
        <div><label>{f.disc_type === 'percent' ? 'Porcentaje *' : 'Monto en S/ *'}</label><input type="number" min="0" step="0.01" value={f.value} onChange={e => set('value', e.target.value)} placeholder={f.disc_type === 'percent' ? '10' : '5.00'} /></div></div>
      <div className="fgrid">
        <div><label>Compra mínima en productos (S/)</label><input type="number" min="0" step="0.01" value={f.min_purchase} onChange={e => set('min_purchase', e.target.value)} placeholder="0 = sin mínimo" /></div>
        {f.disc_type === 'percent' && <div><label>Descuento máximo (S/)</label><input type="number" min="0" step="0.01" value={f.max_discount} onChange={e => set('max_discount', e.target.value)} placeholder="Sin tope" /></div>}
        <div><label>Usos totales</label><input type="number" min="1" step="1" value={f.max_uses} onChange={e => set('max_uses', e.target.value)} placeholder="Ilimitado" /></div>
        <div><label>Usos por celular</label><input type="number" min="0" step="1" value={f.per_customer} onChange={e => set('per_customer', e.target.value)} /><small style={{ color: 'var(--mut)' }}>0 = sin límite</small></div></div>
      <div className="fgrid">
        <div><label>Válido desde</label><input type="date" value={f.starts_at} onChange={e => set('starts_at', e.target.value)} /></div>
        <div><label>Válido hasta</label><input type="date" value={f.expires_at} onChange={e => set('expires_at', e.target.value)} /></div>
        <div><label>Sede</label><select value={f.branch_id} onChange={e => set('branch_id', e.target.value)}><option value="">Todas las sedes</option>{allBranches.filter(b => b.active !== false).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div></div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.active} onChange={e => set('active', e.target.checked)} /> Código activo</label>
      <p className="sub" style={{ margin: 0 }}>Resumen: <b>{f.code || '—'}</b> → {f.value ? rule(f) : '...'}{+f.min_purchase > 0 ? `, compras desde ${money(f.min_purchase)}` : ''}{f.max_uses ? `, máximo ${f.max_uses} usos` : ''}.</p>
      <div className="row" style={{ gap: 8 }}><button className="btn o" style={{ flex: 1 }} onClick={() => setF(null)}>Cancelar</button><button className="btn g" style={{ flex: 2 }} disabled={busy || f.code.length < 3 || !(+f.value > 0)} onClick={save}>{busy ? 'Guardando...' : f.id ? 'Guardar cambios' : 'Crear código'}</button></div>
    </Modal>}
  </>)
}
