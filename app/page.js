'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { promoPrice, limaNow } from '../lib/promo'

const PHONE0 = '51922808303'
const WA_MSG = 'Hola KOVA quisiera hacer el siguiente pedido:'
const SECS = ['Promociones', 'Combos', 'Ofertas']
const OFF = p => +p.old_price > +p.price
const SLIDES = [
  { img: '/slide1.png', st: 'a', title: ['ELEVA TU', 'MOMENTO.'], sub: 'Cada brindis merece algo especial.', cta: 'EXPLORAR PRODUCTOS.' },
  { img: '/slide2.png', st: 'b', title: ['LA NOCHE', 'EMPIEZA AQUÍ.'], sub: 'Tú pones el momento, nosotros el brindis.', cta: 'VER PRODUCTOS.' },
  { img: '/slide3.png', st: 'c', title: ['KOVA LLEGA A TI.'], sub: 'Tu bar favorito, donde estés.', cta: 'PEDIR AHORA.' },
  { img: '/slide4.jpg', st: 'd', title: ['GRANDES MOMENTOS,', 'GRANDES PRECIOS.'], sub: 'Tus favoritos, a precios que sorprenden.', cta: 'VER OFERTAS.' }
]
import { supabase, money, CATS, rpc, settingsMap } from '../lib/supabase'
import { applyBrand } from '../lib/brand'
import { compressImage, upload, rnd } from '../lib/images'
import { ticketPDF } from '../lib/tickets'
import { Ticker } from '../lib/ticker'
import { pushSupported, subscribeCustomer, pushEnv, PUBLIC_KEY, registerSW } from '../lib/push'
import { OrderTrack, lastOrder, rememberOrder } from '../lib/ordertrack'
import { CulqiPay } from '../lib/culqipay'
import { deliveryQuote, rates } from '../lib/delivery'
import { LegalModal } from '../lib/legal'
import { ClaimModal, ClaimStatusModal } from '../lib/claim'

