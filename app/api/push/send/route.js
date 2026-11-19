import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
// Solo administradores activos pueden enviar anuncios
async function guard(req) {
  const a = db(), t = (req.headers.get('authorization') || '').replace('Bearer ', ''), { data } = await a.auth.getUser(t)
  if (!data?.user) return null
  const { data: p } = await a.from('profiles').select('role,active,email').eq('id', data.user.id).single()
  return p?.role === 'administrador' && p?.active !== false ? { a, email: p.email } : null
}
const bad = (m, s = 400) => Response.json({ error: m }, { status: s })
export async function POST(req) {
  const g = await guard(req); if (!g) return bad('No autorizado o falta SUPABASE_SERVICE_ROLE_KEY', 403)
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return bad('Faltan las claves VAPID (NEXT_PUBLIC_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY) en las variables de entorno.', 500)
  const b = await req.json(), title = String(b.title || '').trim(), body = String(b.body || '').trim()
  if (!title || title.length > 65) return bad('El título es obligatorio (máx. 65 caracteres).')
  if (!body || body.length > 240) return bad('El mensaje es obligatorio (máx. 240 caracteres).')
  const url = String(b.url || '/').trim() || '/'
  if (!/^(\/[^\s]*|https:\/\/[^\s]+)$/.test(url)) return bad('El enlace debe empezar con / o https://')
  const image = b.image ? String(b.image) : null
  if (image && !/^https:\/\//.test(image)) return bad('La imagen debe ser una URL https.')
  const subject = (process.env.VAPID_SUBJECT || '').trim()
  if (!/^(mailto:[^\s@:]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) return bad('VAPID_SUBJECT no es válido. Debe ser mailto:tucorreo@dominio.com (con un correo real) o https://tudominio.com. Chrome lo tolera, pero Apple (iPhone/Safari) rechaza los envíos si está mal.', 500)
  webpush.setVapidDetails(subject, pub, priv)
  const origin = new URL(req.url).origin, payload = JSON.stringify({ title, body, url, image, icon: origin + '/icon-192.png' }), opt = { TTL: 259200, urgency: 'high' }

  // Prueba: solo al dispositivo del administrador, sin tocar la base
  if (b.test) {
    try { await webpush.sendNotification({ endpoint: b.test.endpoint, keys: { p256dh: b.test.p256dh, auth: b.test.auth } }, payload, opt); return Response.json({ sent: 1, failed: 0, removed: 0, test: true }) }
    catch (e) { return bad('No se pudo enviar la prueba: ' + (e.body || e.message)) }
  }
  let subs = [], from = 0
  for (;;) {
    let q = g.a.from('push_subscriptions').select('id,endpoint,p256dh,auth').order('created_at').range(from, from + 999)
    if (b.branch_id) q = q.eq('branch_id', b.branch_id)
    const { data, error } = await q; if (error) return bad(error.message, 500)
    subs = subs.concat(data); if (data.length < 1000) break; from += 1000
  }
  let sent = 0, failed = 0; const dead = [], why = {}
  for (let i = 0; i < subs.length; i += 40) {
    const r = await Promise.allSettled(subs.slice(i, i + 40).map(s => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, opt)))
    r.forEach((x, k) => { if (x.status === 'fulfilled') sent++; else { failed++; const m = `${x.reason?.statusCode || ''} ${String(x.reason?.body || x.reason?.message || '').slice(0, 90)}`.trim(); why[m] = (why[m] || 0) + 1; if ([404, 410].includes(x.reason?.statusCode)) dead.push(subs[i + k].id) } })
  }
  // suscripciones caducadas o desinstaladas se limpian solas
  if (dead.length) await g.a.from('push_subscriptions').delete().in('id', dead)
  await g.a.from('push_announcements').insert({ title, body, url, image, branch_id: b.branch_id || null, sent, failed, removed: dead.length, created_by: g.email })
  await g.a.from('audit_log').insert({ user_email: g.email, action: 'Anuncio enviado', detail: `${title} · ${sent} enviados`, branch_id: b.branch_id || null })
  return Response.json({ sent, failed, removed: dead.length, motivos: Object.entries(why).slice(0, 3).map(([m, n]) => `${n}× ${m}`) })
}
