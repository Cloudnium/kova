import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

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
    if (!/^\S+@\S+\.\S+$/.test(v.email)) return NextResponse.json({ error: 'El correo electrónico no es válido.' }, { status: 400 })
    if (!v.accept) return NextResponse.json({ error: 'Debes aceptar el tratamiento de tus datos personales.' }, { status: 400 })

    const apiKey = process.env.RESEND_API_KEY
    const to = clean(process.env.RECLAMOS_TO_EMAIL || (process.env.VAPID_SUBJECT || '').replace(/^mailto:/, ''), 120)
    if (!apiKey || !to) return NextResponse.json({ error: 'El correo de reclamos aún no está configurado.' }, { status: 500 })

    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).replace(/-/g, '')
    const code = `LR-${day}-${randomUUID().slice(0, 6).toUpperCase()}`
    const when = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })
    const text = [
      'NUEVO RECLAMO - LIBRO DE RECLAMACIONES KOVA',
      `Código: ${code}`,
      `Fecha de registro: ${when}`,
      '',
      'CONSUMIDOR',
      `Nombre: ${v.name}`,
      `Documento: ${v.docType} ${v.docNumber}`,
      `Nacionalidad: ${v.nationality || 'No indicada'}`,
      `Domicilio: ${v.address}`,
      `Teléfono: ${v.phone}`,
      `Correo: ${v.email}`,
      '',
      'RECLAMO',
      `Tipo: ${v.kind || 'Reclamo'}`,
      `Producto o servicio: ${v.product}`,
      `Número de pedido: ${v.order || 'No indicado'}`,
      `Monto reclamado: S/ ${v.amount || '0.00'}`,
      `Deseo: ${v.desire || 'No indicado'}`,
      `Descripción: ${v.detail}`,
      '',
      'El consumidor aceptó el tratamiento de sus datos personales conforme a la Política de Privacidad.'
    ].join('\n')

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'KOVA <onboarding@resend.dev>',
        to: [to],
        reply_to: v.email,
        subject: `${v.kind || 'Reclamo'} ${code} - ${v.name}`,
        text
      })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ error: data.message || 'Resend no pudo enviar el correo. Inténtalo de nuevo.' }, { status: 502 })

    return NextResponse.json({ ok: true, code })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo registrar el reclamo. Inténtalo de nuevo.' }, { status: 500 })
  }
}