export default function Tienda() {
  const [raw, setProds] = useState([]), [promos, setPromos] = useState([]), [cat, setCat] = useState('Todas'), [q, setQ] = useState(''), [cfg, setCfg] = useState({}), [branches, setBranches] = useState([]), [bid, setBid] = useState(null), [stock, setStock] = useState({})
  // Precio con promoción vigente (el servidor vuelve a calcularlo al registrar el pedido)
  const prods = useMemo(() => { const now = limaNow(); return raw.map(p => { const r = promoPrice(p, promos, now); return r.promo ? { ...p, price: r.price, old_price: +p.price, promo: r.promo } : p }) }, [raw, promos])
  const [cart, setCart] = useState([]), [open, setOpen] = useState(false), [f, setF] = useState({ name: '', phone: '', email: '', notes: '', mode: 'contra_entrega' }), [proof, setProof] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [ok, setOk] = useState(null), [cq, setCq] = useState(null), [pop, setPop] = useState('')
  const [sl, setSl] = useState(0), [menu, setMenu] = useState(false), [pv, setPv] = useState(null), PHONE = cfg.whatsapp || PHONE0, [pu, setPu] = useState(null)
  useEffect(() => { registerSW() }, [])
  useEffect(() => { if (!pv) return; const f = e => e.key === 'Escape' && setPv(null); document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f) }, [pv])
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
  const [legal, setLegal] = useState(null), [claim, setClaim] = useState(false), [claimStatus, setClaimStatus] = useState(false), [terms, setTerms] = useState(false)
  // Código de descuento: lo valida y calcula el servidor (validate_discount_code); aquí solo se muestra
  const [codeIn, setCodeIn] = useState(''), [codeApplied, setCodeApplied] = useState(''), [codeInfo, setCodeInfo] = useState(null), [codeErr, setCodeErr] = useState(''), [codeBusy, setCodeBusy] = useState(false)
  const [trk, setTrk] = useState(null)      // null = cerrado · texto = abierto (con el último pedido ya cargado, si lo hay)
  const openTrk = () => { setMenu(false); setTrk(lastOrder()) }
  // al tocar el aviso en el celular se abre la tienda con el estado de ese pedido
  useEffect(() => { try { const c = new URLSearchParams(location.search).get('pedido'); if (c) { setTrk(c.slice(0, 30)); history.replaceState(null, '', location.pathname) } } catch (e) {} }, [])
  // Ubicación GPS del cliente (obligatoria). Se pide «alta precisión» (chip GPS del celular) y se sigue afinando hasta ~12 s
  // quedándonos con la lectura más exacta, parecido a «ubicación en tiempo real» de WhatsApp. Si solo hay una ubicación aproximada
  // (por WiFi/antena/IP, de cientos de metros) se rechaza y se pide activar el GPS.
  const GPS_OK = 40, GPS_MAX = 100
  const [gps, setGps] = useState(null), [gpsBusy, setGpsBusy] = useState(false), [gpsErr, setGpsErr] = useState(''), [gpsLive, setGpsLive] = useState(null)
  const gpsW = useRef(null), gpsT = useRef(null)
  const mapUrl = g => `https://www.google.com/maps?q=${g.lat},${g.lng}`
  const stopGps = () => { if (gpsW.current != null) { try { navigator.geolocation.clearWatch(gpsW.current) } catch (e) {} gpsW.current = null } clearTimeout(gpsT.current) }
  useEffect(() => stopGps, [])
  const getGps = () => {
    setGpsErr(''); if (!navigator.geolocation) return setGpsErr('Tu navegador no permite obtener la ubicación.')
    stopGps(); setGpsBusy(true); setGpsLive(null)
    let best = null
    // En PC no hay GPS: se acepta la ubicación aproximada del WiFi/internet. En celular se sigue exigiendo precisión.
    const ua = navigator.userAgent || '', desktop = !/Android|iPhone|iPad|iPod|Mobile/i.test(ua) && !(/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    const finish = () => {
      stopGps(); setGpsBusy(false); setGpsLive(null)
      if (!best) return setGpsErr('No se pudo obtener tu ubicación. Activa el GPS e inténtalo de nuevo.')
      if (best.acc > GPS_MAX && !desktop) { setGps(null); return setGpsErr(`Tu ubicación es poco precisa (±${best.acc} m) y parece venir del WiFi o de la antena, no del GPS. Activa el GPS del celular (ubicación de «alta precisión»), sal a un lugar abierto e inténtalo otra vez.`) }
      setGps(best)
    }
    gpsW.current = navigator.geolocation.watchPosition(
      p => { const c = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }; if (!best || c.acc < best.acc) best = c; setGpsLive(best.acc); if (c.acc <= GPS_OK || desktop) finish() },
      e => { if (best) return finish(); stopGps(); setGpsBusy(false); setGpsLive(null); setGpsErr(e.code === 1 ? 'Permiso denegado. Permite la ubicación de este sitio en tu navegador (candado de la barra de direcciones) e inténtalo otra vez.' : e.code === 3 ? 'Tardó demasiado. Activa el GPS e inténtalo de nuevo.' : 'No se pudo obtener tu ubicación. Activa el GPS e inténtalo de nuevo.') },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
    gpsT.current = setTimeout(finish, 12000)
  }
  // arma el mensaje con la lista del pedido y abre WhatsApp (no registra el pedido en el sistema)
  const waOrder = () => {
    const n = x => x.trim()
    const msg = [WA_MSG, '', ...cart.map(i => `• ${i.qty} x ${i.name} — ${money(i.price * i.qty)}`), '', ...(dq ? [`Delivery (${dq.km.toFixed(1)} km): ${money(dq.fee)}`] : []), ...(disc > 0 ? [`Código ${codeApplied}: - ${money(disc)}`] : []), `Total: ${money(total)}`, '',
      n(f.name) ? `Nombre: ${n(f.name)}` : null, n(f.phone) ? `Celular: ${n(f.phone)}` : null, n(f.notes) ? `Referencia: ${n(f.notes)}` : null,
      gps ? `Ubicación: ${mapUrl(gps)}` : null, branch ? `Sede: ${branch.name}` : null, `Pago: ${f.mode === 'pagar_ahora' ? 'Yape' : f.mode === 'culqi' ? 'Pago en línea' : 'Contra entrega'}`].filter(l => l !== null).join('\n')
    window.open(`https://wa.me/${PHONE}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }
  const copyLink = async () => { try { await navigator.clipboard.writeText(location.href); setPu('copied'); setTimeout(() => setPu(null), 4000) } catch (e) { setPu(null) } }
  const [puErr, setPuErr] = useState(''), enablePu = async () => { try { setPuErr(''); await subscribeCustomer(bid); setPu('ok'); setTimeout(() => setPu(null), 5000) } catch (e) { if (e.message === 'denied') return dismissPu(); setPuErr(e.message || 'Error desconocido'); setPu('fail') } }
  useEffect(() => { const t = setInterval(() => setSl(i => (i + 1) % SLIDES.length), 6000); return () => clearInterval(t) }, [sl])
  // Anuncio con imagen al entrar (se sube en Admin > Anuncios). Sale según la frecuencia elegida y solo si la imagen carga bien.
  const showPopup = c => {
    if (c.popup_on !== true || !c.popup_image) return
    const v = String(c.popup_v || '1'), fr = c.popup_freq || 'sesion', day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    try {
      if (fr === 'sesion' && sessionStorage.getItem('kova-popup') === v) return
      if (fr === 'dia' && localStorage.getItem('kova-popup') === v + '|' + day) return
    } catch (e) {}
    const im = new Image()
    im.onload = () => { try { if (fr === 'sesion') sessionStorage.setItem('kova-popup', v); else if (fr === 'dia') localStorage.setItem('kova-popup', v + '|' + day) } catch (e) {} setPop(c.popup_image) }
    im.src = c.popup_image
  }
  useEffect(() => { if (!pop) return; const k = e => e.key === 'Escape' && setPop(''); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [pop])
  useEffect(() => { (async () => {
    const [p, b, s, pr] = await Promise.all([supabase.from('products').select('*').order('name'), supabase.from('branches').select('*').order('created_at'), supabase.from('settings').select('*'), supabase.from('promotions').select('*')])
    const c = settingsMap(s.data); setCfg(c); applyBrand(c.brand_color); showPopup(c); setProds(p.data || []); setPromos(pr.data || []); setBranches(b.data || [])
    let saved = null; try { saved = localStorage.getItem('store-branch') } catch (e) {}
    setBid((b.data || []).find(x => x.id === saved)?.id || b.data?.[0]?.id || null)
  })() }, [])
  const loadStock = () => bid && supabase.rpc('stock_view', { p_branch: bid }).then(r => r.error ? supabase.from('branch_stock').select('product_id,stock').eq('branch_id', bid) : r).then(r => setStock(Object.fromEntries((r.data || []).map(x => [x.product_id, x.stock]))))
  useEffect(() => { loadStock() }, [bid])
  const pickBranch = id => { setBid(id); setCart([]); setCodeApplied(''); setCodeInfo(null); setCodeErr(''); setCodeIn(''); try { localStorage.setItem('store-branch', id) } catch (e) {} }
  const branch = branches.find(b => b.id === bid), st = id => stock[id] ?? 0
  const list = useMemo(() => prods.filter(p => (cat === 'Todas' || (cat === 'Packs' || cat === 'Combos' ? p.is_pack || p.kind === 'combo' : cat === 'Ofertas' ? OFF(p) : cat === 'Promociones' ? !!p.promo : p.category === cat)) && p.name.toLowerCase().includes(q.trim().toLowerCase())), [prods, cat, q])
  // elige una sección/categoría (o solo aplica la búsqueda) y baja a los productos
  const goCat = (c, keep) => { if (!keep || c !== 'Todas') setCat(c); setMenu(false); setTimeout(() => document.getElementById('cat')?.scrollIntoView({ behavior: 'smooth' }), 80) }
  const chg = (id, d) => setCart(c => c.map(i => i.id === id ? { ...i, qty: Math.min(i.qty + d, st(id)) } : i).filter(i => i.qty > 0))
  const rm = id => setCart(c => c.filter(i => i.id !== id))
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const dq = gps && branch ? deliveryQuote(branch, cfg, gps.lat, gps.lng) : null, dr = rates(cfg), fee = dq ? dq.fee : 0, disc = codeApplied && codeInfo?.ok ? Math.min(+codeInfo.discount || 0, sub + fee) : 0, total = Math.max(0, Math.round((sub + fee - disc) * 100) / 100)
  const clearCode = (keepText) => { setCodeApplied(''); setCodeInfo(null); setCodeErr(''); if (!keepText) setCodeIn('') }
  const codeLabel = c => !c ? '' : c.applies_to === 'delivery' ? (c.disc_type === 'percent' ? (+c.value >= 100 ? 'Delivery gratis' : `${+c.value}% de descuento en el delivery`) : `${money(c.value)} de descuento en el delivery`) : (c.disc_type === 'percent' ? `${+c.value}% de descuento en tus productos` : `${money(c.value)} de descuento en tus productos`)
  const checkCode = code => rpc('validate_discount_code', { p_code: code, p_branch: bid, p_items: cart.map(i => ({ id: i.id, qty: i.qty })), p_phone: f.phone.replace(/\D/g, '').length >= 6 ? f.phone : null, p_lat: gps?.lat ?? null, p_lng: gps?.lng ?? null })
  const codeMsg = x => /Could not find the function|schema cache|does not exist/i.test(x.error || '') ? 'Los códigos de descuento aún no están activados en la tienda.' : (x.error || x.data?.error || 'Código no válido')
  const applyCode = async () => {
    const c = codeIn.trim(); setCodeErr(''); if (!c) return setCodeErr('Escribe tu código de descuento')
    setCodeBusy(true); const x = await checkCode(c); setCodeBusy(false)
    if (x.error || !x.data?.ok) return setCodeErr(codeMsg(x))
    setCodeApplied(x.data.code); setCodeIn(x.data.code); setCodeInfo(x.data)
  }
  // Si cambia el carrito, el celular o la ubicación, se vuelve a validar (mínimo de compra, usos por cliente, delivery...)
  const itemsKey = cart.map(i => i.id + ':' + i.qty).join(','), phoneKey = f.phone.replace(/\D/g, '')
  useEffect(() => {
    if (!codeApplied) return
    let alive = true
    const t = setTimeout(async () => { const x = await checkCode(codeApplied); if (!alive) return; if (x.error || !x.data?.ok) { clearCode(true); setCodeErr(codeMsg(x)) } else setCodeInfo(x.data) }, 450)
    return () => { alive = false; clearTimeout(t) }
  }, [codeApplied, itemsKey, phoneKey, bid, gps?.lat, gps?.lng])
  const add = p => setCart(c => c.find(i => i.id === p.id) ? c.map(i => i.id === p.id ? { ...i, qty: Math.min(i.qty + 1, st(p.id)) } : i) : [...c, { id: p.id, name: p.name, price: +p.price, qty: 1 }])
  const bad = !terms || !cart.length || f.name.trim().length < 2 || f.phone.replace(/\D/g, '').length < 6 || !gps || (dq && !dq.ok) || (f.mode === 'pagar_ahora' && !proof) || (f.mode === 'culqi' && (!/^\S+@\S+\.\S+$/.test(f.email.trim()) || total < 3))
  // Pago en línea (Culqi): el servidor registra el pedido y crea la orden de pago; luego se abre el formulario dentro de la tienda
  const startOnline = async () => {
    setErr(''); setBusy(true)
    try {
      const r = await fetch('/api/culqi/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch: bid, name: f.name, phone: f.phone, email: f.email.trim(), notes: f.notes.trim() || null, items: cart.map(i => ({ id: i.id, qty: i.qty })), lat: gps.lat, lng: gps.lng, acc: gps.acc, code: codeApplied || null }) })
      const d = await r.json().catch(() => ({ error: 'Respuesta no válida del servidor' }))
      if (d.error) { setBusy(false); loadStock(); return setErr(d.error) }
      rememberOrder(d.order_number); setCq(d)
    } catch (e) { setErr('No se pudo iniciar el pago. Revisa tu conexión e inténtalo de nuevo.') }
    setBusy(false)
  }
  // El cliente terminó el pago en línea: pagado, o código de PagoEfectivo generado (queda pendiente hasta que pague)
  const onlineDone = async res => {
    const o = cq.sale, pay = { ...res, method: res.method || 'pagoefectivo' }
    const sale = { ...o, source: 'web', status: 'pendiente', voucher: 'Nota de Venta', pay_mode: 'culqi', pay_status: res.kind === 'paid' ? 'pagado' : 'pendiente', pay_method: pay.method, pay_cip: res.cip || null }
    setCq(null); clearCode(); setOk({ sale, ctx: { settings: cfg, branch: o.branch }, pay }); setGps(null); setCart([]); setOpen(false); setF(x => ({ ...x, notes: '' })); loadStock()
    try { await ticketPDF(sale, { settings: cfg, branch: o.branch }) } catch (e) {}
  }
  const order = async () => {
    if (f.mode === 'culqi') return startOnline()
    setErr(''); setBusy(true)
    try {
      let path = null
      if (f.mode === 'pagar_ahora') { const blob = await compressImage(proof, { max: 1400 }); path = await upload('proofs', rnd() + '.webp', blob, 'image/webp') }
      const x = await rpc('create_web_order', { p_branch: bid, p_name: f.name, p_phone: f.phone, p_notes: f.notes.trim() || null, p_items: cart.map(i => ({ id: i.id, qty: i.qty })), p_pay_mode: f.mode, p_proof: path, p_lat: gps.lat, p_lng: gps.lng, p_acc: gps.acc, p_code: codeApplied || null })
      if (x.error) { setBusy(false); loadStock(); return setErr(x.error) }
      const o = x.data, sale = { ...o, source: 'web', status: 'pendiente', voucher: 'Nota de Venta' }
      rememberOrder(o.order_number); clearCode(); setOk({ sale, ctx: { settings: cfg, branch: o.branch } }); setGps(null); setCart([]); setProof(null); setOpen(false); setF({ ...f, notes: '' }); loadStock()
      try { await ticketPDF(sale, { settings: cfg, branch: o.branch }) } catch (e) {}
    } catch (e) { setErr('No se pudo enviar el pedido. Revisa tu conexión e inténtalo de nuevo.') }
    setBusy(false)
  }
  const chip = on => ({ border: '1.5px solid ' + (on ? 'var(--red)' : '#ddd'), background: on ? 'var(--red-soft)' : '#fff', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', display: 'block', width: '100%', fontSize: 14 })
  return (<>
    <header className="top">
      <div className="topRow">
        <div className="topL">
          <button className="burger" aria-label="Abrir categorías" aria-expanded={menu} onClick={() => setMenu(true)}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
          <img className="logo-img" src={cfg.logo_url || '/logo.png'} alt="Logo" />
        </div>
        <div className="topR">
  <nav className="snav" aria-label="Secciones">{SECS.map(c => <button key={c} className={cat === c ? 'on' : ''} onClick={() => goCat(c)}>{c.toUpperCase()}</button>)}<button className={trk !== null ? 'on' : ''} onClick={openTrk}>ESTADO DE PEDIDO</button></nav>
        <button className="bag" aria-label="Carrito" onClick={() => setOpen(true)}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 9h2V6h3V4h-3V1h-2v3H8v2h3v3zm-4 9c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2zm-9.83-3.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.86-7.01L19.42 4h-.01l-1.1 2-2.76 5H8.53l-.13-.27L6.16 6l-.95-2-.94-2H1v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.13 0-.25-.11-.25-.25z" /></svg>
        {cart.length > 0 && <span className="badge">{cart.reduce((s, i) => s + i.qty, 0)}</span>}
      </button>
        </div>
      </div>
    </header>
    {menu && <div className="cmenu-bg" onClick={() => setMenu(false)}><aside className="cmenu" role="dialog" aria-label="Categorías" onClick={e => e.stopPropagation()}>
      <div className="cmenu-h"><b>Menú</b><button aria-label="Cerrar" onClick={() => setMenu(false)}>✕</button></div>
      <form className="cmenu-s" role="search" onSubmit={e => { e.preventDefault(); goCat('Todas', true) }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7.5" /><path d="M20 20l-3.8-3.8" /></svg>
        <input type="search" enterKeyHint="search" placeholder="¿Qué busca?" aria-label="Buscar productos" value={q} onChange={e => setQ(e.target.value)} />{q && <button type="button" aria-label="Borrar búsqueda" onClick={() => setQ('')}>✕</button>}</form>
      <button className="cmenu-trk" onClick={openTrk}>📦 Estado de pedido</button>
      <small className="cmenu-t">Secciones</small>
      {SECS.map(c => <button key={c} className={cat === c ? 'on' : ''} onClick={() => goCat(c)}>{c}{cat === c && <span>✓</span>}</button>)}
      <small className="cmenu-t">Categorías</small>
      {['Todas', ...CATS].map(c => <button key={c} className={cat === c ? 'on' : ''} onClick={() => goCat(c)}>{c}{cat === c && <span>✓</span>}</button>)}
    </aside></div>}
    <section className="slider">
      {SLIDES.map((x, i) => <div key={i} className={'slide sl-' + x.st + (i === sl ? ' on' : '')} style={x.img ? { backgroundImage: `url(${x.img})` } : undefined} aria-hidden={i !== sl}>
        <div className="cap">
          <h1>{x.title.map((t, k) => <span key={k}>{k > 0 && <br />}{t}</span>)}</h1>
          <p>{x.sub}</p>
          <button className="cta" tabIndex={i === sl ? 0 : -1} onClick={() => document.getElementById('cat').scrollIntoView({ behavior: 'smooth' })}>{x.cta}</button>
        </div></div>)}
      <div className="dots">{SLIDES.map((_, i) => <button key={i} aria-label={`Slide ${i + 1}`} className={i === sl ? 'on' : ''} onClick={() => setSl(i)} />)}</div>
    </section>
    {cfg.marquee_on !== false && <Ticker text={cfg.marquee_text ?? 'ELEVA TU MOMENTO · KOVA'} speed={cfg.marquee_speed} />}
    <div className="shop"><main className="wrap" id="cat"><h2>NUESTROS LICORES</h2>
      {branches.length > 1 && <p style={{ textAlign: 'center', marginBottom: 16 }}>📍 Pedido para la sede: <select style={{ width: 'auto', display: 'inline-block' }} value={bid || ''} onChange={e => pickBranch(e.target.value)}>{branches.map(b => <option key={b.id} value={b.id}>{b.name}{b.city ? ' · ' + b.city : ''}</option>)}</select></p>}
      {(cat !== 'Todas' || q.trim()) && <p className="fbar">Mostrando: <b>{[cat !== 'Todas' && cat, q.trim() && `“${q.trim()}”`].filter(Boolean).join(' · ')}</b> <button onClick={() => { setCat('Todas'); setQ('') }}>✕ Ver todo</button></p>}
      {!list.length && prods.length > 0 && <p className="fempty">No encontramos productos en esta sección por ahora.</p>}
      <div className="grid">{list.map(p => { const off = p.old_price > p.price, n = st(p.id); return <div className="prod" key={p.id}>
        {off && <span className="save">AHORRA {money(p.old_price - p.price)}</span>}{p.promo ? <span className="ptag">🏷 {p.promo.name}</span> : p.kind === 'combo' && <span className="ptag">🎁 Combo</span>}
        <div className="pimg" role="button" tabIndex={0} aria-label={'Ver ' + p.name} onClick={() => setPv(p)} onKeyDown={e => e.key === 'Enter' && setPv(p)}>{p.image_url ? <img src={p.image_url} alt={p.name} /> : <svg width="46" height="120" viewBox="0 0 24 60" fill="none" stroke="#d3cbc8" strokeWidth="1.2"><path d="M10 2h4v10c0 3 5 5 5 10v34a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V22c0-5 5-7 5-10z" /></svg>}</div>
        <p className="pname" role="button" tabIndex={0} onClick={() => setPv(p)} onKeyDown={e => e.key === 'Enter' && setPv(p)}>{p.name}</p>
        <p className="pprice"><span className={off ? 'now' : ''}>{money(p.price)}</span>{off && <s>{money(p.old_price)}</s>}</p>
        <button className="padd" disabled={n < 1} onClick={() => add(p)}>{n < 1 ? 'Agotado' : 'Agregar'}</button></div> })}
        {!list.length && <p>No hay productos en esta categoría.</p>}</div>
    </main></div>
    <footer className="kfoot"><div className="kfoot-in">
      <div className="kfoot-grid">
        <div className="kfoot-brand">
          <img className="kfoot-img" src={cfg.logo_url || '/logo.png'} alt="KOVA" />
          <p className="kfoot-tag">Tu bar favorito, donde estés.</p>
        </div>
        <nav className="kfoot-col" aria-label="Información legal">
          <h3 className="kfoot-h">Información</h3>
          <ul className="kfoot-links">
            <li><button type="button" onClick={() => setLegal('terminos')}><span className="kfoot-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></svg></span><span className="kfoot-lt"><b>Términos y Condiciones</b><small>Reglas de compra y entrega</small></span><svg className="kfoot-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></li>
            <li><button type="button" onClick={() => setLegal('privacidad')}><span className="kfoot-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.5l7.5 2.8v6.2c0 4.7-3.2 8.6-7.5 10-4.3-1.4-7.5-5.3-7.5-10V5.3z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/></svg></span><span className="kfoot-lt"><b>Políticas de Privacidad</b><small>Cómo cuidamos tus datos</small></span><svg className="kfoot-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></li>
          </ul>
        </nav>
        <nav className="kfoot-col" aria-label="Atención al cliente">
          <h3 className="kfoot-h">Atención al cliente</h3>
          <ul className="kfoot-links">
            <li><button type="button" onClick={() => setClaim(true)}><span className="kfoot-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M20 17v4H6.5A2.5 2.5 0 0 1 4 18.5M9 8h6"/></svg></span><span className="kfoot-lt"><b>Libro de Reclamaciones</b><small>Registra tu queja o reclamo</small></span><svg className="kfoot-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></li>
            <li><button type="button" onClick={() => setClaimStatus(true)}><span className="kfoot-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg></span><span className="kfoot-lt"><b>Consultar mi reclamo</b><small>Revisa el estado con tu código</small></span><svg className="kfoot-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></li>
          </ul>
        </nav>
        <div className="kfoot-col kfoot-soc">
          <h3 className="kfoot-h">Síguenos en nuestras redes</h3>
          <div className="kfoot-sgrid">
            <a href="https://www.facebook.com/share/1DL1iQuUPW/" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><span className="kfoot-sico"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg></span><b>Facebook</b><small>Página oficial</small></a>
            <a href="https://www.instagram.com/kova.zo?fqnt=MTU3ZnRrdDFpZXN2eA==" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><span className="kfoot-sico"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 4 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7C8.3 24 8.7 24 12 24s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9z"/></svg></span><b>Instagram</b><small>@kova.zo</small></a>
            <a href="https://www.tiktok.com/@kova.zo?_r=1&_t=ZS-9Bal2QNM2Uw" target="_blank" rel="noopener noreferrer" aria-label="TikTok"><span className="kfoot-sico"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12.5 0h3.4c.2 1.8 1.3 4.6 4.1 4.8v3.4c-1.6 0-3.1-.5-4.1-1.2v6.9c0 3.5-2.4 6.1-5.8 6.1A5.9 5.9 0 0 1 4 14.1c0-3.8 3.2-6.4 6.9-5.8v3.5c-1.7-.5-3.4.6-3.4 2.3 0 1.4 1.1 2.5 2.5 2.5 1.6 0 2.5-1 2.5-2.7V0z"/></svg></span><b>TikTok</b><small>@kova.zo</small></a>
          </div>
        </div>
      </div>
      <div className="kfoot-bot"><small className="kfoot-c">© {new Date().getFullYear()} KOVA · Todos los derechos reservados</small><small className="kfoot-age"><i>+18</i> Venta de bebidas alcohólicas solo para mayores de 18 años. Disfruta con responsabilidad.</small></div>
    </div></footer>
    {pv && (() => { const off = pv.old_price > pv.price, n = st(pv.id); return <div className="pv-bg" onClick={() => setPv(null)}><div className="pv" role="dialog" aria-modal="true" aria-label={pv.name} onClick={e => e.stopPropagation()}>
      <button className="pv-x" aria-label="Cerrar" onClick={() => setPv(null)}>✕</button>
      <div className="pv-img">{off && <span className="save">AHORRA {money(pv.old_price - pv.price)}</span>}{pv.promo ? <span className="ptag">🏷 {pv.promo.name}</span> : pv.kind === 'combo' && <span className="ptag">🎁 Combo</span>}{pv.image_url ? <img src={pv.image_url} alt={pv.name} /> : <svg width="70" height="170" viewBox="0 0 24 60" fill="none" stroke="#d3cbc8" strokeWidth="1.2"><path d="M10 2h4v10c0 3 5 5 5 10v34a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V22c0-5 5-7 5-10z" /></svg>}</div>
      <div className="pv-info">{pv.category && <small className="pv-cat">{pv.category}</small>}<h3>{pv.name}</h3>
        <p className="pv-price"><span className={off ? 'now' : ''}>{money(pv.price)}</span>{off && <s>{money(pv.old_price)}</s>}</p>
        <p className="pv-desc">{pv.description || 'Disfruta responsablemente. Consulta por WhatsApp si necesitas más información de este producto.'}</p>
        <p className={'pv-stock ' + (n < 1 ? 'out' : n <= 5 ? 'low' : '')}>{n < 1 ? 'Agotado en esta sede' : n <= 5 ? `¡Últimas ${n} unidades!` : 'Disponible'}</p>
        <button className="btn pv-add" disabled={n < 1} onClick={() => { add(pv); setPv(null) }}>{n < 1 ? 'Agotado' : 'Agregar al carrito'}</button></div>
    </div></div> })()}
    {open && <aside className="drawer" style={{ overflow: 'auto' }}>
      <div className="row"><b>Tu carrito</b><button className="btn o" onClick={() => setOpen(false)}>Cerrar</button></div>
      <div>{cart.map(i => <div className="ci" key={i.id}>
          <div className="row"><span>{i.name}</span><b>{money(i.qty * i.price)}</b></div>
          <div className="row"><div className="step"><button aria-label="Quitar uno" onClick={() => chg(i.id, -1)}>−</button><span>{i.qty}</span><button aria-label="Agregar uno" disabled={i.qty >= st(i.id)} onClick={() => chg(i.id, 1)}>+</button></div>
            <button className="rmv" onClick={() => rm(i.id)}>Quitar</button></div></div>)}
        {!cart.length && <p>Agrega licores para comenzar.</p>}</div>
      <input placeholder="Tu nombre *" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <input placeholder="Celular *" inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
      <div className={'gpsf' + (!gps ? ' req' : '')}><span className="gpsf-t">{gps ? <>📍 <b>{gps.lat}, {gps.lng}</b> <small>(±{gps.acc} m)</small></> : gpsBusy ? <>Buscando GPS…{gpsLive != null && <small> ±{gpsLive} m</small>}</> : 'Ubicación en tiempo real *'}</span>
        {gps && <a href={mapUrl(gps)} target="_blank" rel="noopener" className="gpsf-l">Ver mapa</a>}
        <button type="button" className="gpsf-b" disabled={gpsBusy} onClick={getGps}>{gpsBusy ? 'Buscando…' : gps ? 'Actualizar' : '📍 Usar mi ubicación'}</button></div>
      {!gps && !gpsErr && <small style={{ color: '#777', marginTop: -6 }}>Obligatoria: con tu ubicación GPS te llevamos el pedido. Actívala en tu celular y permite el acceso cuando el navegador lo pida.</small>}
      {gpsErr && <small style={{ color: '#b91c1c', marginTop: -6 }}>⚠ {gpsErr}</small>}
      <input placeholder="Referencia o comentario (opcional) · ej: casa azul, 2do piso" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
      <div className="dcode">
        <b style={{ fontSize: 14 }}>Código de descuento</b>
        {codeApplied && codeInfo?.ok ? <div className="dcode-ok"><span>🏷 <b>{codeApplied}</b><small>{codeInfo.need_gps ? 'Se aplicará al delivery cuando compartas tu ubicación' : codeLabel(codeInfo)}</small></span><button type="button" onClick={() => clearCode()}>Quitar</button></div>
          : <div className="dcode-row"><input placeholder="¿Tienes un código?" value={codeIn} maxLength={40} autoCapitalize="characters" autoComplete="off" onChange={e => { setCodeIn(e.target.value.toUpperCase().replace(/\s/g, '')); setCodeErr('') }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCode() } }} />
            <button type="button" disabled={codeBusy || !codeIn.trim() || !cart.length} onClick={applyCode}>{codeBusy ? '...' : 'Aplicar'}</button></div>}
        {!cart.length && !codeApplied && <small style={{ color: '#777' }}>Agrega productos al carrito para usar tu código.</small>}
        {codeErr && <small style={{ color: '#b91c1c' }}>⚠ {codeErr}</small>}
      </div>
      <b style={{ fontSize: 14 }}>Forma de pago</b>
      <button type="button" style={chip(f.mode === 'contra_entrega')} onClick={() => setF({ ...f, mode: 'contra_entrega' })}><b>Pago contra entrega</b><br /><small>Pagas cuando recibes tu pedido</small></button>
      <button type="button" style={chip(f.mode === 'pagar_ahora')} onClick={() => setF({ ...f, mode: 'pagar_ahora' })}><b>Pagar ahora con Yape</b><br /><small>Escanea el QR y adjunta tu captura</small></button>
      <button type="button" style={chip(f.mode === 'culqi')} onClick={() => setF({ ...f, mode: 'culqi' })}><b>Pagar en línea</b><br /><small>Tarjeta, Yape o PagoEfectivo · sin salir de la web</small></button>
      {f.mode === 'culqi' && <><input type="email" inputMode="email" autoComplete="email" placeholder="Tu correo electrónico * (para tu pago)" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        <small style={{ color: '#777', marginTop: -6 }}>{total > 0 && total < 3 ? '⚠ El pago en línea acepta compras desde S/ 3.00.' : 'Pagas aquí mismo de forma segura con Culqi. Si eliges PagoEfectivo, tu pedido queda pendiente hasta que pagues el código.'}</small></>}
      {f.mode === 'pagar_ahora' && <div style={{ background: '#faf6f5', borderRadius: 12, padding: 12, display: 'grid', gap: 8, justifyItems: 'center', textAlign: 'center' }}>
        {cfg.yape_qr_url ? <img src={cfg.yape_qr_url} alt="QR de Yape" style={{ width: 200, maxWidth: '100%', borderRadius: 10 }} /> : <small>QR no disponible: paga al número de Yape indicado.</small>}
        {(cfg.yape_number || cfg.yape_name) && <small>{cfg.yape_name && <b>{cfg.yape_name}</b>}{cfg.yape_number && <> · Yape {cfg.yape_number}</>}</small>}
        <b>Monto a pagar: {money(total)}</b>
        <label className="dz" style={{ width: '100%', boxSizing: 'border-box' }}>{proof ? '✓ ' + proof.name : '📎 Adjuntar foto del pago *'}<input type="file" accept="image/*" hidden onChange={e => setProof(e.target.files[0] || null)} /></label>
        {proof && <img src={URL.createObjectURL(proof)} alt="Vista previa del pago" style={{ maxHeight: 130, borderRadius: 8 }} />}</div>}
      {err && <p style={{ color: '#b91c1c', background: '#fee2e2', padding: 10, borderRadius: 8 }}>⚠ {err}</p>}
      {cart.length > 0 && <div style={{ display: 'grid', gap: 4, fontSize: 14 }}>
        <div className="row"><span>Subtotal</span><span>{money(sub)}</span></div>
        <div className="row"><span>🛵 Delivery{dq ? ` (${dq.km.toFixed(1)} km)` : ''}</span><span>{dq ? money(dq.fee) : 'Con tu ubicación'}</span></div>
        {disc > 0 && <div className="row" style={{ color: '#15803d' }}><span>🏷 Código {codeApplied}</span><b>- {money(disc)}</b></div>}
        {dq && !dq.ok ? <small style={{ color: '#b91c1c' }}>⚠ Estás a {dq.km.toFixed(1)} km y el delivery llega hasta {dq.maxKm} km. Escríbenos por WhatsApp para coordinar tu pedido.</small>
          : <small style={{ color: '#777' }}>Delivery {money(dr.base)} hasta {dr.baseKm} km; luego + {money(dr.perKm)} por cada km adicional. Se calcula solo con tu ubicación.</small>}
      </div>}
      <div className="row"><b>Total</b><span className="price">{money(total)}</span></div>
      <label className={'terms-ck' + (!terms ? ' req' : '')}><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /><span>Acepto los <button type="button" onClick={e => { e.preventDefault(); setLegal('terminos') }}>Términos y Condiciones</button> y las <button type="button" onClick={e => { e.preventDefault(); setLegal('privacidad') }}>Políticas de Privacidad</button> de KOVA. *</span></label>
      <button className="btn" disabled={bad || busy} onClick={order}>{busy ? (f.mode === 'culqi' ? 'Preparando pago...' : 'Enviando...') : f.mode === 'culqi' ? 'Pagar ' + money(total) : 'Enviar pedido'}</button>
      <button type="button" className="wabtn" disabled={!cart.length || !gps || !terms} onClick={waOrder}><img src="/whatsapp.png" alt="" width="22" height="22" /> Hacer pedido por WhatsApp</button>
      <small style={{ color: '#777', textAlign: 'center' }}>Abre WhatsApp con tu lista de productos y tu ubicación para que nos escribas directamente.</small>
    </aside>}
    {ok && <div className="modal" onClick={() => setOk(null)}><div className="mbox" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#16a34a', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 34, margin: '0 auto' }}>✓</div>
      <h2 style={{ marginTop: 8 }}>{ok.pay?.kind === 'cip' ? 'Pedido registrado: falta tu pago' : ok.pay ? '¡Pago recibido! Gracias por tu compra' : 'Pedido realizado con éxito, muchas gracias por su preferencia'}</h2>
      {ok.pay?.kind === 'cip' && <div className="cq-cip"><small>Tu código de pago (CIP) de PagoEfectivo</small><b>{ok.pay.cip}</b><small>Págalo en tu banca móvil o internet, o en un agente/bodega{ok.pay.expires_at ? <> antes del <b>{new Date(ok.pay.expires_at).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}</b></> : null}. Tu pedido seguirá pendiente hasta que pagues y se actualizará solo.</small></div>}
      <p className="sub" style={{ margin: 0 }}>Tu número de pedido es <b>{ok.sale.order_number}</b>. {ok.pay?.kind === 'paid' ? 'Tu pago fue acreditado; la tienda confirmará tu pedido y te contactará.' : ok.pay ? 'Guárdalo para consultar el estado de tu pago y de tu pedido.' : 'Se descargó tu ticket en PDF; la tienda confirmará tu pedido y te contactará.'}</p>
      <button className="btn o" onClick={() => { const n = ok.sale.order_number; setOk(null); setTrk(n) }}>📦 Ver el estado de mi pedido</button><button className="btn o" onClick={() => ticketPDF(ok.sale, ok.ctx)}>⬇ Descargar ticket de nuevo</button><button className="btn" onClick={() => setOk(null)}>Seguir comprando</button></div></div>}
    {pop && <div className="pop-bg" role="dialog" aria-modal="true" aria-label="Anuncio" onClick={() => setPop('')}><div className="pop-box" onClick={e => e.stopPropagation()}>
      <button className="pop-x" aria-label="Cerrar anuncio" onClick={() => setPop('')}>✕</button>
      <button className="pop-img" aria-label="Ver promociones" onClick={() => { setPop(''); goCat('Promociones') }}><img src={pop} alt="Anuncio: toca para ver las promociones" /></button></div></div>}
    {cq && <CulqiPay s={cq} cfg={cfg} onClose={() => setCq(null)} onDone={onlineDone} />}
    {trk !== null && <OrderTrack initial={trk} wa={`https://wa.me/${PHONE}`} onClose={() => setTrk(null)} />}
    {pu && <div className="pushbar" role="dialog" aria-label="Notificaciones">
      <div style={{ fontSize: 26 }}>{pu === 'ok' || pu === 'copied' ? '✅' : '🔔'}</div>
      <div style={{ flex: 1 }}>{pu === 'ok' ? <b>¡Listo! Te avisaremos de nuestras ofertas.</b> : pu === 'copied' ? <b>Enlace copiado. Pégalo en Chrome o Safari.</b>
        : pu === 'fail' ? <><b>No pudimos activar los avisos</b><br /><small>{puErr}</small></>
        : pu === 'ios' ? <><b>Instala KOVA en tu iPhone para recibir ofertas</b><br /><small>Es gratis y toma 10 segundos.</small></>
        : pu === 'inapp' ? <><b>Abre KOVA en tu navegador</b><br /><small>Desde esta app no se pueden activar los avisos. Ábrelo en Chrome o Safari.</small></>
        : <><b>¿Te avisamos de ofertas y novedades?</b><br /><small>Recibe promociones de KOVA en tu celular o computadora. Puedes desactivarlo cuando quieras.</small></>}</div>
      {pu === 'ask' && <button className="btn" onClick={enablePu}>Activar</button>}{pu === 'fail' && <button className="btn" onClick={enablePu}>Reintentar</button>}{pu === 'ios' && <button className="btn" onClick={() => setGuide(true)}>Cómo hacerlo</button>}{pu === 'inapp' && <button className="btn" onClick={copyLink}>Copiar enlace</button>}{pu !== 'ok' && pu !== 'copied' && <button className="btn o" onClick={dismissPu}>Ahora no</button>}</div>}
    {guide && <div className="modal" onClick={() => setGuide(false)}><div className="mbox" onClick={e => e.stopPropagation()}><div className="row"><b>Instalar KOVA en tu iPhone</b><button className="btn o" onClick={() => setGuide(false)}>✕</button></div>
      <ol style={{ paddingLeft: 20, lineHeight: 1.7, margin: 0 }}><li>Abre esta página en <b>Safari</b>.</li><li>Toca el botón <b>Compartir</b> <span style={{ fontSize: 18 }}>⬆️</span> (barra inferior).</li><li>Elige <b>«Añadir a pantalla de inicio»</b> y toca <b>Añadir</b>.</li><li>Abre <b>KOVA desde tu pantalla de inicio</b> y toca <b>Activar</b> en el aviso.</li></ol>
      <small style={{ color: 'var(--mut)' }}>Requiere iOS 16.4 o superior. Apple solo permite notificaciones a las webs instaladas así.</small><button className="btn" onClick={() => { setGuide(false); dismissPu() }}>Entendido</button></div></div>}
    {claim && <ClaimModal onClose={() => setClaim(false)} onPrivacy={() => setLegal('privacidad')} onStatus={() => { setClaim(false); setClaimStatus(true) }} />}
    {claimStatus && <ClaimStatusModal onClose={() => setClaimStatus(false)} onNew={() => { setClaimStatus(false); setClaim(true) }} />}
    {legal && <LegalModal doc={legal} onClose={() => setLegal(null)} />}
    <a className="wa" href={`https://wa.me/${PHONE}?text=${encodeURIComponent(WA_MSG)}`} target="_blank" aria-label="WhatsApp"><img src="/whatsapp.png" alt="WhatsApp" /></a>
  </>)
}
