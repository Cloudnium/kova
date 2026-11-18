// Sonido de notificación de pedidos web. Usa el .mp3 que subas en Configuración; si no hay, suena un timbre incluido.
let ctx, last
export function chime(vol = 0.8) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume()
    ;[[880, 0], [1175, 0.16], [1480, 0.32]].forEach(([f, t]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), s = ctx.currentTime + t
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination)
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(Math.max(0.01, vol * 0.5), s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5)
      o.start(s); o.stop(s + 0.55)
    })
    return true
  } catch (e) { return false }
}
// Devuelve true si pudo sonar, false si el navegador lo bloqueó (hace falta un clic en la página)
export async function playNotify(url, vol = 0.8) {
  if (!url) return chime(vol)
  try {
    if (last) { last.pause() }
    last = new Audio(url); last.volume = Math.min(1, Math.max(0, vol)); await last.play(); return true
  } catch (e) { return e && e.name === 'NotAllowedError' ? false : chime(vol) }
}
