// Utilidades SOLO DE SERVIDOR para Culqi (nunca importar desde componentes 'use client').
// Variables de entorno: CULQI_SECRET_KEY (sk_test_… / sk_live_…), CULQI_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY.
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

export const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
export const configured = () => !!(process.env.CULQI_SECRET_KEY && process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY)
export const bad = (m, s = 400) => Response.json({ error: m }, { status: s })

// Llamada al API de Culqi (v2). Devuelve { status, data }; nunca lanza por errores HTTP de Culqi.
export async function culqi(method, path, body) {
  const r = await fetch('https://api.culqi.com/v2' + path, {
    method, cache: 'no-store', signal: AbortSignal.timeout(25000),
    headers: { Authorization: 'Bearer ' + process.env.CULQI_SECRET_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined })
  const data = await r.json().catch(() => null)
  return { status: r.status, data }
}

// Firma del pedido: la tienda se la entrega al navegador que creó el pedido; sin ella nadie más puede cobrar/cancelar ese pedido.
const hmac = s => crypto.createHmac('sha256', process.env.CULQI_SECRET_KEY || '').update(s).digest('hex')
export const sign = saleId => hmac('sale:' + saleId)
export const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y) }
export const verify = (saleId, tok) => safeEq(sign(saleId), tok)

// Datos del cliente en el formato que pide Culqi
export const splitName = n => { const w = String(n || '').trim().split(/\s+/).filter(Boolean); return { first: (w[0] || 'Cliente').slice(0, 50), last: (w.slice(1).join(' ') || w[0] || 'Cliente').slice(0, 50) } }
export const phoneE164 = p => { const d = String(p || '').replace(/\D/g, ''); if (d.length === 9) return '+51' + d; if (d.length === 11 && d.startsWith('51')) return '+' + d; return '+' + d }
export const cents = n => Math.round(+n * 100)
export const MIN_CENTS = 300, MAX_CENTS = 999900      // rango de Culqi3DS: S/ 3.00 a S/ 9,999.00

// Un cargo exitoso de Culqi: HTTP 201 y objeto «charge» (se acepta además que el motor indique venta exitosa)
export const chargeOk = (r, expect) => r.status === 201 && r.data?.object === 'charge' && r.data.id && (expect == null || +r.data.amount === expect)
  && (r.data.outcome?.type ? r.data.outcome.type === 'venta_exitosa' : r.data.response_code ? r.data.response_code === 'venta_exitosa' : true)
export const msgOf = d => (d && (d.user_message || d.merchant_message)) || 'No se pudo procesar el pago. Revisa los datos o prueba con otro medio de pago.'
