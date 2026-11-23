'use client'
import { supabase } from './supabase'
// Avisa al cliente (notificación push) del estado actual de su pedido. No bloquea ni falla el panel si algo sale mal.
// Devuelve un texto corto para mostrar al personal, o '' si el cliente no activó avisos.
export async function notifyOrder(saleId) {
  try {
    const { data } = await supabase.auth.getSession()
    const r = await fetch('/api/push/order', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify({ sale_id: saleId }) }).then(x => x.json())
    if (r.error) return '⚠ No se pudo avisar al cliente: ' + r.error
    return r.sent > 0 ? `🔔 Aviso enviado al cliente (${r.sent} dispositivo${r.sent > 1 ? 's' : ''})` : ''
  } catch (e) { return '' }
}
