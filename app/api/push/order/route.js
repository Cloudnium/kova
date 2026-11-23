import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const bad = (m, s = 400) => Response.json({ error: m }, { status: s })
// Mensajes según el paso en el que quedó el pedido. El paso se lee de la base de datos (no del navegador),
// así nadie puede enviar textos inventados: solo se avisa del estado real del pedido.
const MSG = {
  aceptado: ['✅ Pedido aceptado', 'Tu pedido {n} fue confirmado y lo estamos preparando.'],
  en_camino: ['🛵 Tu pedido va en camino', 'Tu pedido {n} ya salió y va hacia ti.'],
  entregado: ['🎉 Pedido entregado', '¡Gracias por tu compra! Que disfrutes tu pedido {n}.'],
  cancelado: ['Tu pedido no pudo ser atendido', 'Tu pedido {n} fue cancelado. Escríbenos por WhatsApp y te ayudamos.']
}
const stageOf = s => s.status === 'anulado' ? 'cancelado' : s.status === 'pendiente' ? 'recibido' : s.delivery_status === 'entregado' ? 'entregado' : s.delivery_status === 'en_camino' ? 'en_camino' : 'aceptado'
// Lo llama el panel «Pedidos web» justo después de cambiar el estado de un pedido
export async function POST(req) {
  const a = db(), t = (req.headers.get('authorization') || '').replace('Bearer ', ''), { data: u } = await a.auth.getUser(t)
  if (!u?.user) return bad('No autorizado', 403)
  const { data: p } = await a.from('profiles').select('active').eq('id', u.user.id).single()
  if (!p || p.active === false) return bad('No autorizado', 403)
  const b = await req.json().catch(() => ({})), id = String(b.sale_id || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad('Pedido no válido')
  const { data: s } = await a.from('sales').select('id,order_number,status,delivery_status,reject_reason,source').eq('id', id).maybeSingle()
  if (!s || s.source !== 'web') return bad('Pedido no encontrado', 404)
  const stage = stageOf(s), m = MSG[stage]
  if (!m) return Response.json({ sent: 0, subs: 0, stage })
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY, subject = (process.env.VAPID_SUBJECT || '').trim()
  if (!pub || !priv) return bad('Faltan las claves VAPID en las variables de entorno.', 500)
  if (!/^(mailto:[^\s@:]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) return bad('VAPID_SUBJECT no es válido (mailto:tucorreo@dominio.com).', 500)
  const { data: subs, error } = await a.from('order_push').select('id,endpoint,p256dh,auth').eq('sale_id', id)
  if (error) return bad(error.message + ' · ¿Ejecutaste schema_v17_gps_y_avisos.sql?', 500)
  if (!subs.length) return Response.json({ sent: 0, subs: 0, stage })
  webpush.setVapidDetails(subject, pub, priv)
  const origin = new URL(req.url).origin
  let body = m[1].replace('{n}', s.order_number)
  if (stage === 'cancelado' && s.reject_reason) body = `Tu pedido ${s.order_number} no pudo ser atendido. Motivo: ${s.reject_reason}`.slice(0, 200)
  const payload = JSON.stringify({ title: m[0], body, url: '/?pedido=' + encodeURIComponent(s.order_number), icon: origin + '/icon-192.png', tag: 'pedido-' + s.order_number })
  const r = await Promise.allSettled(subs.map(x => webpush.sendNotification({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, payload, { TTL: 86400, urgency: 'high' })))
  const dead = []; let sent = 0
  r.forEach((x, i) => { if (x.status === 'fulfilled') sent++; else if ([404, 410].includes(x.reason?.statusCode)) dead.push(subs[i].id) })
  if (dead.length) await a.from('order_push').delete().in('id', dead)
  // pedido terminado (entregado o cancelado): ya no hay más avisos que enviar, se liberan los dispositivos
  if (stage === 'entregado' || stage === 'cancelado') await a.from('order_push').delete().eq('sale_id', id)
  return Response.json({ sent, subs: subs.length, stage })
}
