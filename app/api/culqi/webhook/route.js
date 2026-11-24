import { admin, culqi, safeEq, cents, chargeOk } from '../../../../lib/culqiserver'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Aviso (webhook) de Culqi. URL para registrar en CulqiPanel > Eventos > Webhooks:
//   https://TU-DOMINIO/api/culqi/webhook?k=EL_VALOR_DE_CULQI_WEBHOOK_SECRET
// Nunca se confía en el contenido del aviso: solo se usa para saber QUÉ consultar; el estado real se lee del API de Culqi
// con la llave secreta. Así nadie puede falsificar un pago enviando un POST a esta URL.
const parse = d => { if (typeof d === 'string') { try { return JSON.parse(d) } catch (e) { return null } } return d && typeof d === 'object' ? d : null }

async function syncOrder(db, orderId) {
  if (!/^ord_(test|live)_[A-Za-z0-9]+$/.test(orderId)) return null
  const { data: s } = await db.from('sales').select('id,pay_cip,pay_status').eq('culqi_order_id', orderId).maybeSingle()
  if (!s) return null                                              // orden de otro sistema: se ignora
  const o = await culqi('GET', '/orders/' + orderId)
  if (o.status !== 200 || !o.data) throw new Error('No se pudo consultar la orden ' + orderId)
  const st = String(o.data.state || '')
  if (st === 'paid') await db.rpc('culqi_mark', { p_sale: s.id, p_status: 'pagado', p_method: 'pagoefectivo', p_cip: o.data.payment_code || null })
  else if (st === 'expired' || st === 'deleted') { if (s.pay_status !== 'pagado' && s.pay_status !== 'procesando') await db.rpc('culqi_mark', { p_sale: s.id, p_status: 'vencido' }) }
  return s.id
}

// Red de seguridad: si el cargo se hizo pero el navegador del cliente se cerró antes de recibir la respuesta
async function syncCharge(db, chargeId) {
  if (!/^chr_(test|live)_[A-Za-z0-9]+$/.test(chargeId)) return null
  const c = await culqi('GET', '/charges/' + chargeId)
  if (c.status !== 200 || !c.data) throw new Error('No se pudo consultar el cargo ' + chargeId)
  const sid = c.data.metadata?.sale_id
  if (!/^[0-9a-f-]{36}$/i.test(String(sid || ''))) return null
  const { data: s } = await db.from('sales').select('id,total,pay_status').eq('id', sid).eq('pay_mode', 'culqi').maybeSingle()
  if (!s) return null
  if (s.pay_status !== 'pagado' && chargeOk({ status: 201, data: c.data }, cents(s.total))) {
    const yape = String(c.data.source?.id || '').startsWith('ype_') || c.data.source?.type === 'yape'
    await db.rpc('culqi_mark', { p_sale: s.id, p_status: 'pagado', p_method: yape ? 'yape' : 'tarjeta', p_charge: c.data.id })
  }
  return s.id
}

export async function POST(req) {
  const secret = process.env.CULQI_WEBHOOK_SECRET
  if (!secret || !safeEq(new URL(req.url).searchParams.get('k'), secret)) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const ev = await req.json().catch(() => null)
  if (!ev || typeof ev !== 'object') return Response.json({ error: 'Cuerpo no válido' }, { status: 400 })
  const type = String(ev.type || ''), d = parse(ev.data), db = admin()
  try {
    let saleId = null
    if (d?.id && type.startsWith('order.')) saleId = await syncOrder(db, String(d.id))
    else if (d?.id && type.startsWith('charge.')) saleId = await syncCharge(db, String(d.id))
    if (ev.id) await db.from('culqi_events').upsert({ id: String(ev.id).slice(0, 80), type: type.slice(0, 80), sale_id: saleId, payload: { type, id: d?.id || null } })
    return Response.json({ ok: true })
  } catch (e) {
    console.error('Webhook Culqi:', type, e?.message)
    return Response.json({ error: 'Error al procesar' }, { status: 500 })     // Culqi reintentará
  }
}

// Para probar en el navegador que la ruta existe (no revela nada)
export const GET = () => Response.json({ ok: true, service: 'culqi-webhook' })
