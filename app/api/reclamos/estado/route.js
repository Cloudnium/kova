import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const clean = (v, max) => String(v ?? '').trim().replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, max)

// El cliente consulta su reclamo con código + número de documento (solo ve estado y respuesta)
export async function POST(request) {
  try {
    const b = await request.json().catch(() => ({}))
    const code = clean(b.code, 40).toUpperCase(), doc = clean(b.doc, 30)
    if (!code || !doc) return NextResponse.json({ error: 'Escribe tu código y tu número de documento.' }, { status: 400 })
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return NextResponse.json({ error: 'La consulta de reclamos aún no está configurada.' }, { status: 500 })
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { data, error } = await db.rpc('claim_status', { p_code: code, p_doc: doc })
    if (error) {
      console.error('[reclamos/estado]', error.code, error.message)
      return NextResponse.json({ error: 'No pudimos consultar tu reclamo en este momento. Inténtalo de nuevo.' }, { status: 502 })
    }
    if (!data) return NextResponse.json({ error: 'No encontramos un reclamo con esos datos. Revisa el código y el documento.' }, { status: 404 })
    return NextResponse.json({ ok: true, claim: data })
  } catch (e) {
    console.error('[reclamos/estado] Error inesperado:', e)
    return NextResponse.json({ error: 'No se pudo consultar el reclamo. Inténtalo de nuevo.' }, { status: 500 })
  }
}
