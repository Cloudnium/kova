// Service worker: recibe las notificaciones push y abre la tienda al tocarlas
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch (err) { d = { title: 'KOVA', body: e.data ? e.data.text() : '' } }
  const title = d.title || 'KOVA', data = { url: d.url || '/' }
  // Opciones completas (Android: el badge debe ser una silueta monocroma con transparencia, por eso badge-96.png)
  const full = { body: d.body || '', icon: d.icon || '/icon-192.png', badge: '/badge-96.png', data, vibrate: [120, 60, 120], lang: 'es' }
  if (d.image) full.image = d.image
  if (d.tag) { full.tag = d.tag; full.renotify = true }
  // Si algún dispositivo (p. ej. ciertos Samsung / navegadores) rechaza alguna opción, se reintenta con lo mínimo:
  // un push siempre debe terminar mostrando una notificación o el navegador la descarta
  e.waitUntil(self.registration.showNotification(title, full).catch(() =>
    self.registration.showNotification(title, { body: d.body || '', icon: '/icon-192.png', data })))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href
  e.waitUntil((async () => {
    try {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of list) if (c.url.startsWith(self.location.origin) && 'focus' in c) {
        try { await c.navigate(url) } catch (err) {}
        return c.focus()
      }
    } catch (err) {}
    return self.clients.openWindow(url)
  })())
})
// Si el navegador renueva o invalida la suscripción, se vuelve a suscribir solo (el cliente no tiene que volver a entrar a la web)
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    try {
      const old = e.oldSubscription, key = old && old.options && old.options.applicationServerKey
      const sub = e.newSubscription || (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null)
      if (!sub) return
      const j = sub.toJSON()
      await fetch('/api/push/resubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old_endpoint: old ? old.endpoint : null, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }) })
    } catch (err) {}
  })())
})
