import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon')
export const money = n => 'S/ ' + Number(n || 0).toFixed(2)
export const CATS = ['AGUA', 'CERVEZA', 'DULCES', 'ENERGIZANTE', 'GASEOSA', 'JAGGER', 'JUGO', 'LICOR', 'RON', 'SNACK', 'TEQUILA', 'VINO', 'VODKA', 'WHISKY', 'CIGARRO', 'ENCENDEDOR', 'OTROS']
export const SUPA_OK = !!process.env.NEXT_PUBLIC_SUPABASE_URL
export const fmtDate = d => d ? new Date(d).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '-'
export const me = async () => (await supabase.auth.getSession()).data.session?.user
// Registra una acción en auditoría con la sede actual (si hay una sede elegida)
export const audit = async (action, detail = '', branch) => {
  const u = await me(); let b = branch
  if (b === undefined) { try { b = localStorage.getItem('sede-id') } catch (e) {} }
  await supabase.from('audit_log').insert({ user_email: u?.email, action, detail, branch_id: b && b !== 'all' ? b : null })
}
// Llama una función segura del servidor (RPC) y devuelve { data, error: 'mensaje legible' }
export const rpc = async (fn, args) => { const { data, error } = await supabase.rpc(fn, args); return { data, error: error ? error.message : '' } }
export const SEDE_KEY = 'sede-id'
export const getSede = () => { try { return localStorage.getItem(SEDE_KEY) } catch (e) { return null } }
export const setSede = id => { try { id ? localStorage.setItem(SEDE_KEY, id) : localStorage.removeItem(SEDE_KEY) } catch (e) {} }
export const initials = n => { const w = (n || '').trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w.map(x => x[0]).join('').slice(0, 3) : (w[0] || '?').slice(0, 3)).toUpperCase() }
export const settingsMap = rows => Object.fromEntries((rows || []).map(r => [r.key, r.value]))
