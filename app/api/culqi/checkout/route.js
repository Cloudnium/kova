import { admin, bad, configured, culqi, sign, splitName, phoneE164, cents, MIN_CENTS, MAX_CENTS } from '../../../../lib/culqiserver'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Paso 1 del pago en línea: registra el pedido en Supabase (precios, promos y stock los valida el servidor, no el navegador)
// y crea la orden en Culqi (necesaria para PagoEfectivo). Devuelve lo que el formulario de pago necesita.
export async function POST(req) {
  if (!configured()) return bad('El pago en línea no está disponible por ahora. Elige otra forma de pago.', 503)
  const b = await req.json().catch(() => ({}))
  const email = String(b.email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return bad('Escribe un correo válido')
  if (!Array.isArray(b.items) || !b.items.length) return bad('Tu carrito está vacío')
  const db = admin()
  const { data: sale, error } = await db.rpc('create_culqi_order', {
    p_branch: b.branch, p_name: String(b.name || ''), p_phone: String(b.phone || ''), p_email: email, p_notes: b.notes ? String(b.notes) : null,
    p_items: b.items.map(i => ({ id: i.id, qty: i.qty })), p_lat: b.lat, p_lng: b.lng, p_acc: b.acc ?? null, p_code: b.code ? String(b.code).slice(0, 40) : null })
  if (error) return bad(/function .*does not exist|create_culqi_order/i.test(error.message) ? 'Falta ejecutar schema_v22_codigos_descuento.sql en Supabase.' : error.message)

  const drop = () => db.rpc('culqi_abandon', { p_sale: sale.id })
  const amount = cents(sale.total)
  if (amount < MIN_CENTS || amount > MAX_CENTS) { await drop(); return bad('El pago en línea acepta compras desde S/ 3.00 hasta S/ 9,999.00.') }

  // Orden en Culqi: habilita PagoEfectivo. confirm:false → el checkout la confirma cuando el cliente elige su medio de pago.
  const { first, last } = splitName(sale.customer_name)
  const hours = Math.min(Math.max(+process.env.CULQI_ORDER_EXPIRY_HOURS || 24, 1), 168)
  const expSec = Math.floor(Date.now() / 1000) + hours * 3600
  const o = await culqi('POST', '/orders', {
    amount, currency_code: 'PEN', description: ('Pedido ' + sale.order_number).slice(0, 80), order_number: sale.order_number, confirm: false,
    client_details: { first_name: first, last_name: last, email, phone_number: phoneE164(sale.phone) }, expiration_date: expSec,
    metadata: { sale_id: sale.id, order_number: sale.order_number } })
  if (o.status >= 300 || !o.data?.id) {
    console.error('Culqi: no se pudo crear la orden', o.status, JSON.stringify(o.data))
    await drop(); return bad('No pudimos iniciar el pago en línea. Inténtalo de nuevo o elige otra forma de pago.', 502)
  }
  await db.rpc('culqi_attach_order', { p_sale: sale.id, p_order: o.data.id, p_expires: new Date(expSec * 1000).toISOString() })
  return Response.json({ sale, sale_id: sale.id, order_number: sale.order_number, amount, culqi_order: o.data.id, email, first, last, auth: sign(sale.id) })
}
