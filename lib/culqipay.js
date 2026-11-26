'use client'
import { useEffect, useRef, useState } from 'react'
import { money } from './supabase'

// Pago en línea con Culqi (Custom Checkout + Culqi3DS), incrustado dentro de la tienda y con los colores de tu marca.
// Tarjeta y Yape: el formulario de Culqi genera un TOKEN (los datos de la tarjeta viajan directo a Culqi, nunca pasan por tu servidor)
// y /api/culqi/pay hace el cobro. PagoEfectivo: el formulario genera el CIP y el pedido queda pendiente hasta que el cliente pague.
const PK = process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY
const MODAL = process.env.NEXT_PUBLIC_CULQI_MODAL === '1'      // por defecto el formulario va INCRUSTADO; con 1 usa la ventana flotante de Culqi

const loaded = {}
const loadScript = (src, ready) => loaded[src] || (loaded[src] = new Promise((res, rej) => {
  if (ready()) return res()
  const el = document.createElement('script'); el.src = src; el.async = true
  el.onload = () => ready() ? res() : rej(new Error('Culqi no respondió'))
  el.onerror = () => { delete loaded[src]; rej(new Error('No se pudo cargar el formulario de pago. Revisa tu conexión.')) }
  document.head.appendChild(el)
}))

export function CulqiPay({ s, cfg, onClose, onDone }) {
  const [st, setSt] = useState('loading'), [msg, setMsg] = useState('')
  const inst = useRef(null), working = useRef(false), last = useRef(''), mountRef = useRef(null), tdsOff = useRef(null)

  const api = async body => {
    const r = await fetch('/api/culqi/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sale_id: s.sale_id, auth: s.auth, ...body }) })
    return r.json().catch(() => ({ error: 'Respuesta no válida del servidor' }))
  }
  const brand = () => getComputedStyle(document.documentElement).getPropertyValue('--red').trim() || '#d7202b'
  const closeInst = () => { try { inst.current && inst.current.close && inst.current.close() } catch (e) {} }

  // Espera el resultado de la autenticación 3D Secure del banco
  const wait3ds = tok => new Promise(resolve => {
    const f = ev => {
      if (ev.origin !== window.location.origin) return
      const d = ev.data || {}
      if (d.parameters3DS) { off(); resolve({ p: d.parameters3DS }) } else if (d.error) { off(); resolve({ error: String(d.error) }) }
    }
    const off = () => { window.removeEventListener('message', f); tdsOff.current = null }
    window.addEventListener('message', f); tdsOff.current = off
    window.Culqi3DS.initAuthentication(tok)
  })

  const fail = m => { working.current = false; setMsg(m); setSt('loading'); setTimeout(() => mountRef.current && mountRef.current(), 50) }

  const payToken = async tok => {
    setMsg(''); setSt('working')
    const card = tok.startsWith('tkn_')
    let device = null
    try {
      if (card) {
        const T = window.Culqi3DS
        try { T.reset && T.reset() } catch (e) {}
        T.publicKey = PK
        T.settings = { charge: { totalAmount: s.amount, returnUrl: window.location.href, currency: 'PEN' }, card: { email: s.email } }
        T.options = { showModal: true, showLoading: true, showIcon: true, style: { btnColor: brand(), btnTextColor: '#FFFFFF' } }
        device = await T.generateDevice()
      }
      let r = await api({ action: 'charge', token: tok, device })
      if (r.status === '3ds') {
        const a = await wait3ds(tok)
        if (a.error) return fail('No se pudo autenticar la tarjeta con tu banco. Prueba de nuevo o usa otro medio de pago.')
        r = await api({ action: 'charge', token: tok, device, tds: a.p })
      }
      if (r.status === 'paid') { working.current = false; return onDone({ kind: 'paid', method: r.method }) }
      fail(r.error || 'No se pudo procesar el pago. Intenta de nuevo.')
    } catch (e) { fail('No se pudo completar el pago. Revisa tu conexión e inténtalo de nuevo.') }
  }

  const handle = async c => {
    if (working.current) return
    if (c.token && c.token.id) {
      if (last.current === c.token.id) return
      last.current = c.token.id; working.current = true; closeInst(); return payToken(c.token.id)
    }
    if (c.order) {
      working.current = true; closeInst(); setMsg(''); setSt('working')
      const r = await api({ action: 'cip', cip: c.order.paymentCode || c.order.payment_code || '' })
      if (r.status === 'cip') { working.current = false; return onDone({ kind: 'cip', cip: r.cip, expires_at: r.expires_at }) }
      if (r.status === 'paid') { working.current = false; return onDone({ kind: 'paid', method: 'pagoefectivo' }) }
      return fail(r.error || 'No se pudo generar tu código de pago. Intenta de nuevo.')
    }
    if (c.error) setMsg(c.error.user_message || c.error.merchant_message || 'No se pudo procesar. Revisa los datos e inténtalo de nuevo.')
  }

  // Culqi3DS inserta su propio aviso («No se pudo procesar el pago») en el <body>; si queda pegado a un lado, lo centramos y lo subimos por encima de todo
  useEffect(() => {
    const center = el => {
      if (!el || el.nodeType !== 1 || el.closest('.cq') || el.classList.contains('modal') || el.id === '__next') return
      const t = el.textContent || ''; if (!/Aceptar/.test(t) || !/pago|autentic|tarjeta/i.test(t) || t.length > 600) return
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect(), full = r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9
        el.style.setProperty('position', 'fixed', 'important'); el.style.setProperty('z-index', '2147483000', 'important')
        if (full) { el.style.setProperty('inset', '0', 'important'); el.style.setProperty('display', 'flex', 'important'); el.style.setProperty('align-items', 'center', 'important'); el.style.setProperty('justify-content', 'center', 'important') }
        else { ['top', 'left'].forEach(k => el.style.setProperty(k, '50%', 'important')); ['right', 'bottom'].forEach(k => el.style.setProperty(k, 'auto', 'important')); el.style.setProperty('transform', 'translate(-50%,-50%)', 'important'); el.style.setProperty('margin', '0', 'important'); el.style.setProperty('max-width', '92vw', 'important'); el.style.setProperty('box-shadow', '0 10px 40px #0006', 'important') }
      })
    }
    const mo = new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(center)))
    mo.observe(document.body, { childList: true })
    return () => mo.disconnect()
  }, [])

  useEffect(() => {
    let dead = false
    const mount = () => {
      if (dead) return
      const C = window.CulqiCheckout, red = brand(), font = getComputedStyle(document.body).fontFamily
      const logo = /^https?:/.test(cfg.logo_url || '') ? cfg.logo_url : window.location.origin + (cfg.logo_url || '/logo.png')
      const methods = { tarjeta: true, yape: true, bancaMovil: true, agente: true, billetera: false, cuotealo: false }   // Tarjeta · Yape · PagoEfectivo (banca móvil + agentes)
      const ctl = new C(PK, {
        settings: { title: cfg.business_name || 'KOVA', currency: 'PEN', amount: s.amount, order: s.culqi_order },
        client: { email: s.email, firstName: s.first, lastName: s.last },
        options: { lang: 'es', installments: false, modal: MODAL, container: '#culqi-container', paymentMethods: methods, paymentMethodsSort: Object.keys(methods) },
        appearance: {
          theme: 'default', hiddenBanner: true, hiddenCulqiLogo: false, hiddenToolBarAmount: false, menuType: 'sliderTop', logo, buttonCardPayText: 'Pagar',
          variables: { fontFamily: font, fontWeightNormal: '500', borderRadius: '10px', colorBackground: '#ffffff', colorPrimary: red, colorPrimaryText: '#ffffff', colorText: '#1a1514', colorTextSecondary: '#6b6361', colorTextPlaceholder: '#a39b98', colorIconTab: '#6b6361', colorLogo: 'dark' },
          rules: {
            '.Culqi-Main-Container': { background: '#ffffff', fontFamily: 'var(--fontFamily)' },
            '.Culqi-Main-Method': { background: '#ffffff' },
            '.Culqi-Label': { color: '#1a1514', fontWeight: '600' },
            '.Culqi-Input': { border: '1px solid #e8e2e0', borderRadius: '8px' },
            '.Culqi-Input:focus': { border: '1.5px solid ' + red },
            '.Culqi-Button': { background: red, color: '#ffffff', borderRadius: '10px', fontWeight: '700' },
            '.Culqi-Menu-Item.active': { color: red },
            '.Culqi-Menu-Item.active .Culqi-Icon': { color: red },
            '.Culqi-Menu-Item.active .Culqi-Bar': { background: red },
            '.Culqi-Text-Link': { color: red }
          } } })
      ctl.culqi = () => handle(ctl)
      inst.current = ctl; last.current = ''; ctl.open(); setSt('ready')
    }
    mountRef.current = mount
    ;(async () => {
      try {
        if (!PK) throw new Error('Falta configurar NEXT_PUBLIC_CULQI_PUBLIC_KEY.')
        await Promise.all([loadScript('https://js.culqi.com/checkout-js', () => !!window.CulqiCheckout), loadScript('https://3ds.culqi.com', () => !!window.Culqi3DS)])
        if (!dead) { window.Culqi3DS.publicKey = PK; mount() }
      } catch (e) { if (!dead) { setSt('error'); setMsg(e.message || 'No se pudo cargar el pago.') } }
    })()
    return () => { dead = true; mountRef.current = null; closeInst(); tdsOff.current && tdsOff.current() }
  }, [])

  // Cerrar sin pagar cancela este pedido (si ya generó su CIP de PagoEfectivo, el pedido se conserva)
  const close = () => { if (working.current) return; fetch('/api/culqi/pay', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sale_id: s.sale_id, auth: s.auth, action: 'abandon' }) }).catch(() => {}); onClose() }

  return (<div className="modal"><div className="mbox cq" role="dialog" aria-modal="true" aria-label="Pago en línea">
    <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ fontSize: 18 }}>Pagar tu pedido</b><button className="btn o" aria-label="Cerrar" disabled={st === 'working'} onClick={close}>✕</button></div>
    <div className="cq-sum"><span>Pedido <b>{s.order_number}</b></span><span className="price">{money(s.amount / 100)}</span></div>
    {st === 'loading' && <p className="cq-st">Cargando el formulario de pago seguro…</p>}
    {st === 'working' && <p className="cq-st"><span className="cq-spin" /> Procesando tu pago… no cierres esta ventana.</p>}
    {msg && <p className="trk-e" role="alert">⚠ {msg}</p>}
    {st === 'error' && <button className="btn o" onClick={close}>Volver al carrito</button>}
    <div id="culqi-container" className="cq-box" style={st === 'working' || st === 'error' ? { display: 'none' } : undefined} />
    <small className="cq-sec">🔒 Pago seguro con Culqi. Los datos de tu tarjeta van directo a Culqi, no pasan por nuestra tienda. Si cierras esta ventana sin pagar, el pedido se cancela.</small>
  </div></div>)
}
