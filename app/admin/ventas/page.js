'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, money, CATS, audit, rpc } from '../../../lib/supabase'
import { useApp } from '../../../lib/branch'
import { useStockMap, Seg, Err, AllBanner } from '../../../lib/ui'
import { printTicket, getPrintCfg } from '../../../lib/tickets'
import { TicketModal } from '../../../lib/ticketui'

export default function POS() {
  const { branchId, branch, box, askBox, settings, reloadBox } = useApp(), all = branchId === 'all'
  const [prods, setProds] = useState([]), [stock, loadStock, e0] = useStockMap(), [q, setQ] = useState(''), [cat, setCat] = useState('Todas'), [cart, setCart] = useState([])
  const [custs, setCusts] = useState([]), [cust, setCust] = useState(''), [nc, setNc] = useState(null), [doc, setDoc] = useState('')
  const [voucher, setVoucher] = useState('Nota de Venta'), [pay, setPay] = useState('Efectivo'), [disc, setDisc] = useState(0), [recv, setRecv] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(null)
  const sq = useRef(null)
  useEffect(() => { supabase.from('products').select('*').eq('active', true).order('name').then(r => setProds(r.data || [])); supabase.from('customers').select('*').order('name').then(r => setCusts(r.data || [])) }, [])
  useEffect(() => { setCart([]) }, [branchId])
  const have = id => stock[id]?.stock || 0
  const list = useMemo(() => prods.filter(p => (cat === 'Todas' || p.category === cat) && (p.name + (p.sku || '')).toLowerCase().includes(q.toLowerCase())), [prods, cat, q])
  const add = p => { if (have(p.id) < 1) return; setCart(c => c.find(i => i.id === p.id) ? c.map(i => i.id === p.id ? { ...i, qty: Math.min(i.qty + 1, have(p.id)) } : i) : [...c, { id: p.id, name: p.name, price: +p.price, qty: 1 }]) }
  const setQty = (id, n) => setCart(c => c.map(i => i.id === id ? { ...i, qty: Math.max(1, Math.min(n || 1, have(id))) } : i))
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0), total = Math.round(sub * (1 - Math.min(Math.max(disc, 0), 100) / 100) * 100) / 100
  const onEnter = e => { if (e.key !== 'Enter') return; const ex = prods.find(p => p.sku && p.sku.toLowerCase() === q.trim().toLowerCase()) || (list.length === 1 ? list[0] : null); if (ex) { add(ex); setQ('') } }
  const pickC = id => { setCust(id); const c = custs.find(x => x.id === id); setDoc(c?.doc_number || '') }
  const addC = async () => {
    const { data, error } = await supabase.from('customers').insert({ name: nc.name, phone: nc.phone || null, doc_number: nc.doc || null }).select().single()
    if (error) return setErr(error.message); setCusts([...custs, data]); setCust(data.id); setDoc(data.doc_number || ''); setNc(null); audit('Cliente creado', data.name)
  }
  const needDoc = voucher === 'Factura' && !/^\d{11}$/.test(doc.trim()), change = pay === 'Efectivo' && +recv > total ? +recv - total : 0
  const save = async () => {
    setErr(''); setBusy(true); const c = custs.find(x => x.id === cust)
    const x = await rpc('create_pos_sale', { p_branch: branchId, p_cash: box.id, p_items: cart.map(i => ({ id: i.id, qty: i.qty })), p_voucher: voucher, p_payment: pay, p_customer_id: c?.id || null, p_customer_name: c?.name || null, p_phone: c?.phone || null, p_doc: doc.trim() || null, p_discount: disc })
    setBusy(false); if (x.error) { loadStock(); return setErr(x.error) }
    setDone(x.data); setCart([]); setDisc(0); setRecv(''); setCust(''); setDoc(''); loadStock()
    if (getPrintCfg().auto) setTimeout(() => printTicket(x.data, { settings, branch }), 300)
  }
  const ctx = { settings, branch }
  return (<><h1>Punto de Venta</h1><p className="sub">{all ? 'Selecciona una sede para vender' : `Vendiendo en ${branch?.name}`}</p>
    {all && <AllBanner what="registrar ventas" />}<Err e={e0} />
    {!all && box === null && <p style={{ background: '#fef3c7', padding: 12, borderRadius: 8, marginBottom: 12 }}>Para vender en <b>{branch?.name}</b> primero <button className="rmv" style={{ fontWeight: 700 }} onClick={askBox}>abre tu caja</button>.</p>}
    <div className="pos"><div className="panel"><input ref={sq} placeholder="Buscar producto por nombre o código (Enter para agregar)..." value={q} onChange={e => setQ(e.target.value)} onKeyDown={onEnter} />
      <small style={{ color: 'var(--ok)' }}>● Stock de esta sede en tiempo real</small>
      <div className="chips">{['Todas', ...CATS].map(c => <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="pgrid">{list.map(p => <div key={p.id} className={'card' + (have(p.id) < 1 ? ' off' : '')} onClick={() => !all && add(p)}>
        <b>{p.name}</b><small style={{ color: 'var(--mut)' }}>{p.sku}</small><div className="row"><span className="price" style={{ fontSize: 16 }}>{money(p.price)}</span><small>{have(p.id)} unid.</small></div></div>)}</div></div>
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><b>Nueva Venta</b>
        <label>Cliente</label><select value={cust} onChange={e => pickC(e.target.value)}><option value="">Cliente Varios</option>{custs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {nc ? <div style={{ display: 'grid', gap: 6 }}><input placeholder="Nombre o razón social" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} /><div className="row"><input placeholder="Celular" value={nc.phone} onChange={e => setNc({ ...nc, phone: e.target.value })} /><input placeholder="DNI / RUC" value={nc.doc} onChange={e => setNc({ ...nc, doc: e.target.value })} /></div>
          <div className="row"><button className="btn o" onClick={() => setNc(null)}>Cancelar</button><button className="btn" disabled={!nc.name} onClick={addC}>Guardar cliente</button></div></div>
          : <button className="btn o mini" onClick={() => setNc({ name: '', phone: '', doc: '' })}>+ Nuevo cliente</button>}
        <label>Tipo de comprobante</label><Seg opts={['Boleta', 'Factura', 'Nota de Venta']} v={voucher} set={setVoucher} />
        {voucher !== 'Nota de Venta' && <input placeholder={voucher === 'Factura' ? 'RUC (11 dígitos) *' : 'DNI (opcional)'} value={doc} onChange={e => setDoc(e.target.value.replace(/\D/g, ''))} maxLength={11} />}
        <label>Método de pago</label><Seg opts={['Efectivo', 'Yape', 'Tarjeta', 'Transferencia']} v={pay} set={setPay} />
        <div style={{ minHeight: 80 }}>{cart.map(i => <div className="row" key={i.id} style={{ marginBottom: 6 }}><span style={{ flex: 1 }}>{i.name}</span>
          <input type="number" min="1" style={{ width: 58 }} value={i.qty} onChange={e => setQty(i.id, +e.target.value)} /><span style={{ width: 74, textAlign: 'right' }}>{money(i.qty * i.price)}</span><button className="chip" onClick={() => setCart(cart.filter(x => x.id !== i.id))}>✕</button></div>)}
          {!cart.length && <p style={{ textAlign: 'center', color: 'var(--mut)', paddingTop: 24 }}>El carrito está vacío</p>}</div>
        <div className="row"><span>Descuento %</span><input type="number" min="0" max="100" style={{ width: 80 }} value={disc} onChange={e => setDisc(+e.target.value)} /></div>
        <div className="row"><b>TOTAL</b><span className="price" style={{ color: 'var(--ok)' }}>{money(total)}</span></div>
        {pay === 'Efectivo' && cart.length > 0 && <div className="row"><span>Paga con</span><input type="number" min="0" style={{ width: 110 }} value={recv} onChange={e => setRecv(e.target.value)} /><b>Vuelto {money(change)}</b></div>}
        <Err e={err} /><button className="btn" disabled={!cart.length || !box || all || busy || needDoc} onClick={save}>{busy ? 'Registrando...' : 'Registrar Venta'}</button>
        {needDoc && cart.length > 0 && <small style={{ color: '#b91c1c' }}>La factura necesita un RUC de 11 dígitos.</small>}</div></div>
    {done && <TicketModal sale={done} ctx={ctx} onClose={() => setDone(null)}><button className="btn g" onClick={() => setDone(null)}>Nueva venta</button></TicketModal>}</>)
}
