'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase, rpc } from '../../../lib/supabase'
import { compressImage, upload, publicUrl, rnd } from '../../../lib/images'
import { Ico } from '../../../lib/icons'
import { Head, Err, Seg } from '../../../lib/ui'

// Marketing (y administrador): solo cambia la foto de productos y combos
export default function Fotos() {
  const [rows, setRows] = useState([]), [err, setErr] = useState(''), [busy, setBusy] = useState(''), [q, setQ] = useState(''), [f, setF] = useState('Todos'), [ok, setOk] = useState('')
  const load = () => supabase.from('products').select('id,name,sku,category,kind,image_url,active').order('name').limit(3000).then(r => { setRows(r.data || []); setErr(r.error?.message || '') })
  useEffect(() => { load() }, [])
  const list = useMemo(() => rows.filter(p => (f === 'Todos' || (f === 'Productos' ? p.kind !== 'combo' : f === 'Combos' ? p.kind === 'combo' : !p.image_url)) && (p.name + ' ' + (p.sku || '')).toLowerCase().includes(q.toLowerCase())), [rows, q, f])
  const set = async (p, url) => { const x = await rpc('set_product_image', { p_id: p.id, p_url: url }); if (x.error) throw new Error(x.error + (/function|schema cache/.test(x.error) ? ' · ¿Ejecutaste schema_v12.sql?' : '')); setRows(r => r.map(y => y.id === p.id ? { ...y, image_url: url || null } : y)) }
  const pick = async (p, file) => {
    if (!file) return; setBusy(p.id); setErr(''); setOk('')
    try { const blob = await compressImage(file, { max: 1000 }), path = await upload('products', rnd() + '.webp', blob, 'image/webp'); await set(p, publicUrl('products', path)); setOk(`Foto de «${p.name}» actualizada.`) } catch (e) { setErr('No se pudo guardar la foto: ' + e.message) }
    setBusy('')
  }
  const del = async p => { if (!confirm(`¿Quitar la foto de «${p.name}»?`)) return; setBusy(p.id); try { await set(p, ''); setOk(`Foto de «${p.name}» quitada.`) } catch (e) { setErr(e.message) } setBusy('') }
  return (<><Head t="Fotos de productos y combos" s="Cambia o sube la foto de cada producto y combo. Es lo único que se edita aquí." /><Err e={err} />{ok && <div className="okb">{ok}</div>}
    <div className="panel"><div className="row" style={{ marginBottom: 14 }}><input placeholder="Buscar por nombre o código..." value={q} onChange={e => setQ(e.target.value)} /><Seg opts={['Todos', 'Productos', 'Combos', 'Sin foto']} v={f} set={setF} /></div>
      <div className="fotos">{list.map(p => <div key={p.id} className={'foto' + (p.active === false ? ' off' : '')}>
        <div className="foto-i">{p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <Ico n="box" s={34} />}{busy === p.id && <span className="foto-b">Subiendo…</span>}</div>
        <b>{p.name}</b><small>{p.kind === 'combo' ? '🎁 Combo' : p.category}{p.active === false ? ' · inactivo' : ''}</small>
        <div className="row" style={{ gap: 6 }}><label className="btn o mini" style={{ flex: 1, textAlign: 'center', cursor: 'pointer', margin: 0 }}>{p.image_url ? 'Cambiar foto' : 'Subir foto'}<input type="file" accept="image/*" hidden disabled={!!busy} onChange={e => { pick(p, e.target.files[0]); e.target.value = '' }} /></label>
          {p.image_url && <button className="btn o mini" disabled={!!busy} aria-label="Quitar foto" onClick={() => del(p)}>✕</button>}</div></div>)}
        {!list.length && <p className="sub">No hay productos que coincidan.</p>}</div></div></>)
}
