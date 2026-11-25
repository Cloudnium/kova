import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const clean = (v, max = 600) => String(v ?? '').trim().replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, max)

export async function POST(request) {
  try {
    const b = await request.json().catch(() => ({}))
    if (clean(b.website)) return NextResponse.json({ ok: true, code: 'LR-REGISTRADO' })

    const v = {
      date: clean(b.date, 30), name: clean(b.name, 120), docType: clean(b.docType, 30), docNumber: clean(b.docNumber, 30),
      nationality: clean(b.nationality, 60), address: clean(b.address, 220), phone: clean(b.phone, 30), email: clean(b.email, 120),
      product: clean(b.product, 160), order: clean(b.order, 60), amount: clean(b.amount, 30), kind: clean(b.kind, 40),
      detail: clean(b.detail, 3000), desire: clean(b.desire, 120), accept: b.accept === true
    }
    const missing = ['name', 'docNumber', 'phone', 'email', 'address', 'product', 'detail'].filter(k => !v[k])
    if (missing.length) return NextResponse.json({ error: 'Completa todos los campos obligatorios.' }, { status: 400 })
    if (v.amount && !(Number(v.amount) >= 0)) return NextResponse.json({ error: 'El monto reclamado no es válido.' }, { status: 400 })
    if (!/^\S+@\S+\.\S+$/.test(v.email)) return NextResponse.json({ error: 'El correo electrónico no es válido.' }, { status: 400 })
    if (!v.accept) return NextResponse.json({ error: 'Debes aceptar el tratamiento de tus datos personales.' }, { status: 400 })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      console.error('[reclamos] Faltan las claves de Supabase en el servidor')
      return NextResponse.json({ error: 'El libro de reclamaciones aún no está configurado.' }, { status: 500 })
    }

    // El código sale de los datos del reclamo: si el cliente reenvía lo mismo (doble clic, reintento por mala señal)
    // la base reconoce el mismo código y NO lo guarda dos veces; el cliente recibe el mismo código.
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).replace(/-/g, '')
    const hash = createHash('sha256').update(day + JSON.stringify(v)).digest('hex')
    const code = `LR-${day}-${hash.slice(0, 6).toUpperCase()}`

    const db = createClient(url, key, { auth: { persistSession: false } })
    const { error } = await db.rpc('create_claim', {
      p_code: code, p_date: /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : null, p_name: v.name, p_doc_type: v.docType, p_doc_number: v.docNumber,
      p_nationality: v.nationality, p_address: v.address, p_phone: v.phone, p_email: v.email, p_product: v.product, p_order: v.order,
      p_amount: v.amount ? Number(v.amount) : 0, p_kind: v.kind, p_detail: v.detail, p_desire: v.desire
    })
    if (error) {
      console.error('[reclamos] No se pudo guardar el reclamo:', error.code, error.message)
      // P0001 = mensajes propios de la base (validaciones / límite de envíos): son claros para el cliente
      if (error.code === 'P0001') return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ error: 'No pudimos registrar tu reclamo en este momento. Inténtalo de nuevo en unos minutos o escríbenos por WhatsApp.' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, code })
  } catch (e) {
    console.error('[reclamos] Error inesperado:', e)
    return NextResponse.json({ error: 'No se pudo registrar el reclamo. Inténtalo de nuevo.' }, { status: 500 })
  }
}
