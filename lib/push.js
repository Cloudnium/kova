'use client'
import { supabase } from './supabase'
// Ayudas de notificaciones push en el navegador del cliente
export const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))) }
const ab = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
// Navegadores dentro de apps (Instagram, Facebook, TikTok...) no permiten notificaciones ni instalar la web
export const inApp = () => /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Snapchat|Line\/|MicroMessenger|Twitter|GSA\/|; wv\)/i.test(navigator.userAgent)
// 'ok' = puede activar ya · 'ios' = en iPhone/iPad debe instalar la web primero · 'inapp' = abrir en el navegador · 'unsupported' = no compatible
export function pushEnv() {
  if (typeof window === 'undefined') return 'unsupported'
  if (inApp()) return 'inapp'
  if (pushSupported()) return 'ok'
  if (isIOS() && !isStandalone()) return 'ios'
  return 'unsupported'
}
export const swReady = async () => { await navigator.serviceWorker.register('/sw.js'); return navigator.serviceWorker.ready }
// Devuelve la suscripción del navegador (la crea pidiendo permiso si hace falta)
export async function getSubscription(create = true) {
  const reg = await swReady(); let sub = await reg.pushManager.getSubscription()
  if (!sub && create) {
    if (!PUBLIC_KEY) throw new Error('Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en el servidor')
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied')
    try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(PUBLIC_KEY) }) }
    catch (e) {
      const brave = !!(navigator.brave && navigator.brave.isBrave), m = String(e && e.message || e)
      if (/push service error/i.test(m)) throw new Error(brave
        ? 'Brave tiene desactivadas las notificaciones push. Abre brave://settings/privacy, activa «Usar servicios de Google para mensajería push», reinicia Brave e inténtalo de nuevo (o prueba con Chrome, Edge o Firefox).'
        : 'El navegador no pudo conectarse al servicio de notificaciones. Revisa tu conexión, desactiva VPN/bloqueadores e inténtalo de nuevo, o prueba con otro navegador.')
      if (/applicationServerKey|InvalidAccessError/i.test(m)) throw new Error('La clave NEXT_PUBLIC_VAPID_PUBLIC_KEY no es válida. Genera un par nuevo con npx web-push generate-vapid-keys y haz Redeploy.')
      throw e
    }
  }
  return sub
}
export const subJSON = s => ({ endpoint: s.endpoint, p256dh: ab(s.getKey('p256dh')), auth: ab(s.getKey('auth')) })
// Cliente de la tienda: pide permiso y guarda la suscripción
export async function subscribeCustomer(branchId) {
  const sub = await getSubscription(true), j = subJSON(sub)
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.p256dh, p_auth: j.auth, p_branch: branchId || null, p_ua: navigator.userAgent })
  if (error) throw new Error(error.message)
  return true
}
// Registra el service worker en cuanto carga la tienda (así queda instalado y puede recibir avisos con la web cerrada)
export const registerSW = () => { if (typeof window !== 'undefined' && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}) }
