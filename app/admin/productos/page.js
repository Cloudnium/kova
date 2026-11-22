'use client'
import { useEffect, useState } from 'react'
import { supabase, money, CATS, audit, rpc } from '../../../lib/supabase'
import { useScope, useApp } from '../../../lib/branch'
import { useTable, useStockMap, Modal, Head, Err } from '../../../lib/ui'
import { compressImage, upload, publicUrl, rnd } from '../../../lib/images'
import { Ico } from '../../../lib/icons'
import { MovesModal } from '../../../lib/movesui'
const E = { name: '', sku: '', category: 'OTROS', price: '', old_price: '', description: '', min_stock: 5, stock: 0, stock_warehouse: 0, image_url: '', cost: '', is_pack: false, active: true }
const LEGACY = ['id', 'created_at', 'stock', 'stock_warehouse']
export default function Productos() {
  const { branch, allBranches } = useApp(), scope = useScope()
  const [allRows, load, err] = useTable('products', 'name'), rows = allRows.filter(p => p.kind !== 'combo'), [sm, loadSm, e3] = useStockMap(), [hist, setHist] = useState(false), [f, setF] = useState(null), [q, setQ] = useState(''), [cat, setCat] = useState(''), [st, setSt] = useState(''), [sf, setSf] = useState(''), [e2, setE2] = useState(''), [busy, setBusy] = useState(false)
  const S = p => sm[p.id] || { stock: 0, wh: 0, by: {} }
  const save = async () => {
    const d = Object.fromEntries(Object.entries(f).filter(([k]) => !LEGACY.includes(k))), body = { ...d, cost: Math.max(0, +d.cost || 0), description: (d.description || '').trim() || null, min_stock: Math.max(0, parseInt(d.min_stock, 10) || 0), price: +d.price, old_price: d.old_price === '' || d.old_price == null ? null : +d.old_price }
    const r = f.id ? await supabase.from('products').update(body).eq('id', f.id).select().single() : await supabase.from('products').insert(body).select().single()
    if (r.error) return setE2(r.error.message)
    if (scope) { const x = await rpc('set_branch_stock', { p_branch: scope, p_product: r.data.id, p_stock: +f.stock || 0, p_wh: +f.stock_warehouse || 0 }); if (x.error) return setE2(x.error) }
    audit(f.id ? 'Producto editado' : 'Producto creado', f.name); setE2(''); setF(null); load(); loadSm(); window.dispatchEvent(new Event('stock-changed'))
  }
  const up = async file => {
    if (!file) return; setBusy(true); setE2('')
    try { const blob = await compressImage(file, { max: 1000 }), path = await upload('products', rnd() + '.webp', blob, 'image/webp'); setF(x => ({ ...x, image_url: publicUrl('products', path) })) }
    catch (e) { setE2('No se pudo subir la imagen: ' + e.message + '. ¿Ejecutaste schema_v4.sql?') }
    setBusy(false)
  }
  const toggle = async p => { await supabase.from('products').update({ active: !p.active }).eq('id', p.id); audit(p.active ? 'Producto desactivado' : 'Producto activado', p.name); load() }
  useEffect(() => { try { if (new URLSearchParams(location.search).get('stock') === 'alerta') setSf('alerta') } catch (e) {} }, [])
  const edit = p => { setE2(''); setF({ ...p, cost: p.cost ?? '', min_stock: p.min_stock ?? 5, old_price: p.old_price ?? '', stock: S(p).stock, stock_warehouse: S(p).wh }) }
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const tot = p => S(p).stock + S(p).wh
  // 'r' agotado · 'y' stock bajo (llegó al mínimo) · 'g' normal. Mínimo 0 = sin alerta
  const lvl = p => tot(p) < 1 ? 'r' : (p.min_stock > 0 && tot(p) <= p.min_stock ? 'y' : 'g')
  const list = rows.filter(p => (p.name + (p.sku || '')).toLowerCase().includes(q.toLowerCase()) && (!cat || p.category === cat) && (!st || (st === 'on') === p.active) && (!sf || (sf === 'agotado' ? tot(p) < 1 : lvl(p) !== 'g')))
  return (<><Head t="Productos" s={`Catálogo común a todas las sedes · stock de ${scope ? branch?.name : 'todas las sedes'}`}><button className="btn" onClick={() => { setE2(''); setF(E) }}><Ico n="plus" s={16} /> Nuevo Producto</button><button className="btn o" onClick={() => setHist(true)}><Ico n="history" s={16} /> Historial de movimientos</button></Head><Err e={err || e3} />
    <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}><div className="kpi"><span>Total productos</span><b>{rows.length}</b></div><div className="kpi" style={{ borderLeftColor: '#f59e0b' }}><span>Stock bajo / agotado</span><b>{rows.filter(p => lvl(p) === 'y').length} / {rows.filter(p => lvl(p) === 'r').length}</b></div>
      <div className="kpi" style={{ borderLeftColor: '#2563eb' }}><span>Valor del inventario (costo)</span><b>{money(rows.reduce((a, p) => a + (+p.cost || 0) * tot(p), 0))}</b></div>
      <div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}><span>Valor del inventario (venta)</span><b>{money(rows.reduce((a, p) => a + p.price * tot(p), 0))}</b></div>
      <div className="kpi" style={{ borderLeftColor: '#9333ea' }}><span>Ganancia potencial</span><b>{money(rows.filter(p => +p.cost > 0).reduce((a, p) => a + (p.price - p.cost) * tot(p), 0))}</b></div></div>
    <div className="panel"><div className="row" style={{ marginBottom: 12 }}><input placeholder="Buscar por nombre o código..." value={q} onChange={e => setQ(e.target.value)} />
      <select style={{ width: 180 }} value={cat} onChange={e => setCat(e.target.value)}><option value="">Todas</option>{CATS.map(c => <option key={c}>{c}</option>)}</select>
      <select style={{ width: 150 }} value={st} onChange={e => setSt(e.target.value)}><option value="">Todos</option><option value="on">Activos</option><option value="off">Inactivos</option></select>
      <select style={{ width: 170 }} value={sf} onChange={e => setSf(e.target.value)}><option value="">Todo el stock</option><option value="alerta">Bajo o agotado</option><option value="agotado">Solo agotados</option></select></div>
      <table><thead><tr><th>Producto</th><th>Categoría</th><th>P. compra</th><th>P. venta</th><th>Ganancia</th><th>Stock</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {list.map(p => <tr key={p.id}><td><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><div className="thumb">{p.image_url ? <img src={p.image_url} alt="" /> : <Ico n="box" />}</div><div><b>{p.name}</b>{p.is_pack && ' 🎁'}<br /><small style={{ color: 'var(--mut)' }}>{p.sku}</small></div></div></td>
          <td>{p.category}</td><td>{+p.cost > 0 ? money(p.cost) : <small style={{ color: 'var(--mut)' }}>Sin costo</small>}</td><td><b>{money(p.price)}</b>{p.old_price > p.price && <><br /><small><s>{money(p.old_price)}</s></small></>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{+p.cost > 0 ? <><b style={{ color: p.price - p.cost >= 0 ? '#16a34a' : '#dc2626' }}>{money(p.price - p.cost)}</b><br /><small style={{ color: 'var(--mut)' }}>{p.price > 0 ? Math.round((p.price - p.cost) / p.price * 100) : 0}% margen</small></> : '—'}</td>
          <td><span className={'tag ' + lvl(p)}>{tot(p)} unidades</span><br /><small style={{ color: 'var(--mut)' }}>Tienda {S(p).stock} · Almacén {S(p).wh} · Mín. {p.min_stock ?? 0}</small>
            {!scope && <><br /><small style={{ color: 'var(--mut)' }}>{Object.entries(S(p).by).map(([b, v]) => `${allBranches.find(x => x.id === b)?.name || '?'}: ${v.stock + v.wh}`).join(' · ')}</small></>}</td>
          <td><span className={'tag ' + (p.active ? 'g' : 'r')}>{p.active ? 'Activo' : 'Inactivo'}</span></td>
          <td><div style={{ display: 'flex', gap: 14 }}><button className="icb" style={{ color: '#2563eb' }} title="Editar" onClick={() => edit(p)}><Ico n="edit" /></button><button className="icb" style={{ color: p.active ? '#dc2626' : '#16a34a' }} title={p.active ? 'Desactivar' : 'Activar'} onClick={() => toggle(p)}><Ico n="power" /></button></div></td></tr>)}
        {!list.length && <tr><td>No hay productos que coincidan.</td></tr>}</tbody></table></div>
    {hist && <MovesModal onClose={() => setHist(false)} scope={scope} scopeName={scope ? branch?.name : ''} products={rows} branches={allBranches} />}
    {f && <Modal title={f.id ? 'Editar producto' : 'Nuevo producto'} onClose={() => setF(null)}><Err e={e2} />
      <label>Nombre</label><input value={f.name} onChange={set('name')} /><label>Descripción <small style={{ color: 'var(--mut)', fontWeight: 400 }}>(se ve al hacer clic en el producto en la tienda)</small></label><textarea rows={4} maxLength={600} style={{ width: '100%', minHeight: 96, flexShrink: 0, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 6, font: 'inherit', resize: 'vertical' }} value={f.description || ''} onChange={set('description')} placeholder="Ej: Ron añejado 3 años, notas de caña y vainilla. Ideal para cócteles." /><div className="fgrid"><div><label>Código</label><input value={f.sku || ''} onChange={set('sku')} /></div><div><label>Categoría</label><select value={f.category} onChange={set('category')}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div></div>
      <div className="fgrid"><div><label>Precio (S/)</label><input type="number" value={f.price} onChange={set('price')} /></div><div><label>Precio anterior (oferta)</label><input type="number" value={f.old_price} onChange={set('old_price')} /></div></div>
      <div><label>Costo unitario (S/)</label><input type="number" min="0" step="0.01" value={f.cost ?? ''} onChange={set('cost')} /><small style={{ color: 'var(--mut)' }}>Lo que te cuesta cada unidad. Se usa para el valor del inventario (costo){+f.cost > 0 && +f.price > 0 ? ` · margen ${Math.round((1 - +f.cost / +f.price) * 100)}%` : ''}.</small></div>
      <div><label>Stock mínimo (alerta de stock bajo)</label><input type="number" min="0" step="1" value={f.min_stock} onChange={set('min_stock')} /><small style={{ color: 'var(--mut)' }}>Cuando el stock (tienda + almacén) llegue a esta cantidad se avisa al entrar al sistema. Cuando llegue a 0 siempre se avisa como agotado. Pon 0 si solo quieres el aviso de agotado.</small></div>
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
