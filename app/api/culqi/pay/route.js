import { admin, bad, configured, culqi, verify, splitName, phoneE164, cents, chargeOk, msgOf } from '../../../../lib/culqiserver'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

// Paso 2 del pago en línea. El navegador solo envía el TOKEN de Culqi (nunca datos de tarjeta). El monto, el correo y el pedido
// salen de la base de datos, así que nadie puede pagar menos ni marcar un pedido como pagado desde el navegador.
//   action = 'charge'  → cobra con tarjeta (tkn_…) o Yape (ype_…); si el banco pide 3DS responde { status: '3ds' }
//   action = 'cip'     → el cliente generó su código de PagoEfectivo: se guarda y el pedido queda pendiente de pago
//   action = 'abandon' → el cliente cerró el pago sin completarlo
const TOKEN = /^(tkn|ype)_(test|live)_[A-Za-z0-9]{6,40}$/
const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : undefined)

export async function POST(req) {
  if (!configured()) return bad('El pago en línea no está disponible por ahora.', 503)
  const b = await req.json().catch(() => ({})), id = String(b.sale_id || '')
  if (!/^[0-9a-f-]{36}$/i.test(id) || !verify(id, b.auth)) return bad('Pedido no válido', 403)
  const db = admin()
  const { data: s } = await db.from('sales').select('*').eq('id', id).eq('source', 'web').eq('pay_mode', 'culqi').maybeSingle()
  if (!s) return bad('Pedido no encontrado', 404)

  if (b.action === 'abandon') { await db.rpc('culqi_abandon', { p_sale: id }); return Response.json({ ok: true }) }
  if (s.pay_status === 'pagado') return Response.json({ status: 'paid', pay_status: 'pagado' })
  if (s.status !== 'pendiente') return bad('Este pedido ya no está disponible para pagar.', 409)
  const amount = cents(s.total)

  // ---------- PagoEfectivo ----------
  if (b.action === 'cip') {
    if (!s.culqi_order_id) return bad('Pedido sin orden de pago', 409)
    const o = await culqi('GET', '/orders/' + encodeURIComponent(s.culqi_order_id))
    if (o.status !== 200 || !o.data) return bad('No pudimos confirmar tu código de pago. Revisa el estado de tu pedido en unos minutos.', 502)
    if (o.data.state === 'paid') { await db.rpc('culqi_mark', { p_sale: id, p_status: 'pagado', p_method: 'pagoefectivo', p_cip: o.data.payment_code || null }); return Response.json({ status: 'paid' }) }
    const cip = String(o.data.payment_code || (/^\d{6,20}$/.test(String(b.cip || '')) ? b.cip : '') || '')
    if (!cip) return bad('Aún no se generó tu código de pago. Inténtalo de nuevo.', 409)
    const exp = o.data.expiration_date ? new Date(+o.data.expiration_date).toISOString() : s.pay_expires_at
    await db.rpc('culqi_mark', { p_sale: id, p_status: 'pendiente', p_method: 'pagoefectivo', p_cip: cip, p_expires: exp })
    return Response.json({ status: 'cip', cip, expires_at: exp })
  }

  // ---------- Tarjeta / Yape ----------
  if (b.action !== 'charge') return bad('Acción no válida')
  const token = String(b.token || '')
  if (!TOKEN.test(token)) return bad('Token de pago no válido')
  const yape = token.startsWith('ype_')
  if (!(await db.rpc('culqi_begin', { p_sale: id })).data) return bad('Este pago ya está en proceso o ya no está disponible. Espera unos segundos y revisa el estado de tu pedido.', 409)

  const { first, last } = splitName(s.customer_name), tds = b.tds && typeof b.tds === 'object' ? b.tds : null
  const body = {
    amount, currency_code: 'PEN', email: s.customer_email, source_id: token, description: ('Pedido ' + s.order_number).slice(0, 80),
    metadata: { sale_id: s.id, order_number: s.order_number },
    antifraud_details: { first_name: first, last_name: last, country_code: 'PE', phone_number: phoneE164(s.phone).replace(/\D/g, '').slice(-15), ...(str(b.device, 100) ? { device_finger_print_id: str(b.device, 100) } : {}) } }
  if (!yape && tds) body.authentication_3DS = { eci: str(tds.eci, 10), xid: str(tds.xid), cavv: str(tds.cavv), protocolVersion: str(tds.protocolVersion, 20), directoryServerTransactionId: str(tds.directoryServerTransactionId) }

  let r
  try { r = await culqi('POST', '/charges', body) } catch (e) {
    // Sin respuesta de Culqi: no sabemos si se cobró. Se deja «procesando» (se libera solo en 2 min) y el aviso de Culqi (webhook) lo resolverá.
    console.error('Culqi: sin respuesta al cobrar', s.order_number, e?.message)
    return bad('No pudimos confirmar tu pago. Si te llegó el cobro, tu pedido se actualizará solo en unos minutos; no vuelvas a pagar.', 504)
  }

  if (chargeOk(r, amount)) {
    await db.rpc('culqi_mark', { p_sale: id, p_status: 'pagado', p_method: yape ? 'yape' : 'tarjeta', p_charge: r.data.id })
    if (s.culqi_order_id) culqi('DELETE', '/orders/' + encodeURIComponent(s.culqi_order_id)).catch(() => {})   // limpieza: la orden de Culqi ya no hace falta
    return Response.json({ status: 'paid', method: yape ? 'yape' : 'tarjeta' })
  }
  if (r.status === 200 && !yape && !tds) {                       // el banco pide autenticación 3D Secure
    await db.rpc('culqi_mark', { p_sale: id, p_status: 'pendiente' })
    return Response.json({ status: '3ds' })
  }
  console.error('Culqi: cargo rechazado', s.order_number, r.status, JSON.stringify(r.data)?.slice(0, 400))
  await db.rpc('culqi_mark', { p_sale: id, p_status: 'fallido' })
  return Response.json({ status: 'failed', error: msgOf(r.data) }, { status: 402 })
}
