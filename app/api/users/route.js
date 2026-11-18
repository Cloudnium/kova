import { createClient } from '@supabase/supabase-js'
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function guard(req) {
  const a = admin(), t = (req.headers.get('authorization') || '').replace('Bearer ', ''), { data } = await a.auth.getUser(t)
  if (!data?.user) return null
  const { data: p } = await a.from('profiles').select('role,active').eq('id', data.user.id).single()
  return p?.role === 'administrador' && p?.active !== false ? a : null
}
const no = () => Response.json({ error: 'No autorizado o falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 403 })
const ROLES = ['administrador', 'trabajador']
const ids = v => Array.isArray(v) ? v.filter(x => /^[0-9a-f-]{36}$/i.test(x)) : []
export async function POST(req) {
  const a = await guard(req); if (!a) return no()
  const { email, password, name, role, branch_ids } = await req.json()
  if (!ROLES.includes(role)) return Response.json({ error: 'Rol no válido' }, { status: 400 })
  const { data, error } = await a.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) return Response.json({ error: error.message }, { status: 400 })
  const r = await a.from('profiles').insert({ id: data.user.id, email, name, role, branch_ids: ids(branch_ids) })
  if (r.error) return Response.json({ error: r.error.message }, { status: 400 })
  return Response.json({ ok: true })
}
export async function PATCH(req) {
  const a = await guard(req); if (!a) return no()
  const b = await req.json(), patch = {}
  if (typeof b.active === 'boolean') { await a.auth.admin.updateUserById(b.id, { ban_duration: b.active ? 'none' : '876000h' }); patch.active = b.active }
  if (b.role !== undefined) { if (!ROLES.includes(b.role)) return Response.json({ error: 'Rol no válido' }, { status: 400 }); patch.role = b.role }
  if (b.name !== undefined) patch.name = b.name
  if (b.branch_ids !== undefined) patch.branch_ids = ids(b.branch_ids)
  const r = await a.from('profiles').update(patch).eq('id', b.id)
  if (r.error) return Response.json({ error: r.error.message }, { status: 400 })
  return Response.json({ ok: true })
}
