'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
// «Estado de pedido» de la tienda: el cliente escribe su número (PW001-123, sin necesidad de los ceros) y ve en qué paso va.
// Usa la función pública track_web_order (schema_v15_estado_pedido.sql): solo devuelve estado y fechas, nunca datos del cliente.
const KEY = 'kova-last-order'
export const lastOrder = () => { try { return localStorage.getItem(KEY) || '' } catch (e) { return '' } }
export const rememberOrder = n => { try { n && localStorage.setItem(KEY, n) } catch (e) {} }
const STEPS = [
  ['recibido', 'Pedido recibido', 'La tienda recibió tu pedido y lo está revisando.', 'created_at'],
  ['aceptado', 'Pedido aceptado', 'Tu pedido fue confirmado y lo estamos preparando.', 'confirmed_at'],
  ['en_camino', 'En camino', 'Tu pedido ya salió y va hacia ti.', 'on_the_way_at'],
  ['entregado', 'Entregado', '¡Gracias por tu compra! Que lo disfrutes.', 'delivered_at']]
const fmt = d => d ? new Date(d).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : ''
export function OrderTrack({ initial = '', wa, onClose }) {
  const [code, setCode] = useState(initial), [res, setRes] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), cur = useRef('')
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
    setRes(data); rememberOrder(data.order_number)
  }
  useEffect(() => { if (initial) look(initial) }, [])      // si ya hizo un pedido, se muestra de una vez
  // se actualiza solo cada 30 s mientras el pedido siga en curso
  useEffect(() => {
    if (!res || !res.found || ['entregado', 'cancelado'].includes(res.stage)) return
    const t = setInterval(() => look(res.order_number, true), 30000); return () => clearInterval(t)
  }, [res])
  useEffect(() => { const f = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f) }, [])
  const idx = res && res.found ? STEPS.findIndex(s => s[0] === res.stage) : -1
  return (<div className="modal" onClick={onClose}><div className="mbox trk" role="dialog" aria-label="Estado de pedido" onClick={e => e.stopPropagation()}>
    <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ fontSize: 18 }}>Estado de tu pedido</b><button className="btn o" aria-label="Cerrar" onClick={onClose}>✕</button></div>
    <form className="trk-f" onSubmit={e => { e.preventDefault(); look() }}>
      <input value={code} onChange={e => setCode(e.target.value)} placeholder="Ej: PW001-123" aria-label="Número de pedido" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={30} autoFocus={!initial} />
      <button className="btn" disabled={busy}>{busy ? 'Buscando…' : 'Consultar'}</button></form>
    <small className="trk-h">Escribe el número que aparece en tu ticket. No hace falta poner todos los ceros: <b>PW001-123</b> es lo mismo que PW001-0000123.</small>
    {err && <p className="trk-e" role="alert">{err}</p>}
    {res && !res.found && <p className="trk-e" role="alert">No encontramos ese pedido. Revisa el número en tu ticket (empieza con PW) o escríbenos por WhatsApp.</p>}
    {res && res.found && res.stage === 'cancelado' && <div className="trk-x"><b>Tu pedido {res.order_number} no pudo ser atendido</b>{res.reason && <p>Motivo: {res.reason}</p>}<p>Escríbenos y te ayudamos a resolverlo.</p></div>}
    {res && res.found && res.stage !== 'cancelado' && <div>
      <p className="trk-n">Pedido <b>{res.order_number}</b>{res.branch ? <> · {res.branch}</> : null}</p>
      <ol className="trk-l">{STEPS.map((s, i) => <li key={s[0]} className={i < idx || res.stage === 'entregado' ? 'done' : i === idx ? 'now' : ''}>
        <span className="dot">{i < idx || res.stage === 'entregado' ? '✓' : i === idx ? '●' : i + 1}</span><div><b>{s[1]}</b>{i === idx && <small>{s[2]}</small>}{i <= idx && res[s[3]] && <em>{fmt(res[s[3]])}</em>}</div></li>)}</ol>
      {res.stage !== 'entregado' && <small className="trk-h">Se actualiza solo. También puedes volver a consultar cuando quieras.</small>}
    </div>}
    {wa && <a className="btn o" href={wa} target="_blank" rel="noopener" style={{ textAlign: 'center' }}>💬 Consultar por WhatsApp</a>}
  </div></div>)
}
