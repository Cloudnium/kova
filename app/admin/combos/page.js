'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase, money, audit } from '../../../lib/supabase'
import { useScope } from '../../../lib/branch'
import { useStockMap, useTable, Modal, Head, Err, Seg } from '../../../lib/ui'
import { compressImage, upload, publicUrl, rnd } from '../../../lib/images'
import { Ico } from '../../../lib/icons'
import { DAYS, promoLive, promoWhen, promoPrice } from '../../../lib/promo'

const EC = { name: '', description: '', price: '', image_url: '', active: true, items: [] }
const EP = { name: '', description: '', active: true, start_date: '', end_date: '', days: [], disc_type: 'percent', value: '', product_ids: [] }

export default function CombosPromos() {
  const scope = useScope(), [tab, setTab] = useState('Combos')
  const [prods, loadP, eP] = useTable('products', 'name'), [promos, loadPr, ePr] = useTable('promotions', 'created_at', 200), [sm] = useStockMap()
  const [ci, setCi] = useState([]), [c, setC] = useState(null), [p, setP] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [q, setQ] = useState('')
  const loadCi = () => supabase.from('combo_items').select('*').limit(5000).then(r => setCi(r.data || []))
  useEffect(() => { loadCi() }, [])
  const base = useMemo(() => prods.filter(x => x.kind !== 'combo'), [prods]), combos = useMemo(() => prods.filter(x => x.kind === 'combo'), [prods])
  const byId = useMemo(() => Object.fromEntries(prods.map(x => [x.id, x])), [prods])
  const parts = id => ci.filter(x => x.combo_id === id)
  const e0 = eP || ePr

  // ---------- Combos ----------
  const editC = x => { setErr(''); setC({ ...x, price: x.price, items: parts(x.id).map(i => ({ product_id: i.product_id, qty: i.qty })) }) }
  const sumReg = it => it.reduce((s, i) => s + (+byId[i.product_id]?.price || 0) * (+i.qty || 0), 0)
  const addItem = id => setC(v => v.items.find(i => i.product_id === id) ? { ...v, items: v.items.map(i => i.product_id === id ? { ...i, qty: i.qty + 1 } : i) } : { ...v, items: [...v.items, { product_id: id, qty: 1 }] })
  const saveC = async () => {
    setErr(''); const items = c.items.filter(i => +i.qty > 0)
    if (!c.name.trim()) return setErr('Escribe el nombre del combo'); if (!items.length) return setErr('Agrega al menos un producto al combo'); if (c.price === '' || +c.price < 0) return setErr('Escribe el precio del combo')
    setBusy(true)
    const body = { name: c.name.trim(), description: (c.description || '').trim() || null, price: +c.price, old_price: sumReg(items) > +c.price ? Math.round(sumReg(items) * 100) / 100 : null, image_url: c.image_url || null, active: c.active, kind: 'combo', is_pack: true, category: 'Combos', min_stock: 0, sku: c.sku || '' }
    const r = c.id ? await supabase.from('products').update(body).eq('id', c.id).select().single() : await supabase.from('products').insert(body).select().single()
    if (r.error) { setBusy(false); return setErr(r.error.message + (/kind|column/.test(r.error.message) ? ' · ¿Ejecutaste schema_v9.sql?' : '')) }
    const id = r.data.id, del = await supabase.from('combo_items').delete().eq('combo_id', id)
    if (del.error) { setBusy(false); return setErr(del.error.message) }
    const ins = await supabase.from('combo_items').insert(items.map(i => ({ combo_id: id, product_id: i.product_id, qty: +i.qty })))
    setBusy(false); if (ins.error) return setErr(ins.error.message)
    audit(c.id ? 'Combo editado' : 'Combo creado', body.name); setC(null); loadP(); loadCi(); window.dispatchEvent(new Event('stock-changed'))
  }
  const toggleC = async x => { await supabase.from('products').update({ active: !x.active }).eq('id', x.id); audit(x.active ? 'Combo desactivado' : 'Combo activado', x.name); loadP() }
  const upC = async file => {
    if (!file) return; setBusy(true); setErr('')
    try { const blob = await compressImage(file, { max: 1000 }), path = await upload('products', rnd() + '.webp', blob, 'image/webp'); setC(x => ({ ...x, image_url: publicUrl('products', path) })) }
    catch (e) { setErr('No se pudo subir la imagen: ' + e.message) }
    setBusy(false)
  }

  // ---------- Promociones ----------
  const editP = x => { setErr(''); setP({ ...x, start_date: x.start_date || '', end_date: x.end_date || '', days: x.days || [], product_ids: x.product_ids || [] }) }
  const tog = (arr, v) => arr.includes(v) ? arr.filter(y => y !== v) : [...arr, v]
  const saveP = async () => {
    setErr(''); if (!p.name.trim()) return setErr('Escribe el nombre de la promoción'); if (!p.product_ids.length) return setErr('Elige al menos un producto o combo')
    if (p.value === '' || +p.value < 0) return setErr('Escribe el descuento o el precio promocional'); if (p.disc_type === 'percent' && +p.value > 100) return setErr('El descuento no puede pasar de 100%')
    if (p.start_date && p.end_date && p.end_date < p.start_date) return setErr('La fecha final es anterior a la inicial')
    setBusy(true)
    const body = { name: p.name.trim(), description: (p.description || '').trim() || null, active: p.active, start_date: p.start_date || null, end_date: p.end_date || null, days: [...p.days].sort(), disc_type: p.disc_type, value: +p.value, product_ids: p.product_ids }
    const r = p.id ? await supabase.from('promotions').update(body).eq('id', p.id) : await supabase.from('promotions').insert(body)
    setBusy(false); if (r.error) return setErr(r.error.message + (/promotions|schema cache/.test(r.error.message) ? ' · ¿Ejecutaste schema_v9.sql?' : ''))
    audit(p.id ? 'Promoción editada' : 'Promoción creada', body.name); setP(null); loadPr()
  }
  const toggleP = async x => { await supabase.from('promotions').update({ active: !x.active }).eq('id', x.id); audit(x.active ? 'Promoción pausada' : 'Promoción activada', x.name); loadPr() }
  const delP = async x => { if (!confirm(`¿Eliminar la promoción "${x.name}"?`)) return; await supabase.from('promotions').delete().eq('id', x.id); audit('Promoción eliminada', x.name); loadPr() }
  const cand = useMemo(() => prods.filter(x => x.active && (x.name + (x.sku || '')).toLowerCase().includes(q.toLowerCase())), [prods, q])
  const preview = x => { const r = promoPrice(x, [{ ...p, active: true, start_date: '', end_date: '', days: [] }]); return r.price }
  const state = x => !x.active ? ['r', 'Pausada'] : promoLive(x) ? ['g', 'Vigente ahora'] : x.end_date && x.end_date < new Date().toISOString().slice(0, 10) ? ['r', 'Terminada'] : ['y', 'Programada']
  const cstock = x => sm[x.id]?.stock ?? 0

  return (<><Head t="Combos y promociones" s="Combos = varios productos por un precio. Promociones = descuentos por fechas o días de la semana. Ambos se venden en el POS y en la tienda web.">
      <button className="btn" onClick={() => { setErr(''); tab === 'Combos' ? setC(EC) : setP(EP) }}><Ico n="plus" s={16} /> {tab === 'Combos' ? 'Nuevo combo' : 'Nueva promoción'}</button></Head>
    <Err e={e0} /><div style={{ marginBottom: 14 }}><Seg opts={['Combos', 'Promociones']} v={tab} set={setTab} /></div>

    {tab === 'Combos' && <div className="panel"><table><thead><tr><th>Combo</th><th>Incluye</th><th>Precio</th><th>Disponible{scope ? '' : ' (todas)'}</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {combos.map(x => <tr key={x.id}><td><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><div className="thumb">{x.image_url ? <img src={x.image_url} alt="" /> : <Ico n="box" />}</div><b>{x.name}</b></div></td>
        <td><small>{parts(x.id).map(i => `${i.qty}× ${byId[i.product_id]?.name || '?'}`).join(' · ') || '—'}</small></td>
        <td style={{ whiteSpace: "nowrap" }}><b>{money(x.price)}</b>{x.old_price > x.price && <><br /><small><s>{money(x.old_price)}</s></small></>}</td>
        <td><span className={'tag ' + (cstock(x) < 1 ? 'r' : 'g')}>{cstock(x)} combos</span></td>
        <td><span className={'tag ' + (x.active ? 'g' : 'r')}>{x.active ? 'Activo' : 'Inactivo'}</span></td>
        <td><div style={{ display: 'flex', gap: 14 }}><button className="icb" style={{ color: '#2563eb' }} title="Editar" onClick={() => editC(x)}><Ico n="edit" /></button><button className="icb" style={{ color: x.active ? '#dc2626' : '#16a34a' }} title={x.active ? 'Desactivar' : 'Activar'} onClick={() => toggleC(x)}><Ico n="power" /></button></div></td></tr>)}
      {!combos.length && <tr><td colSpan={6}>Aún no hay combos. Crea el primero con «Nuevo combo».</td></tr>}</tbody></table>
      <small style={{ color: 'var(--mut)' }}>El stock del combo se calcula con el de sus productos en cada sede; al venderlo se descuentan sus productos.</small></div>}

    {tab === 'Promociones' && <div className="panel"><table><thead><tr><th>Promoción</th><th>Descuento</th><th>Aplica a</th><th>Cuándo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {promos.map(x => { const [k, t] = state(x); return <tr key={x.id}><td><b>{x.name}</b>{x.description && <><br /><small style={{ color: 'var(--mut)' }}>{x.description}</small></>}</td>
        <td><b>{x.disc_type === 'percent' ? `${+x.value}% dscto.` : `Precio ${money(x.value)}`}</b></td>
        <td><small>{(x.product_ids || []).slice(0, 4).map(id => byId[id]?.name || '(eliminado)').join(' · ')}{(x.product_ids || []).length > 4 ? ` +${x.product_ids.length - 4} más` : ''}</small></td>
        <td><small>{promoWhen(x)}</small></td><td><span className={'tag ' + k}>{t}</span></td>
        <td><div style={{ display: 'flex', gap: 14 }}><button className="icb" style={{ color: '#2563eb' }} title="Editar" onClick={() => editP(x)}><Ico n="edit" /></button><button className="icb" style={{ color: x.active ? '#dc2626' : '#16a34a' }} title={x.active ? 'Pausar' : 'Activar'} onClick={() => toggleP(x)}><Ico n="power" /></button><button className="icb" style={{ color: '#dc2626' }} title="Eliminar" onClick={() => delP(x)}>✕</button></div></td></tr> })}
      {!promos.length && <tr><td colSpan={6}>Aún no hay promociones. Crea una con «Nueva promoción».</td></tr>}</tbody></table>
      <small style={{ color: 'var(--mut)' }}>Si un producto tiene varias promociones vigentes a la vez, se aplica la que deja el precio más bajo. Horario de Lima.</small></div>}

    {c && <Modal title={c.id ? 'Editar combo' : 'Nuevo combo'} onClose={() => setC(null)} wide><Err e={err} />
      <label>Nombre del combo</label><input value={c.name} onChange={e => setC({ ...c, name: e.target.value })} placeholder="Ej. Combo Ron + Gaseosa" />
      <label>Descripción <small style={{ color: 'var(--mut)', fontWeight: 400 }}>(se ve al abrir el combo en la tienda)</small></label>
      <textarea rows={3} maxLength={600} style={{ width: '100%', minHeight: 72, flexShrink: 0, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 10, font: 'inherit' }} value={c.description || ''} onChange={e => setC({ ...c, description: e.target.value })} />
      <label>Productos que incluye</label>
      <select value="" onChange={e => e.target.value && addItem(e.target.value)}><option value="">+ Agregar producto…</option>{base.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.name} · {money(x.price)}</option>)}</select>
      <div>{c.items.map(i => <div className="row" key={i.product_id} style={{ marginBottom: 6 }}><span style={{ flex: 1 }}>{byId[i.product_id]?.name || '?'}</span><small>{money(byId[i.product_id]?.price)} c/u</small>
        <input type="number" min="1" style={{ width: 64 }} value={i.qty} onChange={e => setC({ ...c, items: c.items.map(y => y.product_id === i.product_id ? { ...y, qty: Math.max(1, parseInt(e.target.value, 10) || 1) } : y) })} />
        <button type="button" className="chip" onClick={() => setC({ ...c, items: c.items.filter(y => y.product_id !== i.product_id) })}>✕</button></div>)}
        {!c.items.length && <small style={{ color: 'var(--mut)' }}>Aún no agregaste productos.</small>}</div>
      <div className="fgrid"><div><label>Precio del combo (S/)</label><input type="number" min="0" step="0.01" value={c.price} onChange={e => setC({ ...c, price: e.target.value })} /></div>
        <div><label>Suma de precios normales</label><input readOnly value={money(sumReg(c.items))} /></div></div>
      {sumReg(c.items) > +c.price && c.price !== '' && <small style={{ color: 'var(--ok)' }}>El cliente ahorra {money(sumReg(c.items) - +c.price)} frente a comprar los productos sueltos.</small>}
      <label>Imagen del combo</label>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><div className="thumb" style={{ width: 90, height: 90 }}>{c.image_url ? <img src={c.image_url} alt="" /> : <Ico n="box" s={30} />}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><label className="btn o" style={{ cursor: 'pointer', textAlign: 'center', margin: 0 }}>{busy ? 'Subiendo...' : 'Subir desde mi dispositivo'}<input type="file" accept="image/*" hidden disabled={busy} onChange={e => { upC(e.target.files[0]); e.target.value = '' }} /></label>
          {c.image_url && <button type="button" className="btn o mini" onClick={() => setC({ ...c, image_url: '' })}>Quitar imagen</button>}</div></div>
      <label><input type="checkbox" style={{ width: 'auto' }} checked={c.active} onChange={e => setC({ ...c, active: e.target.checked })} /> Activo (visible en POS y tienda)</label>
      <button className="btn" disabled={busy} onClick={saveC}>Guardar combo</button></Modal>}

    {p && <Modal title={p.id ? 'Editar promoción' : 'Nueva promoción'} onClose={() => setP(null)} wide><Err e={err} />
      <label>Nombre</label><input value={p.name} onChange={e => setP({ ...p, name: e.target.value })} placeholder="Ej. Semana del Pisco · Martes de Ron" />
      <label>Descripción <small style={{ color: 'var(--mut)', fontWeight: 400 }}>(opcional)</small></label><input value={p.description || ''} onChange={e => setP({ ...p, description: e.target.value })} />
      <label>Tipo de descuento</label><Seg opts={['% de descuento', 'Precio promocional']} v={p.disc_type === 'percent' ? '% de descuento' : 'Precio promocional'} set={v => setP({ ...p, disc_type: v[0] === '%' ? 'percent' : 'price' })} />
      <div><label>{p.disc_type === 'percent' ? 'Descuento (%)' : 'Precio final por unidad (S/)'}</label><input type="number" min="0" step="0.01" value={p.value} onChange={e => setP({ ...p, value: e.target.value })} /></div>
      <div className="fgrid"><div><label>Desde (opcional)</label><input type="date" value={p.start_date} onChange={e => setP({ ...p, start_date: e.target.value })} /></div><div><label>Hasta (opcional, inclusive)</label><input type="date" value={p.end_date} onChange={e => setP({ ...p, end_date: e.target.value })} /></div></div>
      <label>Días de la semana <small style={{ color: 'var(--mut)', fontWeight: 400 }}>(sin marcar = todos los días)</small></label>
      <div className="chips">{[1, 2, 3, 4, 5, 6, 0].map(d => <button type="button" key={d} className={'chip' + (p.days.includes(d) ? ' on' : '')} onClick={() => setP({ ...p, days: tog(p.days, d) })}>{DAYS[d]}</button>)}</div>
      <label>Productos y combos en promoción <small style={{ color: 'var(--mut)', fontWeight: 400 }}>({p.product_ids.length} elegidos)</small></label>
      <input placeholder="Buscar para elegir…" value={q} onChange={e => setQ(e.target.value)} />
      <div style={{ maxHeight: 230, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 6 }}>{cand.map(x => <label key={x.id} className="row" style={{ padding: '5px 6px', margin: 0, cursor: 'pointer' }}>
        <input type="checkbox" style={{ width: 'auto', flex: 'none' }} checked={p.product_ids.includes(x.id)} onChange={() => setP({ ...p, product_ids: tog(p.product_ids, x.id) })} />
        <span style={{ flex: 1 }}>{x.kind === 'combo' ? '🎁 ' : ''}{x.name}</span><small>{money(x.price)}{p.value !== '' && p.product_ids.includes(x.id) ? ` → ${money(preview(x))}` : ''}</small></label>)}</div>
      <label><input type="checkbox" style={{ width: 'auto' }} checked={p.active} onChange={e => setP({ ...p, active: e.target.checked })} /> Activa (si la pausas deja de aplicarse aunque esté en fecha)</label>
      <button className="btn" disabled={busy} onClick={saveP}>Guardar promoción</button></Modal>}</>)
}
