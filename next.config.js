// Compatible con Vercel (sin servidor propio, sin rutas fijas de disco)
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      // El service worker no debe quedar en caché para que las actualizaciones lleguen
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/manifest.json', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }] }
    ]
  }
}
