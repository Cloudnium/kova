export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Lo usa la página /diagnostico. No muestra valores, solo si las variables existen en el servidor.
export async function GET() {
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']
  const vars = Object.fromEntries(names.map(n => [n, !!process.env[n]]))   // solo si existen, nunca los valores
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return Response.json({ entorno: process.env.VERCEL_ENV || 'local', variables: vars, subjectValido: /^(mailto:[^\s@:]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test((process.env.VAPID_SUBJECT || '').trim()), urlValida: /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) })
}
