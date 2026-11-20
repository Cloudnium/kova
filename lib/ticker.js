// Franja negra con texto que pasa de derecha a izquierda (tienda y vista previa en Anuncios)
export const SPEEDS = { lenta: 70, normal: 45, rapida: 28 }   // píxeles por segundo aproximados
export function Ticker({ text, speed }) {
  const msgs = String(text || '').split(/\n+/).map(t => t.trim()).filter(Boolean)
  if (!msgs.length) return null
  const line = msgs.join('   ✦   ') + '   ✦   '
  // duración proporcional al largo del texto para que la velocidad se sienta igual con frases cortas o largas
  const sec = Math.max(14, Math.round(line.length * 9 / (SPEEDS[speed] || SPEEDS.normal) * 3.2))
  return <div className="ticker" role="marquee" aria-label={msgs.join('. ')}>
    <div className="ticker-track" style={{ animationDuration: sec + 's' }} aria-hidden="true">
      {[0, 1].map(k => <div className="ticker-grp" key={k}>{Array.from({ length: Math.max(2, Math.ceil(1600 / (line.length * 9))) }, (_, i) => <span key={i}>{line}</span>)}</div>)}
    </div>
    <span className="ticker-static">{msgs.join('  ✦  ')}</span>
  </div>
}
