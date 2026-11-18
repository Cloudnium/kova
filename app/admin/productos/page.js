'use client'
import { useState } from 'react'
import { supabase, money, CATS, audit, rpc } from '../../../lib/supabase'
import { useScope, useApp } from '../../../lib/branch'
import { useTable, useStockMap, Modal, Head, Err } from '../../../lib/ui'
import { compressImage, upload, publicUrl, rnd } from '../../../lib/images'
import { Ico } from '../../../lib/icons'
const E = { name: '', sku: '', category: 'Ron', price: '', old_price: '', stock: 0, stock_warehouse: 0, image_url: '', is_pack: false, active: true }
const LEGACY = ['id', 'created_at', 'stock', 'stock_warehouse']
export default function Productos() {
  const { branch, allBranches } = useApp(), scope = useScope()
  const [rows, load, err] = useTable('products', 'name'), [sm, loadSm, e3] = useStockMap(), [f, setF] = useState(null), [q, setQ] = useState(''), [cat, setCat] = useState(''), [st, setSt] = useState(''), [e2, setE2] = useState(''), [busy, setBusy] = useState(false)
  const S = p => sm[p.id] || { stock: 0, wh: 0, by: {} }
  const save = async () => {
    const d = Object.fromEntries(Object.entries(f).filter(([k]) => !LEGACY.includes(k))), body = { ...d, price: +d.price, old_price: d.old_price === '' || d.old_price == null ? null : +d.old_price }
    const r = f.id ? await supabase.from('products').update(body).eq('id', f.id).select().single() : await supabase.from('products').insert(body).select().single()
    if (r.error) return setE2(r.error.message)
    if (scope) { const x = await rpc('set_branch_stock', { p_branch: scope, p_product: r.data.id, p_stock: +f.stock || 0, p_wh: +f.stock_warehouse || 0 }); if (x.error) return setE2(x.error) }
    audit(f.id ? 'Producto editado' : 'Producto creado', f.name); setE2(''); setF(null); load(); loadSm()
  }
  const up = async file => {
    if (!file) return; setBusy(true); setE2('')
    try { const blob = await compressImage(file, { max: 1000 }), path = await upload('products', rnd() + '.webp', blob, 'image/webp'); setF(x => ({ ...x, image_url: publicUrl('products', path) })) }
    catch (e) { setE2('No se pudo subir la imagen: ' + e.message + '. ¿Ejecutaste schema_v4.sql?') }
    setBusy(false)
  }
  const toggle = async p => { await supabase.from('products').update({ active: !p.active }).eq('id', p.id); audit(p.active ? 'Producto desactivado' : 'Producto activado', p.name); load() }
  const edit = p => { setE2(''); setF({ ...p, old_price: p.old_price ?? '', stock: S(p).stock, stock_warehouse: S(p).wh }) }
  const list = rows.filter(p => (p.name + (p.sku || '')).toLowerCase().includes(q.toLowerCase()) && (!cat || p.category === cat) && (!st || (st === 'on') === p.active))
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const tot = p => S(p).stock + S(p).wh
  return (<><Head t="Productos" s={`Catálogo común a todas las sedes · stock de ${scope ? branch?.name : 'todas las sedes'}`}><button className="btn" onClick={() => { setE2(''); setF(E) }}><Ico n="plus" s={16} /> Nuevo Producto</button></Head><Err e={err || e3} />
    <div className="kpis"><div className="kpi"><span>Total productos</span><b>{rows.length}</b></div><div className="kpi" style={{ borderLeftColor: '#f59e0b' }}><span>Stock bajo / agotado</span><b>{rows.filter(p => S(p).stock > 0 && S(p).stock < 10).length} / {rows.filter(p => S(p).stock < 1).length}</b></div>
      <div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}><span>Valor del inventario (venta)</span><b>{money(rows.reduce((a, p) => a + p.price * tot(p), 0))}</b></div></div>
    <div className="panel"><div className="row" style={{ marginBottom: 12 }}><input placeholder="Buscar por nombre o código..." value={q} onChange={e => setQ(e.target.value)} />
      <select style={{ width: 180 }} value={cat} onChange={e => setCat(e.target.value)}><option value="">Todas</option>{CATS.map(c => <option key={c}>{c}</option>)}</select>
      <select style={{ width: 150 }} value={st} onChange={e => setSt(e.target.value)}><option value="">Todos</option><option value="on">Activos</option><option value="off">Inactivos</option></select></div>
      <table><thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {list.map(p => <tr key={p.id}><td><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><div className="thumb">{p.image_url ? <img src={p.image_url} alt="" /> : <Ico n="box" />}</div><div><b>{p.name}</b>{p.is_pack && ' 🎁'}<br /><small style={{ color: 'var(--mut)' }}>{p.sku}</small></div></div></td>
          <td>{p.category}</td><td><b>{money(p.price)}</b>{p.old_price > p.price && <><br /><small><s>{money(p.old_price)}</s></small></>}</td>
          <td><span className={'tag ' + (S(p).stock < 1 ? 'r' : S(p).stock < 10 ? 'y' : 'g')}>{tot(p)} unidades</span><br /><small style={{ color: 'var(--mut)' }}>Tienda {S(p).stock} · Almacén {S(p).wh}</small>
            {!scope && <><br /><small style={{ color: 'var(--mut)' }}>{Object.entries(S(p).by).map(([b, v]) => `${allBranches.find(x => x.id === b)?.name || '?'}: ${v.stock + v.wh}`).join(' · ')}</small></>}</td>
          <td><span className={'tag ' + (p.active ? 'g' : 'r')}>{p.active ? 'Activo' : 'Inactivo'}</span></td>
          <td><div style={{ display: 'flex', gap: 14 }}><button className="icb" style={{ color: '#2563eb' }} title="Editar" onClick={() => edit(p)}><Ico n="edit" /></button><button className="icb" style={{ color: p.active ? '#dc2626' : '#16a34a' }} title={p.active ? 'Desactivar' : 'Activar'} onClick={() => toggle(p)}><Ico n="power" /></button></div></td></tr>)}
        {!list.length && <tr><td>No hay productos que coincidan.</td></tr>}</tbody></table></div>
    {f && <Modal title={f.id ? 'Editar producto' : 'Nuevo producto'} onClose={() => setF(null)}><Err e={e2} />
      <label>Nombre</label><input value={f.name} onChange={set('name')} /><div className="fgrid"><div><label>Código</label><input value={f.sku || ''} onChange={set('sku')} /></div><div><label>Categoría</label><select value={f.category} onChange={set('category')}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div></div>
      <div className="fgrid"><div><label>Precio (S/)</label><input type="number" value={f.price} onChange={set('price')} /></div><div><label>Precio anterior (oferta)</label><input type="number" value={f.old_price} onChange={set('old_price')} /></div></div>
      {scope ? <><b style={{ fontSize: 13 }}>Stock en {branch?.name}</b><div className="fgrid"><div><label>Stock tienda</label><input type="number" min="0" value={f.stock} onChange={set('stock')} /></div><div><label>Stock almacén</label><input type="number" min="0" value={f.stock_warehouse || 0} onChange={set('stock_warehouse')} /></div></div></>
        : <small style={{ color: 'var(--mut)' }}>Para cargar o cambiar stock elige una sede en la barra superior (cada sede tiene su propio stock).</small>}
      <label>Imagen del producto</label>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><div className="thumb" style={{ width: 90, height: 90 }}>{f.image_url ? <img src={f.image_url} alt="" /> : <Ico n="box" s={30} />}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><label className="btn o" style={{ cursor: 'pointer', textAlign: 'center', margin: 0 }}>{busy ? 'Subiendo...' : 'Subir desde mi dispositivo'}<input type="file" accept="image/*" hidden disabled={busy} onChange={e => { up(e.target.files[0]); e.target.value = '' }} /></label>
          {f.image_url && <button type="button" className="btn o mini" onClick={() => setF({ ...f, image_url: '' })}>Quitar imagen</button>}</div></div>
      <input placeholder="o pega la URL de una imagen" value={f.image_url || ''} onChange={set('image_url')} />
      <label><input type="checkbox" style={{ width: 'auto' }} checked={f.is_pack} onChange={set('is_pack')} /> Es pack</label><label><input type="checkbox" style={{ width: 'auto' }} checked={f.active} onChange={set('active')} /> Activo (visible en web y tienda)</label>
      <button className="btn" disabled={busy || !f.name || f.price === ''} onClick={save}>Guardar producto</button></Modal>}</>)
}
