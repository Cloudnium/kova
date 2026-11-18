import { createClient } from '@supabase/supabase-js'
export async function POST(req) {
  const t = (req.headers.get('authorization') || '').replace('Bearer ', '')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), { data } = await sb.auth.getUser(t)
  if (!data?.user) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return Response.json({ answer: 'La IA no está activada. Usa los atajos de arriba, o pide al administrador agregar ANTHROPIC_API_KEY en las variables de entorno del servidor.' })
  const { question, data: d, sede } = await req.json()
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 700, system: 'Eres el asistente de un negocio de licores/minimarket con varias sedes en Perú. Responde en español, breve y práctico, usando SOLO los datos JSON entregados (montos en soles). Si falta un dato, dilo.', messages: [{ role: 'user', content: `Sede: ${sede}\nDatos: ${JSON.stringify(d).slice(0, 12000)}\n\nPregunta: ${String(question).slice(0, 500)}` }] }) })
    const j = await r.json(); return Response.json({ answer: j.content?.[0]?.text || j.error?.message || 'Sin respuesta.' })
  } catch (e) { return Response.json({ error: 'No se pudo consultar la IA.' }, { status: 500 }) }
}
