// Promociones: misma regla que usa la base de datos (hora de Lima). El precio final siempre lo recalcula el servidor.
export const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
export function limaNow(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(d), g = t => f.find(x => x.type === t)?.value
  return { date: `${g('year')}-${g('month')}-${g('day')}`, dow: DOW[g('weekday')] }
}
export function promoLive(pr, now = limaNow()) {
  if (!pr || pr.active === false) return false
  if (pr.start_date && now.date < pr.start_date) return false
  if (pr.end_date && now.date > pr.end_date) return false
  const days = pr.days || []; return !days.length || days.includes(now.dow)
}
const calc = (pr, price) => pr.disc_type === 'percent' ? Math.round(price * (1 - Math.min(+pr.value, 100) / 100) * 100) / 100 : +pr.value
// { price, promo } con la mejor promoción vigente (o el precio normal)
export function promoPrice(p, promos, now = limaNow()) {
  let best = +p.price, hit = null
  for (const pr of promos || []) if ((pr.product_ids || []).includes(p.id) && promoLive(pr, now)) { const v = calc(pr, +p.price); if (v < best) { best = v; hit = pr } }
  return { price: best, promo: hit }
}
// Texto legible de la vigencia: "Lun, Mar · hasta 30/11"
export function promoWhen(pr) {
  const f = s => s ? s.split('-').reverse().slice(0, 2).join('/') : '', days = (pr.days || []).length && pr.days.length < 7 ? [...pr.days].sort().map(d => DAYS[d]).join(', ') : 'Todos los días'
  const r = pr.start_date && pr.end_date ? `${f(pr.start_date)} al ${f(pr.end_date)}` : pr.end_date ? `hasta ${f(pr.end_date)}` : pr.start_date ? `desde ${f(pr.start_date)}` : 'sin fecha límite'
  return `${days} · ${r}`
}
