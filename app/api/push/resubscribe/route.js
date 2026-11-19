import { createClient } from '@supabase/supabase-js'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Lo llama el service worker del cliente cuando el navegador renueva su suscripción (evento pushsubscriptionchange)
const ok = (v, a, b) => typeof v === 'string' && v.length >= a && v.length <= b
export async function POST(req) {
  const b = await req.json().catch(() => ({}))
  if (!/^https:\/\//.test(b.endpoint || '') || b.endpoint.length > 1000 || !ok(b.p256dh, 40, 200) || !ok(b.auth, 10, 100)) return Response.json({ error: 'Suscripción no válida' }, { status: 400 })
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  let branch = null
  if (ok(b.old_endpoint, 10, 1000)) { const { data } = await db.from('push_subscriptions').select('branch_id').eq('endpoint', b.old_endpoint).maybeSingle(); branch = data?.branch_id || null }
  const { error } = await db.from('push_subscriptions').upsert({ endpoint: b.endpoint, p256dh: b.p256dh, auth: b.auth, branch_id: branch, last_seen: new Date().toISOString() }, { onConflict: 'endpoint' })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (ok(b.old_endpoint, 10, 1000) && b.old_endpoint !== b.endpoint) await db.from('push_subscriptions').delete().eq('endpoint', b.old_endpoint)
  return Response.json({ ok: true })
}
