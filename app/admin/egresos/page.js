'use client'
import { useMemo, useState } from 'react'
import { supabase, money, fmtDate, audit, rpc } from '../../../lib/supabase'
import { useApp, useScope } from '../../../lib/branch'
import { useTable, Head, Err, AllBanner, Modal, Seg } from '../../../lib/ui'
import { compressImage, upload, publicUrl, rnd } from '../../../lib/images'
import { Ico } from '../../../lib/icons'
const CATS = ['Servicio / Pago terceros', 'Compra de mercadería', 'Pago de personal', 'Alquiler', 'Transporte / Delivery', 'Mantenimiento', 'Impuestos', 'Otros']
const DOCS = ['Factura', 'Boleta', 'Recibo', 'Nota de venta', 'Sin comprobante']
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const E = () => ({ category: CATS[0], doc_type: 'Factura', doc_series: '', doc_number: '', doc_date: today(), supplier_doc: '', supplier_name: '', amount: '', notes: '', photo_url: '', discount: true })
const P0 = () => ({ supplier: '', doc: '', date: today(), received: true, items: [{ id: '', q: '', qty: 1, cost: '' }] })
const ST = { pendiente: ['y', 'Pendiente'], recibida: ['g', 'Recibida'], anulada: ['r', 'Anulada'] }
export default function Egresos() {
  const { box, user, allBranches } = useApp(), scope = useScope(), [tab, setTab] = useState('Egresos')
  const [rows, load, err] = useTable('expenses', 'created_at', 500, true), [buys, loadB, errB] = useTable('purchases', 'created_at', 500, true), [prods] = useTable('products', 'name', 2000)
  const [f, setF] = useState(null), [p, setP] = useState(null), [view, setView] = useState(null), [e2, setE2] = useState(''), [busy, setBusy] = useState(false), [q, setQ] = useState(''), [st, setSt] = useState('')
  const base = useMemo(() => prods.filter(x => x.kind !== 'combo' && x.active).sort((a, b) => a.name.localeCompare(b.name)), [prods])
  const byName = useMemo(() => Object.fromEntries(base.map(x => [x.name.toLowerCase(), x])), [base]), byId = useMemo(() => Object.fromEntries(prods.map(x => [x.id, x])), [prods])
  const bname = id => allBranches.find(b => b.id === id)?.name || ''
  const need = v => !v || !String(v).trim()

  // ---------- Egreso ----------
  const nodoc = f?.doc_type === 'Sin comprobante'
  const upPhoto = async file => { if (!file) return; setBusy(true); setE2(''); try { const blob = await compressImage(file, { max: 1400 }), path = await upload('products', 'egresos/' + rnd() + '.webp', blob, 'image/webp'); setF(x => ({ ...x, photo_url: publicUrl('products', path) })) } catch (e) { setE2('No se pudo subir la foto: ' + e.message) } setBusy(false) }
  const save = async () => {
    setE2(''); if (!scope) return setE2('Elige una sede en la barra superior.')
    if (!f.amount || +f.amount <= 0) return setE2('Escribe el importe total.')
    if (!nodoc && (need(f.doc_series) || need(f.doc_number) || !f.doc_date)) return setE2('Completa la serie, el número y la fecha del comprobante.')
    if (!nodoc && (need(f.supplier_doc) || need(f.supplier_name))) return setE2('Completa el RUC/DNI y la razón social del proveedor.')
    const cash = f.discount && box ? box.id : null, concept = (f.notes || '').trim() || (f.category + (f.supplier_name ? ' · ' + f.supplier_name : ''))
    setBusy(true)
    const { error } = await supabase.from('expenses').insert({ concept, category: f.category, method: cash ? 'Efectivo' : 'Otro (fuera de caja)', amount: +f.amount, branch_id: scope, user_email: user.email, cash_id: cash,
      doc_type: f.doc_type, doc_series: nodoc ? null : f.doc_series.trim().toUpperCase(), doc_number: nodoc ? null : f.doc_number.trim(), doc_date: nodoc ? null : f.doc_date, supplier_doc: f.supplier_doc.trim() || null, supplier_name: f.supplier_name.trim() || null, notes: (f.notes || '').trim() || null, photo_url: f.photo_url || null })
    setBusy(false); if (error) return setE2(error.message + (/column|schema cache/.test(error.message) ? ' · ¿Ejecutaste schema_v11.sql?' : ''))
    audit('Egreso registrado', `${f.category}: ${concept} · ${money(f.amount)}`); setF(null); load()
  }

  // ---------- Compra ----------
  const setItem = (i, patch) => setP(v => ({ ...v, items: v.items.map((x, k) => k === i ? { ...x, ...patch } : x) }))
  const pickName = (i, text) => { const m = byName[text.trim().toLowerCase()]; setItem(i, m ? { q: text, id: m.id, cost: p.items[i].cost === '' || !+p.items[i].cost ? (m.cost || '') : p.items[i].cost } : { q: text, id: '' }) }
  const ptotal = p ? p.items.reduce((a, x) => a + (+x.qty || 0) * (+x.cost || 0), 0) : 0
  const saveP = async () => {
    setE2(''); if (!scope) return setE2('Elige una sede en la barra superior.')
    const items = p.items.filter(x => x.q || x.id); if (!items.length) return setE2('Agrega al menos un producto.')
    if (items.some(x => !x.id)) return setE2('Elige cada producto de la lista (revisa el nombre).'); if (items.some(x => !(+x.qty > 0))) return setE2('Las cantidades deben ser mayores a 0.')
    setBusy(true); const x = await rpc('create_purchase', { p_branch: scope, p_supplier: p.supplier, p_doc: p.doc, p_date: p.date, p_items: items.map(i => ({ id: i.id, qty: +i.qty, cost: +i.cost || 0 })), p_received: p.received }); setBusy(false)
    if (x.error) return setE2(x.error + (/function|schema cache/.test(x.error) ? ' · ¿Ejecutaste schema_v11.sql?' : '')); setP(null); loadB(); window.dispatchEvent(new Event('stock-changed'))
  }
  const act = async (fn, b, ask) => { if (ask && !confirm(ask)) return; const x = await rpc(fn, { p_id: b.id }); if (x.error) return setE2(x.error); setE2(''); loadB(); window.dispatchEvent(new Event('stock-changed')) }

  const lowerQ = q.toLowerCase(), shownE = rows.filter(e => !q || [e.concept, e.category, e.supplier_name, e.doc_number, e.doc_series].join(' ').toLowerCase().includes(lowerQ))
  const shownB = buys.filter(b => (!st || b.status === st) && (!q || [b.number, b.supplier, b.doc_number].join(' ').toLowerCase().includes(lowerQ)))
  const okB = buys.filter(b => b.status !== 'anulada'), sup = [...new Set(buys.map(b => b.supplier).filter(Boolean))]
  const Photo = ({ u }) => u ? <a href={u} target="_blank" rel="noreferrer" title="Ver foto del comprobante">📎</a> : null

  return (<><Head t="Egresos" s={`Gastos, pagos y compras de insumos${scope ? ' · ' + bname(scope) : ''}`}>
      <button className="btn" disabled={!scope} onClick={() => { setE2(''); tab === 'Egresos' ? setF(E()) : setP(P0()) }}><Ico n="plus" s={16} /> {tab === 'Egresos' ? 'Registrar Egreso' : 'Registrar Compra'}</button></Head>
    <Err e={err || errB || (!f && !p ? e2 : '')} />{!scope && <AllBanner what="registrar egresos o compras" />}
    <div style={{ marginBottom: 14 }}><Seg opts={['Egresos', 'Compras de insumos']} v={tab} set={v => { setTab(v); setQ(''); setSt('') }} /></div>

    {tab === 'Egresos' && <><div className="kpis"><div className="kpi" style={{ borderLeftColor: '#dc2626' }}><span>Total egresos</span><b>{money(rows.reduce((a, e) => a + +e.amount, 0))}</b></div><div className="kpi"><span>Registros</span><b>{rows.length}</b></div></div>
      <div className="panel"><input placeholder="Buscar por concepto, proveedor o comprobante..." value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} />
        <div style={{ overflow: 'auto' }}><table style={{ minWidth: 820 }}><thead><tr><th>Fecha</th>{!scope && <th>Sede</th>}<th>Categoría</th><th>Comprobante</th><th>Proveedor</th><th>Detalle</th><th>Método</th><th>Monto</th><th></th></tr></thead><tbody>
          {shownE.map(e => <tr key={e.id}><td>{fmtDate(e.created_at)}</td>{!scope && <td>{bname(e.branch_id)}</td>}<td><span className="tag">{e.category}</span></td>
            <td>{e.doc_type && e.doc_type !== 'Sin comprobante' ? <>{e.doc_type}<br /><small>{e.doc_series}-{e.doc_number}</small></> : <small style={{ color: 'var(--mut)' }}>Sin comprobante</small>}</td>
            <td>{e.supplier_name ? <>{e.supplier_name}<br /><small>{e.supplier_doc}</small></> : '—'}</td><td>{e.concept}</td><td>{e.method}</td><td style={{ color: '#b91c1c', fontWeight: 600, whiteSpace: 'nowrap' }}>- {money(e.amount)}</td><td><Photo u={e.photo_url} /></td></tr>)}
          {!shownE.length && <tr><td colSpan={9}>Aún no hay egresos.</td></tr>}</tbody></table></div></div></>}

    {tab === 'Compras de insumos' && <><div className="kpis"><div className="kpi" style={{ borderLeftColor: '#2563eb' }}><span>Total compras</span><b>{money(okB.reduce((a, b) => a + +b.total, 0))}</b></div><div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}><span>Recibidas</span><b>{buys.filter(b => b.status === 'recibida').length}</b></div>
      <div className="kpi" style={{ borderLeftColor: '#f59e0b' }}><span>Pendientes</span><b>{buys.filter(b => b.status === 'pendiente').length}</b></div><div className="kpi" style={{ borderLeftColor: '#9333ea' }}><span>Proveedores</span><b>{sup.length}</b></div></div>
      <div className="panel"><div className="row" style={{ marginBottom: 12 }}><input placeholder="Buscar por número o proveedor..." value={q} onChange={e => setQ(e.target.value)} />
        <select style={{ width: 190 }} value={st} onChange={e => setSt(e.target.value)}><option value="">Todos los estados</option><option value="recibida">Recibidas</option><option value="pendiente">Pendientes</option><option value="anulada">Anuladas</option></select></div>
        <div style={{ overflow: 'auto' }}><table style={{ minWidth: 760 }}><thead><tr><th>Número</th>{!scope && <th>Sede</th>}<th>Proveedor</th><th>Fecha</th><th>Ítems</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
          {shownB.map(b => <tr key={b.id}><td><b>{b.number}</b>{b.doc_number && <><br /><small>{b.doc_number}</small></>}</td>{!scope && <td>{bname(b.branch_id)}</td>}<td>{b.supplier || '—'}</td><td>{new Date(b.purchase_date + 'T12:00:00').toLocaleDateString('es-PE')}</td><td>{(b.items || []).length}</td><td style={{ whiteSpace: 'nowrap' }}><b>{money(b.total)}</b></td>
            <td><span className={'tag ' + ST[b.status][0]}>{ST[b.status][1]}</span></td>
            <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="btn o mini" onClick={() => setView(b)}>Ver</button>{b.status === 'pendiente' && <><button className="btn g mini" onClick={() => act('receive_purchase', b)}>Recibir</button><button className="btn o mini" onClick={() => act('cancel_purchase', b, `¿Anular la compra ${b.number}?`)}>Anular</button></>}</div></td></tr>)}
          {!shownB.length && <tr><td colSpan={8}>No se encontraron compras.</td></tr>}</tbody></table></div>
        <small style={{ color: 'var(--mut)' }}>Al marcar una compra como recibida, la mercadería entra al <b>almacén</b> de la sede (queda en el historial de movimientos) y el costo del producto se actualiza con el precio de compra.</small></div></>}

    {f && <Modal title="Registrar Egreso" onClose={() => setF(null)} wide><small style={{ color: 'var(--mut)', marginTop: -8 }}>Los campos marcados con * son obligatorios</small><Err e={e2} />
      <label>Categoría *</label><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
      <b className="sub" style={{ fontSize: 12, letterSpacing: '.05em', marginTop: 6, borderTop: '1px solid var(--line)', paddingTop: 12 }}>COMPROBANTE DE PAGO</b>
      <div className="fgrid"><div><label>Tipo *</label><select value={f.doc_type} onChange={e => setF({ ...f, doc_type: e.target.value })}>{DOCS.map(c => <option key={c}>{c}</option>)}</select></div>
        {!nodoc && <><div><label>Serie *</label><input placeholder="F001" maxLength={10} value={f.doc_series} onChange={e => setF({ ...f, doc_series: e.target.value })} /></div><div><label>N° Comprobante *</label><input placeholder="00001234" maxLength={20} value={f.doc_number} onChange={e => setF({ ...f, doc_number: e.target.value })} /></div></>}</div>
      {!nodoc && <div><label>Fecha de emisión *</label><input type="date" value={f.doc_date} onChange={e => setF({ ...f, doc_date: e.target.value })} /></div>}
      <b className="sub" style={{ fontSize: 12, letterSpacing: '.05em', marginTop: 6, borderTop: '1px solid var(--line)', paddingTop: 12 }}>INFORMACIÓN DEL PROVEEDOR</b>
      <div className="fgrid"><div><label>RUC / DNI {!nodoc && '*'}</label><input placeholder="20123456789" inputMode="numeric" maxLength={11} value={f.supplier_doc} onChange={e => setF({ ...f, supplier_doc: e.target.value.replace(/\D/g, '') })} /></div>
        <div><label>Razón social {!nodoc && '*'}</label><input placeholder="EMPRESA S.A.C." value={f.supplier_name} onChange={e => setF({ ...f, supplier_name: e.target.value })} /></div></div>
      <b className="sub" style={{ fontSize: 12, letterSpacing: '.05em', marginTop: 6, borderTop: '1px solid var(--line)', paddingTop: 12 }}>MONTOS</b>
      <div><label>Importe total *</label><div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-start" }}><span>S/</span><input type="number" min="0" step="0.01" placeholder="0.00" style={{ maxWidth: 200 }} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></div></div>
      <label>Descripción <small style={{ color: 'var(--mut)', fontWeight: 400 }}>(opcional)</small></label><textarea rows={3} style={{ width: '100%', minHeight: 70, flexShrink: 0, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, font: 'inherit' }} placeholder="Ej: Pago de luz de octubre, adelanto de sueldo..." value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
      <label>Foto del comprobante <small style={{ color: 'var(--mut)', fontWeight: 400 }}>(opcional)</small></label>
      <div style={{ border: '2px dashed var(--line)', borderRadius: 12, minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mut)' }}>{f.photo_url ? <img src={f.photo_url} alt="" style={{ maxHeight: 180, maxWidth: '100%' }} /> : <span>Sin foto</span>}</div>
      <label className="btn o" style={{ cursor: 'pointer', textAlign: 'center', margin: 0 }}>{busy ? 'Subiendo...' : '⤒ Tomar / subir foto'}<input type="file" accept="image/*" hidden disabled={busy} onChange={e => { upPhoto(e.target.files[0]); e.target.value = '' }} /></label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}><input type="checkbox" style={{ width: 'auto', marginTop: 3 }} checked={f.discount} onChange={e => setF({ ...f, discount: e.target.checked })} /><span><b>Descontar de mi caja abierta</b><br /><small style={{ color: 'var(--mut)', fontWeight: 400 }}>{box ? 'Si tienes una caja abierta en esta sede, el egreso se resta de su neto y sale en su reporte y ticket.' : 'No tienes una caja abierta en esta sede: el egreso no afectará ningún cuadre de caja.'}</small></span></label>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn o" onClick={() => setF(null)}>Cancelar</button><button className="btn" disabled={busy} onClick={save}>Registrar egreso</button></div></Modal>}

    {p && <Modal title="Registrar Compra" onClose={() => setP(null)} wide><small style={{ color: 'var(--mut)', marginTop: -8 }}>Registra la compra de productos al proveedor</small><Err e={e2} />
      <datalist id="dl-sup">{sup.map(s => <option key={s} value={s} />)}</datalist><datalist id="dl-prod">{base.map(x => <option key={x.id} value={x.name} />)}</datalist>
      <div className="fgrid"><div><label>Proveedor</label><input list="dl-sup" placeholder="Escribe uno nuevo o elige uno registrado" value={p.supplier} onChange={e => setP({ ...p, supplier: e.target.value })} /></div>
        <div><label>N° de comprobante</label><input placeholder="Ej. F001-000245 (del proveedor)" value={p.doc} onChange={e => setP({ ...p, doc: e.target.value })} /></div><div><label>Fecha</label><input type="date" value={p.date} onChange={e => setP({ ...p, date: e.target.value })} /></div></div>
      <div className="row"><b>Productos de la compra</b><button type="button" className="btn o mini" style={{ marginLeft: 'auto' }} onClick={() => setP({ ...p, items: [...p.items, { id: '', q: '', qty: 1, cost: '' }] })}>+ Agregar producto</button></div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, overflow: 'auto' }}><div style={{ minWidth: 520 }}>
        <div className="row" style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 700, gap: 8 }}><span style={{ flex: 1 }}>PRODUCTO</span><span style={{ width: 70 }}>CANTIDAD</span><span style={{ width: 90 }}>P. COMPRA</span><span style={{ width: 80, textAlign: 'right' }}>SUBTOTAL</span><span style={{ width: 28 }} /></div>
        {p.items.map((it, i) => <div className="row" key={i} style={{ gap: 8, marginTop: 8 }}><input style={{ flex: 1 }} list="dl-prod" placeholder="Elige o escribe un producto" value={it.q} onChange={e => pickName(i, e.target.value)} />
          <input type="number" min="1" style={{ width: 70 }} value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} /><input type="number" min="0" step="0.01" style={{ width: 90 }} value={it.cost} onChange={e => setItem(i, { cost: e.target.value })} />
          <span style={{ width: 80, textAlign: 'right' }}>{money((+it.qty || 0) * (+it.cost || 0))}</span><button type="button" className="icb" style={{ width: 28, color: '#dc2626' }} aria-label="Quitar" onClick={() => setP({ ...p, items: p.items.length > 1 ? p.items.filter((_, k) => k !== i) : [{ id: '', q: '', qty: 1, cost: '' }] })}>✕</button></div>)}</div></div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}><input type="checkbox" style={{ width: 'auto', marginTop: 3 }} checked={p.received} onChange={e => setP({ ...p, received: e.target.checked })} /><span><b>Mercadería recibida</b><br /><small style={{ color: 'var(--mut)', fontWeight: 400 }}>Si está marcada, el stock ingresa de inmediato al almacén de la sede y se registra en el historial de almacén. Si no, la compra queda pendiente hasta recibirla.</small></span></label>
      <div className="row" style={{ justifyContent: 'flex-end' }}><span style={{ background: '#f4f4f6', borderRadius: 10, padding: '10px 18px' }}>Total &nbsp; <b style={{ color: 'var(--ok)', fontSize: 20 }}>{money(ptotal)}</b></span></div>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn o" onClick={() => setP(null)}>Cancelar</button><button className="btn" disabled={busy} onClick={saveP}>Registrar compra</button></div></Modal>}

    {view && <Modal title={`Compra ${view.number}`} onClose={() => setView(null)}><small>{view.supplier || 'Sin proveedor'} · {view.doc_number || 'sin comprobante'} · {ST[view.status][1]}</small>
      <table><thead><tr><th>Producto</th><th>Cant.</th><th>P. compra</th><th>Subtotal</th></tr></thead><tbody>{(view.items || []).map((x, i) => <tr key={i}><td>{x.name}</td><td>{x.qty}</td><td>{money(x.cost)}</td><td>{money(x.qty * x.cost)}</td></tr>)}</tbody></table>
      <div className="row"><b>Total</b><b className="price">{money(view.total)}</b></div></Modal>}</>)
}
