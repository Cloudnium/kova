'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { pushEnv, pushSupported, PUBLIC_KEY, getSubscription, subJSON } from './push'
// «Estado de pedido» de la tienda: el cliente escribe su número (PW001-123, sin necesidad de los ceros) y ve en qué paso va.
// Usa la función pública track_web_order (schema_v15_estado_pedido.sql): solo devuelve estado y fechas, nunca datos del cliente.
const KEY = 'kova-last-order', LIST = 'kova-orders'
export const lastOrder = () => { try { return localStorage.getItem(KEY) || '' } catch (e) { return '' } }
// Guarda el pedido como «último» y en la lista de pedidos recientes de este dispositivo (máx. 8)
export const rememberOrder = n => { try { if (!n) return; localStorage.setItem(KEY, n); const l = [n, ...recentOrders().filter(x => x !== n)].slice(0, 8); localStorage.setItem(LIST, JSON.stringify(l)) } catch (e) {} }
export const recentOrders = () => { try { const l = JSON.parse(localStorage.getItem(LIST) || '[]'); return Array.isArray(l) ? l.filter(x => typeof x === 'string').slice(0, 8) : [] } catch (e) { return [] } }
const PAYM = { tarjeta: 'Tarjeta', yape: 'Yape', pagoefectivo: 'PagoEfectivo' }
const STEPS = [
  ['recibido', 'Pedido recibido', 'La tienda recibió tu pedido y lo está revisando.', 'created_at'],
  ['aceptado', 'Pedido aceptado', 'Tu pedido fue confirmado y lo estamos preparando.', 'confirmed_at'],
  ['en_camino', 'En camino', 'Tu pedido ya salió y va hacia ti.', 'on_the_way_at'],
  ['entregado', 'Entregado', '¡Gracias por tu compra! Que lo disfrutes.', 'delivered_at']]
