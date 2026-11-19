'use client'
import { useEffect, useMemo, useState } from 'react'

const PHONE0 = '51993344073'
const SLIDES = [
  { img: '/slide1.png', cls: 'long', kicker: 'Tu bar en casa', title: ['Los licores que', 'mereces brindar'], sub: 'Ron, whisky, pisco y más al mejor precio' },
  { img: '/slide2.png', kicker: 'Añejados en barrica', title: ['Sabor con', 'carácter'], sub: 'Descubre nuestra selección de whiskys y rones' },
  { img: '/slide3.png', kicker: 'Packs y promociones', title: ['Brinda con', 'lo mejor'], sub: 'Descubre nuestra selección de licores y packs' },
  { img: '/slide4.jpg', contact: true, kicker: 'Datos de contacto', title: ['Escríbenos', 'al celular'], sub: '' }
]
import { supabase, money, CATS, rpc, settingsMap } from '../lib/supabase'
import { applyBrand } from '../lib/brand'
import { compressImage, upload, rnd } from '../lib/images'
import { ticketPDF } from '../lib/tickets'
import { pushSupported, subscribeCustomer, pushEnv, PUBLIC_KEY, registerSW } from '../lib/push'

export default function Tienda() {
  const [prods, setProds] = useState([]), [cat, setCat] = useState('Todas'), [q, setQ] = useState(''), [cfg, setCfg] = useState({}), [branches, setBranches] = useState([]), [bid, setBid] = useState(null), [stock, setStock] = useState({})
  const [cart, setCart] = useState([]), [open, setOpen] = useState(false), [f, setF] = useState({ name: '', phone: '', address: '', notes: '', mode: 'contra_entrega' }), [proof, setProof] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [ok, setOk] = useState(null)
  const [sl, setSl] = useState(0), [menu, setMenu] = useState(false), PHONE = cfg.whatsapp || PHONE0, [pu, setPu] = useState(null)
  useEffect(() => { registerSW() }, [])
  // Notificaciones: aviso amable a los pocos segundos (el permiso solo se puede pedir con un toque del usuario)
  useEffect(() => {
    const env = pushEnv(); if (env === 'unsupported') return
    let t; try { if (Date.now() - +(localStorage.getItem('push-dismissed') || 0) < 7 * 864e5) return } catch (e) {}
    if (env === 'ok') { if (!PUBLIC_KEY || Notification.permission !== 'default') return; t = setTimeout(() => setPu('ask'), 5000) }
    else t = setTimeout(() => setPu(env), 6000)      // 'ios' (instalar la web) o 'inapp' (abrir en el navegador)
    return () => clearTimeout(t)
  }, [])
  // si ya aceptó antes, mantenemos su suscripción al día con la sede elegida
  useEffect(() => { if (bid && pushSupported() && PUBLIC_KEY && Notification.permission === 'granted') subscribeCustomer(bid).catch(() => {}) }, [bid])
  const dismissPu = () => { try { localStorage.setItem('push-dismissed', String(Date.now())) } catch (e) {} setPu(null) }
  const [guide, setGuide] = useState(false)
  const copyLink = async () => { try { await navigator.clipboard.writeText(location.href); setPu('copied'); setTimeout(() => setPu(null), 4000) } catch (e) { setPu(null) } }
  const enablePu = async () => { try { await subscribeCustomer(bid); setPu('ok'); setTimeout(() => setPu(null), 5000) } catch (e) { dismissPu() } }
  useEffect(() => { const t = setInterval(() => setSl(i => (i + 1) % SLIDES.length), 6000); return () => clearInterval(t) }, [sl])
  useEffect(() => { (async () => {
    const [p, b, s] = await Promise.all([supabase.from('products').select('*').order('name'), supabase.from('branches').select('*').order('created_at'), supabase.from('settings').select('*')])
    const c = settingsMap(s.data); setCfg(c); applyBrand(c.brand_color); setProds(p.data || []); setBranches(b.data || [])
    let saved = null; try { saved = localStorage.getItem('store-branch') } catch (e) {}
    setBid((b.data || []).find(x => x.id === saved)?.id || b.data?.[0]?.id || null)
  })() }, [])
  const loadStock = () => bid && supabase.from('branch_stock').select('product_id,stock').eq('branch_id', bid).then(r => setStock(Object.fromEntries((r.data || []).map(x => [x.product_id, x.stock]))))
  useEffect(() => { loadStock() }, [bid])
  const pickBranch = id => { setBid(id); setCart([]); try { localStorage.setItem('store-branch', id) } catch (e) {} }
  const branch = branches.find(b => b.id === bid), st = id => stock[id] ?? 0
  const list = useMemo(() => prods.filter(p => (cat === 'Todas' || (cat === 'Packs' ? p.is_pack : p.category === cat)) && p.name.toLowerCase().includes(q.toLowerCase())), [prods, cat, q])
  const chg = (id, d) => setCart(c => c.map(i => i.id === id ? { ...i, qty: Math.min(i.qty + d, st(id)) } : i).filter(i => i.qty > 0))
  const rm = id => setCart(c => c.filter(i => i.id !== id))
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const add = p => setCart(c => c.find(i => i.id === p.id) ? c.map(i => i.id === p.id ? { ...i, qty: Math.min(i.qty + 1, st(p.id)) } : i) : [...c, { id: p.id, name: p.name, price: +p.price, qty: 1 }])
  const bad = !cart.length || f.name.trim().length < 2 || f.phone.replace(/\D/g, '').length < 6 || (f.mode === 'pagar_ahora' && !proof)
  const order = async () => {
    setErr(''); setBusy(true)
    try {
      let path = null
      if (f.mode === 'pagar_ahora') { const blob = await compressImage(proof, { max: 1400 }); path = await upload('proofs', rnd() + '.webp', blob, 'image/webp') }
      const x = await rpc('create_web_order', { p_branch: bid, p_name: f.name, p_phone: f.phone, p_address: f.address || null, p_notes: f.notes || null, p_items: cart.map(i => ({ id: i.id, qty: i.qty })), p_pay_mode: f.mode, p_proof: path })
      if (x.error) { setBusy(false); loadStock(); return setErr(x.error) }
      const o = x.data, sale = { ...o, source: 'web', status: 'pendiente', voucher: 'Nota de Venta' }
      setOk({ sale, ctx: { settings: cfg, branch: o.branch } }); setCart([]); setProof(null); setOpen(false); setF({ ...f, notes: '' }); loadStock()
      try { await ticketPDF(sale, { settings: cfg, branch: o.branch }) } catch (e) {}
    } catch (e) { setErr('No se pudo enviar el pedido. Revisa tu conexión e inténtalo de nuevo.') }
    setBusy(false)
  }
  const chip = on => ({ border: '1.5px solid ' + (on ? 'var(--red)' : '#ddd'), background: on ? 'var(--red-soft)' : '#fff', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', display: 'block', width: '100%', fontSize: 14 })
  return (<>
    <header className="top">
      <button className="burger" aria-label="Abrir categorías" aria-expanded={menu} onClick={() => setMenu(true)}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
      <label className="search"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7.5" /><path d="M20 20l-3.8-3.8" /></svg>
        <input placeholder="¿Qué busca?" value={q} onChange={e => setQ(e.target.value)} /></label>
      <img className="logo-img" src={cfg.logo_url || '/logo.png'} alt="Logo" />
      <button className="bag" aria-label="Carrito" onClick={() => setOpen(true)}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 8a4 4 0 0 1 8 0" /><path d="M5 8h14v6" /><path d="M5 8v11h8" /><path d="M18 16v5M15.5 18.5h5" /></svg>
        {cart.length > 0 && <span className="badge">{cart.reduce((s, i) => s + i.qty, 0)}</span>}
      </button>
    </header>
    <nav className="nav">{['Todas', ...CATS, 'Packs'].map(c => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c.toUpperCase()}</button>)}</nav>
    {menu && <div className="cmenu-bg" onClick={() => setMenu(false)}><aside className="cmenu" role="dialog" aria-label="Categorías" onClick={e => e.stopPropagation()}>
      <div className="cmenu-h"><b>Categorías</b><button aria-label="Cerrar" onClick={() => setMenu(false)}>✕</button></div>
      {['Todas', ...CATS, 'Packs'].map(c => <button key={c} className={cat === c ? 'on' : ''} onClick={() => { setCat(c); setMenu(false); setTimeout(() => document.getElementById('cat')?.scrollIntoView({ behavior: 'smooth' }), 80) }}>{c}{cat === c && <span>✓</span>}</button>)}
    </aside></div>}
    <section className="slider">
      {SLIDES.map((x, i) => <div key={i} className={'slide' + (i === sl ? ' on' : '') + (x.cls ? ' ' + x.cls : '')} style={x.img ? { backgroundImage: `url(${x.img})` } : undefined}>
        <div className={'cap' + (x.contact ? ' contact' : '')}>
          <span className="kick">{x.kicker}</span>
          <h1>{x.title[0]}<br />{x.title[1]}</h1>
          <p>{x.contact ? (cfg.whatsapp ? '+' + cfg.whatsapp : '+51 993 344 073') : x.sub}</p>
          {x.contact ? <a className="btn" href={`https://wa.me/${PHONE}`} target="_blank">Escribir por WhatsApp</a>
            : <button className="btn" onClick={() => document.getElementById('cat').scrollIntoView({ behavior: 'smooth' })}>COMPRAR</button>}
        </div></div>)}
      <div className="dots">{SLIDES.map((_, i) => <button key={i} aria-label={`Slide ${i + 1}`} className={i === sl ? 'on' : ''} onClick={() => setSl(i)} />)}</div>
    </section>
    <div className="shop"><main className="wrap" id="cat"><h2>NUESTROS LICORES</h2>
      {branches.length > 1 && <p style={{ textAlign: 'center', marginBottom: 16 }}>📍 Pedido para la sede: <select style={{ width: 'auto', display: 'inline-block' }} value={bid || ''} onChange={e => pickBranch(e.target.value)}>{branches.map(b => <option key={b.id} value={b.id}>{b.name}{b.city ? ' · ' + b.city : ''}</option>)}</select></p>}
      <div className="grid">{list.map(p => { const off = p.old_price > p.price, n = st(p.id); return <div className="prod" key={p.id}>
        {off && <span className="save">AHORRA {money(p.old_price - p.price)}</span>}
        <div className="pimg">{p.image_url ? <img src={p.image_url} alt={p.name} /> : <svg width="46" height="120" viewBox="0 0 24 60" fill="none" stroke="#d3cbc8" strokeWidth="1.2"><path d="M10 2h4v10c0 3 5 5 5 10v34a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V22c0-5 5-7 5-10z" /></svg>}</div>
        <p className="pname">{p.name}</p>
        <p className="pprice"><span className={off ? 'now' : ''}>{money(p.price)}</span>{off && <s>{money(p.old_price)}</s>}</p>
        <button className="padd" disabled={n < 1} onClick={() => add(p)}>{n < 1 ? 'Agotado' : 'Agregar'}</button></div> })}
        {!list.length && <p>No hay productos en esta categoría.</p>}</div>
    </main></div>
    {open && <aside className="drawer" style={{ overflow: 'auto' }}>
      <div className="row"><b>Tu carrito</b><button className="btn o" onClick={() => setOpen(false)}>Cerrar</button></div>
      <div>{cart.map(i => <div className="ci" key={i.id}>
          <div className="row"><span>{i.name}</span><b>{money(i.qty * i.price)}</b></div>
          <div className="row"><div className="step"><button aria-label="Quitar uno" onClick={() => chg(i.id, -1)}>−</button><span>{i.qty}</span><button aria-label="Agregar uno" disabled={i.qty >= st(i.id)} onClick={() => chg(i.id, 1)}>+</button></div>
            <button className="rmv" onClick={() => rm(i.id)}>Quitar</button></div></div>)}
        {!cart.length && <p>Agrega licores para comenzar.</p>}</div>
      <input placeholder="Tu nombre *" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <input placeholder="Celular *" inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
      <input placeholder="Dirección de entrega" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
      <input placeholder="Referencia o comentario (opcional)" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
      <b style={{ fontSize: 14 }}>Forma de pago</b>
      <button type="button" style={chip(f.mode === 'contra_entrega')} onClick={() => setF({ ...f, mode: 'contra_entrega' })}><b>Pago contra entrega</b><br /><small>Pagas cuando recibes tu pedido</small></button>
      <button type="button" style={chip(f.mode === 'pagar_ahora')} onClick={() => setF({ ...f, mode: 'pagar_ahora' })}><b>Pagar ahora con Yape</b><br /><small>Escanea el QR y adjunta tu captura</small></button>
      {f.mode === 'pagar_ahora' && <div style={{ background: '#faf6f5', borderRadius: 12, padding: 12, display: 'grid', gap: 8, justifyItems: 'center', textAlign: 'center' }}>
        {cfg.yape_qr_url ? <img src={cfg.yape_qr_url} alt="QR de Yape" style={{ width: 200, maxWidth: '100%', borderRadius: 10 }} /> : <small>QR no disponible: paga al número de Yape indicado.</small>}
        {(cfg.yape_number || cfg.yape_name) && <small>{cfg.yape_name && <b>{cfg.yape_name}</b>}{cfg.yape_number && <> · Yape {cfg.yape_number}</>}</small>}
        <b>Monto a pagar: {money(total)}</b>
        <label className="dz" style={{ width: '100%', boxSizing: 'border-box' }}>{proof ? '✓ ' + proof.name : '📎 Adjuntar foto del pago *'}<input type="file" accept="image/*" hidden onChange={e => setProof(e.target.files[0] || null)} /></label>
        {proof && <img src={URL.createObjectURL(proof)} alt="Vista previa del pago" style={{ maxHeight: 130, borderRadius: 8 }} />}</div>}
      {err && <p style={{ color: '#b91c1c', background: '#fee2e2', padding: 10, borderRadius: 8 }}>⚠ {err}</p>}
      <div className="row"><b>Total</b><span className="price">{money(total)}</span></div>
      <button className="btn" disabled={bad || busy} onClick={order}>{busy ? 'Enviando...' : 'Enviar pedido'}</button>
    </aside>}
    {ok && <div className="modal" onClick={() => setOk(null)}><div className="mbox" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#16a34a', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 34, margin: '0 auto' }}>✓</div>
      <h2 style={{ marginTop: 8 }}>Pedido realizado con éxito, muchas gracias por su preferencia</h2>
      <p className="sub" style={{ margin: 0 }}>Tu número de pedido es <b>{ok.sale.order_number}</b>. Se descargó tu ticket en PDF; la tienda confirmará tu pedido y te contactará.</p>
      <button className="btn o" onClick={() => ticketPDF(ok.sale, ok.ctx)}>⬇ Descargar ticket de nuevo</button><button className="btn" onClick={() => setOk(null)}>Seguir comprando</button></div></div>}
    {pu && <div className="pushbar" role="dialog" aria-label="Notificaciones">
      <div style={{ fontSize: 26 }}>{pu === 'ok' || pu === 'copied' ? '✅' : '🔔'}</div>
      <div style={{ flex: 1 }}>{pu === 'ok' ? <b>¡Listo! Te avisaremos de nuestras ofertas.</b> : pu === 'copied' ? <b>Enlace copiado. Pégalo en Chrome o Safari.</b>
        : pu === 'ios' ? <><b>Instala KOVA en tu iPhone para recibir ofertas</b><br /><small>Es gratis y toma 10 segundos.</small></>
        : pu === 'inapp' ? <><b>Abre KOVA en tu navegador</b><br /><small>Desde esta app no se pueden activar los avisos. Ábrelo en Chrome o Safari.</small></>
        : <><b>¿Te avisamos de ofertas y novedades?</b><br /><small>Recibe promociones de KOVA en tu celular o computadora. Puedes desactivarlo cuando quieras.</small></>}</div>
      {pu === 'ask' && <button className="btn" onClick={enablePu}>Activar</button>}{pu === 'ios' && <button className="btn" onClick={() => setGuide(true)}>Cómo hacerlo</button>}{pu === 'inapp' && <button className="btn" onClick={copyLink}>Copiar enlace</button>}{pu !== 'ok' && pu !== 'copied' && <button className="btn o" onClick={dismissPu}>Ahora no</button>}</div>}
    {guide && <div className="modal" onClick={() => setGuide(false)}><div className="mbox" onClick={e => e.stopPropagation()}><div className="row"><b>Instalar KOVA en tu iPhone</b><button className="btn o" onClick={() => setGuide(false)}>✕</button></div>
      <ol style={{ paddingLeft: 20, lineHeight: 1.7, margin: 0 }}><li>Abre esta página en <b>Safari</b>.</li><li>Toca el botón <b>Compartir</b> <span style={{ fontSize: 18 }}>⬆️</span> (barra inferior).</li><li>Elige <b>«Añadir a pantalla de inicio»</b> y toca <b>Añadir</b>.</li><li>Abre <b>KOVA desde tu pantalla de inicio</b> y toca <b>Activar</b> en el aviso.</li></ol>
      <small style={{ color: 'var(--mut)' }}>Requiere iOS 16.4 o superior. Apple solo permite notificaciones a las webs instaladas así.</small><button className="btn" onClick={() => { setGuide(false); dismissPu() }}>Entendido</button></div></div>}
    <a className="wa" href={`https://wa.me/${PHONE}`} target="_blank" aria-label="WhatsApp"><img src="/whatsapp.png" alt="WhatsApp" /></a>
  </>)
}
