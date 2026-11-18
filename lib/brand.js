// Aplica el color de marca (configurable) a toda la interfaz
const clamp = n => Math.max(0, Math.min(255, n))
export function applyBrand(hex) {
  if (typeof document === 'undefined' || !/^#[0-9a-f]{6}$/i.test(hex || '')) return
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255
  const d = [r, g, b].map(v => clamp(Math.round(v * 0.78)).toString(16).padStart(2, '0')).join('')
  const s = document.documentElement.style
  s.setProperty('--red', hex); s.setProperty('--red-d', '#' + d); s.setProperty('--red-soft', `rgba(${r},${g},${b},.1)`); s.setProperty('--red-glow', `rgba(${r},${g},${b},.3)`)
}
