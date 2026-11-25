import { NextResponse } from 'next/server'
import { createHash } from 'crypto'

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

    const apiKey = clean(process.env.RESEND_API_KEY, 200)
    const toRaw = process.env.RECLAMOS_TO_EMAIL || (process.env.VAPID_SUBJECT || '').replace(/^mailto:/, '')
    const to = String(toRaw).split(/[,;\s]+/).map(x => clean(x, 120)).filter(x => /^\S+@\S+\.\S+$/.test(x))
    if (!apiKey || !to.length) {
      console.error('[reclamos] Falta configurar RESEND_API_KEY y/o RECLAMOS_TO_EMAIL')
      return NextResponse.json({ error: 'El correo de reclamos aún no está configurado.' }, { status: 500 })
    }
    const from = clean(process.env.RESEND_FROM, 200) || 'KOVA <onboarding@resend.dev>'

    // El código sale de los datos del reclamo: si el cliente reenvía lo mismo (doble clic, reintento por mala señal)
    // Resend reconoce la misma Idempotency-Key y NO manda el correo dos veces, y el cliente recibe el mismo código.
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).replace(/-/g, '')
    const hash = createHash('sha256').update(day + JSON.stringify(v)).digest('hex')
    const code = `LR-${day}-${hash.slice(0, 6).toUpperCase()}`
    const when = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })
    const text = [
      'NUEVO RECLAMO - LIBRO DE RECLAMACIONES KOVA',
      `Código: ${code}`,
      `Fecha de registro: ${when}`,
      `Fecha indicada por el consumidor: ${v.date || 'No indicada'}`,
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

    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000)
    let res, data
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `reclamo-${hash.slice(0, 48)}` },
        body: JSON.stringify({ from, to, reply_to: v.email, subject: `${v.kind || 'Reclamo'} ${code} - ${v.name}`, text }),
        signal: ctl.signal
      })
      data = await res.json().catch(() => ({}))
    } catch (e) {
      console.error('[reclamos] No se pudo contactar a Resend:', e?.name === 'AbortError' ? 'tiempo de espera agotado' : e?.message)
      return NextResponse.json({ error: 'No pudimos enviar tu reclamo en este momento. Inténtalo de nuevo en unos minutos o escríbenos por WhatsApp.' }, { status: 502 })
    } finally { clearTimeout(timer) }

    if (!res.ok) {
      // El detalle técnico (clave inválida, dominio sin verificar, etc.) va al log del servidor; al cliente, un mensaje claro.
      console.error('[reclamos] Resend respondió', res.status, JSON.stringify(data))
      const body = { error: 'No pudimos enviar tu reclamo en este momento. Inténtalo de nuevo en unos minutos o escríbenos por WhatsApp.' }
      if (process.env.NODE_ENV !== 'production') body.debug = data
      return NextResponse.json(body, { status: 502 })
    }

    return NextResponse.json({ ok: true, code })
  } catch (e) {
    console.error('[reclamos] Error inesperado:', e)
    return NextResponse.json({ error: 'No se pudo registrar el reclamo. Inténtalo de nuevo.' }, { status: 500 })
  }
}
