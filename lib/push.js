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
export const swReady = async () => {
  await navigator.serviceWorker.register('/sw.js')
  return Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('El navegador no pudo activar el servicio de notificaciones. Cierra y vuelve a abrir el navegador e inténtalo de nuevo.')), 15000))])
}
// Permiso compatible con navegadores antiguos (algunos Samsung Internet usan callback en vez de promesa)
const askPermission = () => new Promise(res => { try { const r = Notification.requestPermission(res); if (r && r.then) r.then(res) } catch (e) { res(Notification.permission) } })
// ¿La suscripción guardada fue creada con la clave VAPID actual? (si se cambió la clave, ese dispositivo nunca recibiría nada)
const sameKey = sub => { try { const k = sub.options && sub.options.applicationServerKey; if (!k) return true; const a = new Uint8Array(k), b = b64(PUBLIC_KEY); return a.length === b.length && a.every((v, i) => v === b[i]) } catch (e) { return true } }
// Devuelve la suscripción del navegador (la crea pidiendo permiso si hace falta)
export async function getSubscription(create = true) {
  const reg = await swReady(); let sub = await reg.pushManager.getSubscription()
  if (sub && PUBLIC_KEY && !sameKey(sub)) { try { await sub.unsubscribe() } catch (e) {} sub = null }
  if (!sub && create) {
    if (!PUBLIC_KEY) throw new Error('Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en el servidor')
    if ((await askPermission()) !== 'granted') throw new Error('denied')
    const go = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(PUBLIC_KEY) })
    try { sub = await go() }
    catch (e0) {
      // algunos Android (Samsung, etc.) fallan la primera vez: se limpia cualquier resto y se reintenta una vez
      let e = e0
      if (!/applicationServerKey|InvalidAccessError|NotAllowed/i.test(String(e0 && (e0.name + e0.message)))) {
        try { const old = await reg.pushManager.getSubscription(); if (old) await old.unsubscribe(); await new Promise(r => setTimeout(r, 1200)); sub = await go(); e = null } catch (e1) { e = e1 }
      }
      if (e) {
        const brave = !!(navigator.brave && navigator.brave.isBrave), m = String(e && e.message || e), samsung = /SamsungBrowser/i.test(navigator.userAgent)
        if (/push service error|AbortError/i.test(m + (e && e.name))) throw new Error(brave
          ? 'Brave tiene desactivadas las notificaciones push. Abre brave://settings/privacy, activa «Usar servicios de Google para mensajería push», reinicia Brave e inténtalo de nuevo (o prueba con Chrome, Edge o Firefox).'
          : samsung ? 'Samsung Internet no pudo conectarse al servicio de notificaciones. Revisa tu conexión, desactiva el ahorro de datos/VPN y reinicia el navegador; si sigue igual, ábrelo con Google Chrome.'
          : 'El navegador no pudo conectarse al servicio de notificaciones. Revisa tu conexión, desactiva VPN/bloqueadores e inténtalo de nuevo, o prueba con otro navegador.')
        if (/applicationServerKey|InvalidAccessError/i.test(m)) throw new Error('La clave NEXT_PUBLIC_VAPID_PUBLIC_KEY no es válida. Genera un par nuevo con npx web-push generate-vapid-keys y haz Redeploy.')
        throw e
      }
    }
  }
  return sub
}
export const subJSON = s => { let k = {}; try { k = s.toJSON().keys || {} } catch (e) {} return { endpoint: s.endpoint, p256dh: k.p256dh || ab(s.getKey('p256dh')), auth: k.auth || ab(s.getKey('auth')) } }
// Cliente de la tienda: pide permiso y guarda la suscripción
export async function subscribeCustomer(branchId) {
  const sub = await getSubscription(true), j = subJSON(sub)
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.p256dh, p_auth: j.auth, p_branch: branchId || null, p_ua: navigator.userAgent })
  if (error) throw new Error(error.message)
  return true
}
// Registra el service worker en cuanto carga la tienda (así queda instalado y puede recibir avisos con la web cerrada)
export const registerSW = () => { if (typeof window !== 'undefined' && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}) }