const FINAL = ['entregado', 'cancelado']
const nkey = n => 'kova-notify-' + n
const wasOn = n => { try { return localStorage.getItem(nkey(n)) === '1' } catch (e) { return false } }
const fmt = d => d ? new Date(d).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : ''
export function OrderTrack({ initial = '', wa, onClose }) {
  const [code, setCode] = useState(initial), [res, setRes] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), cur = useRef('')
  const [recent, setRecent] = useState([]), [nt, setNt] = useState(''), [ntBusy, setNtBusy] = useState(false), [ntErr, setNtErr] = useState('')     // avisos push de este pedido: '' | 'on'
  const look = async (c, silent) => {
    const v = String(c ?? code).trim()
    if (!v) return setErr('Escribe tu número de pedido, por ejemplo PW001-123')
    if (!silent) { setBusy(true); setErr('') }
    cur.current = v
    const { data, error } = await supabase.rpc('track_web_order', { p_code: v })
    if (cur.current !== v) return                       // llegó tarde: el cliente ya buscó otro número
    if (!silent) setBusy(false)
    if (error) { if (!silent) { setRes(null); setErr(/número de pedido/i.test(error.message) ? error.message : 'No pudimos consultar tu pedido ahora. Inténtalo en un momento o escríbenos por WhatsApp.') } return }
    if (!data || !data.found) { if (!silent) setRes({ found: false }); return }
    setRes(data); rememberOrder(data.order_number); setNt(wasOn(data.order_number) ? 'on' : '')
  }
  // Activa los avisos push de ESTE pedido en este dispositivo (celular, PC, tablet...). El cliente ve el aviso aunque tenga cerrada la web.
  const enableNotify = async (silent) => {
    if (!res || !res.found) return
    if (!silent) { setNtBusy(true); setNtErr('') }
    try {
      const sub = await getSubscription(!silent), j = sub && subJSON(sub)
      if (!sub) return
      const { data, error } = await supabase.rpc('subscribe_order_push', { p_code: res.order_number, p_endpoint: j.endpoint, p_p256dh: j.p256dh, p_auth: j.auth, p_ua: navigator.userAgent })
      if (error) throw new Error(error.message)
      if (!data) throw new Error('No encontramos tu pedido.')
      try { localStorage.setItem(nkey(res.order_number), '1') } catch (e) {}
      setNt('on')
    } catch (e) { if (!silent) setNtErr(e.message === 'denied' ? 'Bloqueaste las notificaciones. Actívalas con el candado de la barra de direcciones y vuelve a intentarlo.' : (e.message || 'No se pudo activar el aviso.')) }
    if (!silent) setNtBusy(false)
  }
  // si el cliente ya aceptó notificaciones antes, se activan solas para este pedido (sin volver a preguntar)
  useEffect(() => {
    if (res && res.found && !FINAL.includes(res.stage) && !wasOn(res.order_number) && pushSupported() && PUBLIC_KEY && Notification.permission === 'granted') enableNotify(true)
  }, [res && res.order_number])
  useEffect(() => { setRecent(recentOrders()); if (initial) look(initial) }, [])      // si ya hizo un pedido, se muestra de una vez
  // se actualiza solo cada 30 s mientras el pedido siga en curso
  useEffect(() => {
    if (!res || !res.found || FINAL.includes(res.stage)) return
    const t = setInterval(() => look(res.order_number, true), 30000); return () => clearInterval(t)
  }, [res])
  useEffect(() => { const f = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f) }, [])
  const env = pushEnv(), live = res && res.found && !FINAL.includes(res.stage)
  // mensaje listo para WhatsApp con el número de pedido (el del resultado, o el que escribió el cliente)
  const ref = res && res.found ? res.order_number : code.trim().toUpperCase()
  const waHref = wa && (ref ? `${wa}?text=${encodeURIComponent(`Hola KOVA, quisiera consultar sobre mi pedido N° ${ref}.`)}` : wa)
  const idx = res && res.found ? STEPS.findIndex(s => s[0] === res.stage) : -1
  return (<div className="modal" onClick={onClose}><div className="mbox trk" role="dialog" aria-label="Estado de pedido" onClick={e => e.stopPropagation()}>
    <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ fontSize: 18 }}>Estado de tu pedido</b><button className="btn o" aria-label="Cerrar" onClick={onClose}>✕</button></div>
    <form className="trk-f" onSubmit={e => { e.preventDefault(); look() }}>
      <input value={code} onChange={e => setCode(e.target.value)} placeholder="Ej: PW001-123" aria-label="Número de pedido" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={30} autoFocus={!initial} />
      <button className="btn" disabled={busy}>{busy ? 'Buscando…' : 'Consultar'}</button></form>
    <small className="trk-h">Escribe el número que aparece en tu ticket. No hace falta poner todos los ceros: <b>PW001-123</b> es lo mismo que PW001-0000123.</small>
    {recent.length > 1 && <div className="trk-r"><small>Tus pedidos en este dispositivo:</small><div>{recent.map(n => <button key={n} type="button" className={'chip' + (res && res.found && res.order_number === n ? ' on' : '')} onClick={() => { setCode(n); look(n) }}>{n}</button>)}</div></div>}
    {err && <p className="trk-e" role="alert">{err}</p>}
    {res && !res.found && <p className="trk-e" role="alert">No encontramos ese pedido. Revisa el número en tu ticket (empieza con PW) o escríbenos por WhatsApp.</p>}
    {res && res.found && res.stage === 'cancelado' && <div className="trk-x"><b>Tu pedido {res.order_number} no pudo ser atendido</b>{res.reason && <p>Motivo: {res.reason}</p>}<p>Escríbenos y te ayudamos a resolverlo.</p></div>}
    {res && res.found && res.pay && res.stage !== 'cancelado' && <div className={'trk-pay ' + res.pay.status}>
      {res.pay.status === 'pagado' ? <><b>✅ Pago confirmado</b><small>{PAYM[res.pay.method] || 'Pago en línea'} · S/ {Number(res.pay.total).toFixed(2)}{res.pay.paid_at ? ' · ' + fmt(res.pay.paid_at) : ''}</small></>
        : res.pay.cip ? <><b>⏳ Falta tu pago con PagoEfectivo</b><small>Código CIP: <strong>{res.pay.cip}</strong> · S/ {Number(res.pay.total).toFixed(2)}{res.pay.expires_at ? ' · vence ' + fmt(res.pay.expires_at) : ''}. Págalo en tu banca móvil o internet, o en un agente/bodega; esta pantalla se actualiza sola.</small></>
        : res.pay.status === 'vencido' ? <><b>⌛ Tu código de pago venció</b><small>Haz un nuevo pedido o escríbenos por WhatsApp.</small></>
        : res.pay.status === 'fallido' ? <><b>⚠ El pago no se completó</b><small>No se te cobró. Puedes intentar de nuevo desde la tienda.</small></>
        : <><b>⏳ Esperando tu pago en línea</b><small>Cuando se acredite, la tienda empezará a preparar tu pedido.</small></>}</div>}
    {res && res.found && res.stage !== 'cancelado' && <div>
      <p className="trk-n">Pedido <b>{res.order_number}</b>{res.branch ? <> · {res.branch}</> : null}</p>
      <ol className="trk-l">{STEPS.map((s, i) => <li key={s[0]} className={i < idx || res.stage === 'entregado' ? 'done' : i === idx ? 'now' : ''}>
        <span className="dot">{i < idx || res.stage === 'entregado' ? '✓' : i === idx ? '●' : i + 1}</span><div><b>{s[1]}</b>{i === idx && <small>{i === 0 && res.pay && res.pay.status !== 'pagado' ? 'La tienda empezará a revisar tu pedido cuando se acredite tu pago.' : s[2]}</small>}{i <= idx && res[s[3]] && <em>{fmt(res[s[3]])}</em>}</div></li>)}</ol>
      {res.stage !== 'entregado' && <small className="trk-h">Se actualiza solo. También puedes volver a consultar cuando quieras.</small>}
    </div>}
    {live && PUBLIC_KEY && (nt === 'on' ? <p className="trk-ok">🔔 Listo: te avisaremos en este dispositivo cuando tu pedido cambie de estado.</p>
      : env === 'ok' ? <button type="button" className="btn o" disabled={ntBusy} onClick={() => enableNotify(false)}>{ntBusy ? 'Activando…' : '🔔 Avisarme cuando cambie el estado'}</button>
      : env === 'ios' ? <small className="trk-h">🔔 Para recibir avisos en iPhone/iPad, instala KOVA: abre esta web en Safari → Compartir → «Añadir a pantalla de inicio», y actívalos desde ahí.</small>
      : env === 'inapp' ? <small className="trk-h">🔔 Para recibir avisos, abre esta página en Chrome o Safari (no desde dentro de Instagram, Facebook o TikTok).</small> : null)}
    {ntErr && <p className="trk-e" role="alert">{ntErr}</p>}
    {waHref && <a className="btn o" href={waHref} target="_blank" rel="noopener" style={{ textAlign: 'center' }}>💬 Consultar por WhatsApp</a>}
  </div></div>)
}
