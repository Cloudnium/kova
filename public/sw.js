// Service worker: recibe las notificaciones push y abre la tienda al tocarlas
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch (err) { d = { title: 'KOVA', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'KOVA', {
    body: d.body || '', icon: d.icon || '/icon-192.png', badge: '/icon-192.png', image: d.image || undefined,
    data: { url: d.url || '/' }, tag: d.tag || undefined, renotify: !!d.tag, vibrate: [120, 60, 120]
  }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.location.origin) && 'focus' in c) { c.navigate(url); return c.focus() }
    return self.clients.openWindow(url)
  }))
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
