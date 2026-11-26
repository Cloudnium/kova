'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase, money, fmtDate, rpc } from '../../../lib/supabase'
import { useApp, useScope } from '../../../lib/branch'
import { Head, Err, Modal, Seg } from '../../../lib/ui'
import { TicketModal } from '../../../lib/ticketui'
import { notifyOrder } from '../../../lib/ordernotify'

const TABS = [['pendiente', 'Por confirmar'], ['online', 'Esperando pago en línea'], ['completado', 'Confirmados'], ['anulado', 'Rechazados / anulados'], ['', 'Todos']]
// Pedido de Culqi cuyo pago aún no se acredita (PagoEfectivo pendiente o pago sin completar): no se puede aceptar todavía
const waitPay = o => o.pay_mode === 'culqi' && o.pay_status !== 'pagado'
const PM = { tarjeta: 'Tarjeta', yape: 'Yape', pagoefectivo: 'PagoEfectivo' }
const map = o => o.geo_lat != null && o.geo_lng != null ? `https://www.google.com/maps?q=${o.geo_lat},${o.geo_lng}` : null
const wa = p => { const d = String(p || '').replace(/\D/g, ''); return d ? 'https://wa.me/' + (d.length === 9 ? '51' + d : d) : null }
export default function Pedidos() {
  const { allBranches, branches, settings, refreshPending, reloadBox, box, branchId, askBox } = useApp(), scope = useScope()
  const [rows, setRows] = useState([]), [tab, setTab] = useState('pendiente'), [q, setQ] = useState(''), [err, setErr] = useState(''), [sel, setSel] = useState(null), [done, setDone] = useState(null), [note, setNote] = useState('')
  const [f, setF] = useState({ voucher: 'Nota de Venta', doc: '', paid: false, payment: 'Efectivo' }), [stk, setStk] = useState({}), [proof, setProof] = useState(''), [busy, setBusy] = useState(false), [e2, setE2] = useState('')
  const bname = id => allBranches.find(b => b.id === id)?.name || ''
  // Aceptar y cobrar pedidos web exige TU caja abierta en la sede del pedido (el servidor también lo valida)
  const boxOk = o => !!(box && o && box.branch_id === o.branch_id)
  const load = useCallback(async () => {
    let x = supabase.from('sales').select('*').eq('source', 'web').order('created_at', { ascending: false }).limit(300); if (scope) x = x.eq('branch_id', scope)
    const r = await x; setRows(r.data || []); setErr(r.error?.message || '')
  }, [scope])
  useEffect(() => { load() }, [load])
  useEffect(() => { window.addEventListener('pedido-web', load); return () => window.removeEventListener('pedido-web', load) }, [load])
  const list = rows.filter(s => (!tab || (tab === 'pendiente' ? s.status === 'pendiente' && !waitPay(s) : tab === 'online' ? s.status === 'pendiente' && waitPay(s) : s.status === tab)) && ((s.order_number || '') + (s.number || '') + s.customer_name + (s.phone || '')).toLowerCase().includes(q.toLowerCase()))
  const open = async o => {
    setSel(o); setE2(''); setProof(''); setStk({})
    const pre = o.pay_mode === 'pagar_ahora', on = o.pay_mode === 'culqi'; setF({ voucher: 'Nota de Venta', doc: o.customer_doc || '', paid: on || (pre && !!o.payment_proof), payment: on ? o.payment : pre ? 'Yape' : 'Efectivo' })
    const ids = (o.items || []).map(i => i.id)
    supabase.from('branch_stock').select('product_id,stock').eq('branch_id', o.branch_id).in('product_id', ids).then(r => setStk(Object.fromEntries((r.data || []).map(x => [x.product_id, x.stock]))))
    if (o.payment_proof) { const u = await supabase.storage.from('proofs').createSignedUrl(o.payment_proof, 3600); setProof(u.data?.signedUrl || '') }
  }
  // avisa al cliente por notificación push (si activó los avisos de su pedido) y lo muestra al personal
  const tell = async id => { const m = await notifyOrder(id); if (m) { setNote(m); setTimeout(() => setNote(''), 6000) } }
  const after = (data, msg) => { setSel(null); load(); refreshPending(); reloadBox(); if (msg) setDone(data) }
  const confirm = async () => {
    setBusy(true); setE2(''); const x = await rpc('confirm_web_order', { p_id: sel.id, p_voucher: f.voucher, p_doc: f.doc.trim() || null, p_paid: f.paid, p_payment: f.payment }); setBusy(false)
    if (x.error) return setE2(x.error); tell(sel.id); after(x.data, true)
  }
  const reject = async () => { if (sel.pay_mode === 'culqi' && sel.pay_status === 'pagado' && !window.confirm('Este pedido YA FUE PAGADO en línea (' + (PM[sel.pay_method] || 'Culqi') + ', ' + money(sel.total) + '). Si lo rechazas debes devolver el dinero al cliente desde CulqiPanel (Cargos → Devolver). ¿Continuar?')) return; const why = prompt('Motivo del rechazo (opcional):'); if (why === null) return; const x = await rpc('reject_web_order', { p_id: sel.id, p_reason: why }); if (x.error) return setE2(x.error); tell(sel.id); after() }
  const act = async (o, a) => { if (a === 'paid' && !boxOk(o)) return setErr(`Para registrar el cobro abre tu caja en ${bname(o.branch_id)}` + (o.branch_id === branchId ? ' (botón «Abrir mi caja» arriba, en Cajas).' : ': elige esa sede en la barra superior y abre tu caja.')); const x = await rpc('mark_order', { p_id: o.id, p_action: a }); if (x.error) return setErr(x.error + (a === 'on_the_way' && /Acción no válida/.test(x.error) ? ' · ¿Ejecutaste schema_v15_estado_pedido.sql?' : '')); if (a !== 'paid') tell(o.id); load() }
  const annul = async o => { if (!confirm2(`¿Anular ${o.number}? El stock volverá a la sede.`)) return; const x = await rpc('annul_sale', { p_id: o.id }); if (x.error) return setErr(x.error); tell(o.id); load(); refreshPending() }
  const confirm2 = m => window.confirm(m)
  const lack = sel && (sel.items || []).some(i => (stk[i.id] ?? 0) < i.qty), needDoc = f.voucher === 'Factura' && !/^\d{11}$/.test(f.doc.trim())
  const st = s => s.status === 'pendiente' ? <span className="tag y">Por confirmar</span> : s.status === 'anulado' ? <span className="tag r">{s.reject_reason ? 'Rechazado' : 'Anulado'}</span>
    : <><span className="tag g">Confirmado</span> <span className={'tag ' + (s.paid ? 'g' : 'y')}>{s.paid ? 'Cobrado' : 'Por cobrar'}</span> <span className={'tag' + (s.delivery_status === 'en_camino' ? ' y' : '')}>{s.delivery_status === 'entregado' ? 'Entregado' : s.delivery_status === 'en_camino' ? 'En camino' : 'Por entregar'}</span></>
  return (<><Head t="Pedidos web" s="Confirma los pedidos de la tienda online. El stock solo se descuenta cuando confirmas." /><Err e={err} />{note && <p style={{ background: '#e8f7ee', color: '#166534', padding: 10, borderRadius: 8, margin: '0 0 12px' }}>{note}</p>}
    <div className="kpis"><div className="kpi" style={{ borderLeftColor: '#f59e0b' }}><span>Por confirmar</span><b>{rows.filter(s => s.status === 'pendiente' && !waitPay(s)).length}</b></div>
      <div className="kpi"><span>Confirmados (por cobrar)</span><b>{rows.filter(s => s.status === 'completado' && !s.paid).length}</b></div><div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}><span>Por entregar</span><b>{rows.filter(s => s.status === 'completado' && s.delivery_status !== 'entregado').length}</b></div></div>
    <div className="panel"><div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      <input placeholder="Buscar por pedido, cliente o celular..." value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <table><thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th>{!scope && <th>Sede</th>}<th>Pago</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {list.map(s => <tr key={s.id}><td><b>{s.order_number}</b>{s.number && <><br /><small>{s.number}</small></>}</td><td>{fmtDate(s.created_at)}</td>
          <td>{s.customer_name}<br />{wa(s.phone) ? <a href={wa(s.phone)} target="_blank" style={{ color: 'var(--ok)' }}><small>💬 {s.phone}</small></a> : <small>{s.phone}</small>}{map(s) && <><br /><a href={map(s)} target="_blank" rel="noopener" style={{ color: 'var(--red)' }}><small>📍 Ver ubicación</small></a></>}</td>{!scope && <td>{bname(s.branch_id)}</td>}
          <td>{s.pay_mode === 'culqi' ? <><span className="tag g">Culqi · {PM[s.pay_method] || 'en línea'}</span><br />{s.pay_status === 'pagado' ? <small style={{ color: 'var(--ok)', fontWeight: 600 }}>✓ Pagado</small> : s.pay_cip ? <small>⏳ CIP {s.pay_cip}</small> : <small>{s.pay_status === 'vencido' ? '⌛ Vencido' : '⏳ Sin pagar'}</small>}</> : s.pay_mode === 'pagar_ahora' ? <span className="tag g">Yape{s.payment_proof ? ' · con foto' : ''}</span> : <span className="tag">Contra entrega</span>}</td><td><b>{money(s.total)}</b></td><td>{st(s)}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{s.status === 'pendiente' && <button className={waitPay(s) ? 'chip' : 'btn mini'} onClick={() => open(s)}>{waitPay(s) ? 'Ver' : 'Revisar y confirmar'}</button>}
            {s.status === 'completado' && <><button className="chip" onClick={() => setDone(s)}>🖨 Ticket</button> {!s.paid && <button className="chip" onClick={() => act(s, 'paid')}>Marcar cobrado</button>} {s.delivery_status !== 'entregado' && s.delivery_status !== 'en_camino' && <button className="chip" onClick={() => act(s, 'on_the_way')}>🛵 En camino</button>} {s.delivery_status !== 'entregado' && <button className="chip" onClick={() => act(s, 'delivered')}>Entregado</button>} <button className="chip" onClick={() => annul(s)}>Anular</button></>}
            {s.status === 'anulado' && <button className="chip" onClick={() => open(s)}>Ver</button>}</td></tr>)}
        {!list.length && <tr><td colSpan="8">No hay pedidos en esta vista.</td></tr>}</tbody></table></div>
    {sel && <Modal wide title={`Pedido ${sel.order_number} · ${bname(sel.branch_id)}`} onClose={() => setSel(null)}>
      <div className="fgrid" style={{ alignItems: 'start' }}><div><small>Cliente</small><br /><b>{sel.customer_name}</b><br />{sel.phone}</div><div><small>Fecha</small><br />{fmtDate(sel.created_at)}</div><div><small>Forma de pago</small><br /><b>{sel.pay_mode === 'culqi' ? (sel.pay_status === 'pagado' ? '✓ Pagado en línea · ' + (PM[sel.pay_method] || 'Culqi') : 'Pago en línea pendiente' + (sel.pay_cip ? ' · CIP ' + sel.pay_cip : '')) : sel.pay_mode === 'pagar_ahora' ? 'Pagó con Yape' : 'Contra entrega'}</b>{sel.pay_mode === 'culqi' && <><br /><small>{sel.customer_email}{sel.culqi_charge_id ? ' · ' + sel.culqi_charge_id : sel.culqi_order_id ? ' · ' + sel.culqi_order_id : ''}</small></>}</div></div>
      {(map(sel) || sel.address || sel.notes) && <p>{map(sel) && <>📍 <a href={map(sel)} target="_blank" rel="noopener" style={{ color: 'var(--red)', textDecoration: 'underline', fontWeight: 600 }}>Abrir ubicación GPS en el mapa</a> <small>({sel.geo_lat}, {sel.geo_lng}{sel.geo_acc != null ? ` · ±${sel.geo_acc} m` : ''})</small><br /></>}{sel.address && <>📍 {sel.address}<br /></>}{sel.notes && <>📝 Referencia: {sel.notes.split(/(https?:\/\/\S+)/).map((t, i) => /^https?:/.test(t) ? <a key={i} href={t} target="_blank" rel="noopener" style={{ color: 'var(--red)', textDecoration: 'underline' }}>Abrir en el mapa</a> : t)}</>}</p>}
      <table><thead><tr><th>Producto</th><th>Cant.</th><th>Disponible en sede</th><th>Importe</th></tr></thead><tbody>
        {(sel.items || []).map((i, k) => <tr key={k}><td>{i.name}</td><td>{i.qty}</td><td>{sel.status !== 'pendiente' ? '-' : (stk[i.id] ?? 0) < i.qty ? <span className="warn">Solo {stk[i.id] ?? 0}</span> : <span className="tag g">{stk[i.id]}</span>}</td><td>{money(i.qty * i.price)}</td></tr>)}
        {+sel.delivery_fee > 0 && <tr><td colSpan="3">🛵 Delivery{+sel.delivery_km ? ` (${(+sel.delivery_km).toFixed(1)} km)` : ''}</td><td>{money(sel.delivery_fee)}</td></tr>}
        {+sel.code_discount > 0 && <tr><td colSpan="3">🏷 Código de descuento <b>{sel.discount_code}</b></td><td style={{ color: 'var(--ok)' }}>- {money(sel.code_discount)}</td></tr>}
        <tr><td colSpan="3"><b>TOTAL</b></td><td><b>{money(sel.total)}</b></td></tr></tbody></table>
      {sel.payment_proof && <div><b>Foto del pago</b>{proof ? <a href={proof} target="_blank"><img className="proof" src={proof} alt="Comprobante de pago" /></a> : <p className="sub">Cargando imagen...</p>}</div>}
      {sel.status === 'anulado' && <p className="warn">Rechazado{sel.reject_reason ? ': ' + sel.reject_reason : ''}</p>}
      {sel.status === 'pendiente' && <>
        {lack && <p className="warn" style={{ padding: 10 }}>Falta stock en esta sede. Ingresa mercadería en Almacén, ajusta el producto o rechaza el pedido.</p>}
        {waitPay(sel) && <p className="warn" style={{ padding: 10 }}>⏳ Este pedido espera el pago en línea{sel.pay_cip ? ` (PagoEfectivo, CIP ${sel.pay_cip}${sel.pay_expires_at ? ', vence ' + fmtDate(sel.pay_expires_at) : ''})` : ''}. Podrás aceptarlo cuando Culqi acredite el pago (la lista se actualiza sola).</p>}
        {sel.pay_mode === 'culqi' && sel.pay_status === 'pagado' && <p style={{ background: '#ecfdf5', color: '#065f46', padding: 10, borderRadius: 8 }}>✓ Pago acreditado por Culqi ({PM[sel.pay_method] || 'en línea'}). No cobres nada al entregar.</p>}
        <label>Comprobante a emitir</label><Seg opts={['Nota de Venta', 'Boleta', 'Factura']} v={f.voucher} set={v => setF({ ...f, voucher: v })} />
        {f.voucher !== 'Nota de Venta' && <input placeholder={f.voucher === 'Factura' ? 'RUC (11 dígitos) *' : 'DNI (opcional)'} value={f.doc} maxLength={11} onChange={e => setF({ ...f, doc: e.target.value.replace(/\D/g, '') })} />}
        {sel.pay_mode !== 'culqi' && <div className="fgrid"><div><label>Método de pago</label><select value={f.payment} onChange={e => setF({ ...f, payment: e.target.value })}>{['Efectivo', 'Yape', 'Tarjeta', 'Transferencia'].map(m => <option key={m}>{m}</option>)}</select></div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.paid} onChange={e => setF({ ...f, paid: e.target.checked })} /> {sel.pay_mode === 'pagar_ahora' ? 'Pago verificado' : 'Ya fue cobrado'}</label></div>}
        {!boxOk(sel) && <p className="warn" style={{ padding: 10 }}>Para aceptar este pedido necesitas tu caja abierta en <b>{bname(sel.branch_id)}</b>. {sel.branch_id === branchId ? <button className="rmv" style={{ fontWeight: 700 }} onClick={askBox}>Abrir mi caja</button> : 'Elige esa sede en la barra superior y abre tu caja.'}</p>}
        <Err e={e2} /><div className="row" style={{ gap: 8 }}><button className="btn o" style={{ flex: 1 }} onClick={reject}>{waitPay(sel) ? 'Descartar pedido' : 'Rechazar pedido'}</button><button className="btn g" style={{ flex: 2 }} disabled={busy || lack || needDoc || !boxOk(sel) || waitPay(sel)} onClick={confirm}>{busy ? 'Confirmando...' : 'Confirmar y emitir comprobante'}</button></div>
        <small style={{ color: 'var(--mut)' }}>Al confirmar se descuenta el stock de {bname(sel.branch_id)} y se genera el comprobante.</small></>}
    </Modal>}
    {done && <TicketModal sale={done} ctx={{ settings, branch: allBranches.find(b => b.id === done.branch_id) }} onClose={() => setDone(null)} />}</>)
}
