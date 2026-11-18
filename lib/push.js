'use client'
import { supabase } from './supabase'
// Ayudas de notificaciones push en el navegador del cliente
export const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))) }
const ab = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
export const swReady = async () => { await navigator.serviceWorker.register('/sw.js'); return navigator.serviceWorker.ready }
// Devuelve la suscripción del navegador (la crea pidiendo permiso si hace falta)
export async function getSubscription(create = true) {
  const reg = await swReady(); let sub = await reg.pushManager.getSubscription()
  if (!sub && create) {
    if (!PUBLIC_KEY) throw new Error('Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en el servidor')
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied')
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(PUBLIC_KEY) })
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
