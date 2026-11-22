'use client'
// Reporte de caja: modelo común + ticket térmico (80/58 mm) + PDF A4
import { TICKET_CSS, getPrintCfg, logoOf } from './tickets'
const m = n => 'S/ ' + Number(n || 0).toFixed(2)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const T = { timeZone: 'America/Lima' }
export const fD = d => d ? new Date(d).toLocaleDateString('es-PE', { ...T, day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'
export const fT = d => d ? new Date(d).toLocaleTimeString('es-PE', { ...T, hour: '2-digit', minute: '2-digit' }) : '-'
export const fDT = d => d ? fD(d) + ' ' + fT(d) : '-'
const METHODS = ['Efectivo', 'Yape', 'Tarjeta', 'Transferencia']

// sales = ventas completadas de esa caja · voided = anuladas · exps = egresos descontados de esa caja
export function boxModel(b, sales, voided, exps, branch = {}) {
  const by = Object.fromEntries(METHODS.map(k => [k, { total: 0, n: 0 }]))
  sales.forEach(s => { if (s.paid !== false && by[s.payment]) { by[s.payment].total += +s.total; by[s.payment].n++ } })
  const ingresos = sales.reduce((a, s) => a + +s.total, 0), egresos = exps.reduce((a, e) => a + +e.amount, 0), egEf = exps.filter(e => e.method === 'Efectivo').reduce((a, e) => a + +e.amount, 0)
  const opening = +b.opening_amount || 0, expected = opening + by.Efectivo.total - egEf, open = b.status === 'abierta'
  const num = (String(b.name).match(/\d+/) || [''])[0] || b.name
  const code = new Date(b.opened_at).toLocaleDateString('en-CA', T).slice(2).replace(/-/g, '') + '-' + String(b.id).replace(/-/g, '').slice(0, 6).toUpperCase()
  return { b, open, num, code, by, ingresos, egresos, neto: ingresos - egresos, opening, expected, entregar: open ? expected : (b.expected_amount ?? expected), counted: b.closing_amount,
    sales: [...sales].sort((x, y) => new Date(x.created_at) - new Date(y.created_at)), exps, voided: { total: voided.reduce((a, s) => a + +s.total, 0), n: voided.length }, branch, seller: b.user_email }
}
const who = e => (e || '').split('@')[0]
const nameOf = (mo, settings) => (mo.branch?.name || settings?.business_name || 'KOVA')

// ---------- Ticket térmico ----------
const row = (k, v, cls = '') => `<div class="r ${cls}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`
export function boxTicketHTML(mo, settings = {}, cfg = getPrintCfg()) {
  const br = mo.branch || {}, head = [br.name, [br.address, br.city].filter(Boolean).join(' - '), br.phone ? 'Tel: ' + br.phone : ''].filter(Boolean), w = cfg.paper === 58 ? '48mm' : '72mm'
  return `<div class="tk" style="width:${w};max-width:100%;margin:0 auto">
${cfg.logo !== false ? `<img src="${esc(/^https?:|^data:/.test(logoOf(settings)) ? logoOf(settings) : location.origin + logoOf(settings))}" alt="">` : ''}
<div class="c"><b>${esc((head[0] || '').toUpperCase())}</b>${head.slice(1).map(h => `<div>${esc(h)}</div>`).join('')}<div style="margin-top:8px"><b>RESUMEN DE CAJA</b></div></div><div class="ln"></div>
${row('Código:', mo.code)}${row('Caja #:', mo.num)}${row('Usuario:', who(mo.seller))}${row('Fecha apertura:', fD(mo.b.opened_at))}${row('Hora apertura:', fT(mo.b.opened_at))}${mo.b.closed_at ? row('Hora cierre:', fT(mo.b.closed_at)) : ''}${row('Estado:', mo.open ? 'ABIERTA' : 'CERRADA')}
<div class="ln"></div><b>INGRESOS POR MÉTODO DE PAGO</b>
${Object.entries(mo.by).filter(([, v]) => v.total > 0).map(([k, v]) => row(k.toUpperCase(), m(v.total))).join('') || row('Sin ventas', m(0))}
<div class="ln"></div>${row('TOTAL INGRESOS', m(mo.ingresos), 'tt')}${row('(-) Egresos del día', m(mo.egresos))}${row('NETO', m(mo.neto), 'tt')}
<div class="ln"></div>${row('Apertura de caja', m(mo.opening))}${row('(+) Ventas en efectivo', m(mo.by.Efectivo.total))}${row('(-) Egresos', m(mo.exps.filter(e => e.method === 'Efectivo').reduce((a, e) => a + +e.amount, 0)))}${row('TOTAL EFECTIVO A ENTREGAR', m(mo.entregar), 'tt')}
${!mo.open && mo.counted != null ? `${row('Efectivo contado', m(mo.counted))}${row('Diferencia', m(mo.counted - mo.entregar))}` : ''}
<div class="ln"></div><b>DETALLE DE MOVIMIENTOS (${mo.sales.length})</b>
${mo.sales.map(s => row(`${s.number || '-'} ${s.payment}`, m(s.total))).join('')}
${mo.exps.length ? `<div class="ln"></div><b>EGRESOS (${mo.exps.length})</b>${mo.exps.map(e => row(e.concept.slice(0, 26), '- ' + m(e.amount))).join('')}` : ''}
<div class="ln"></div><div class="c nt">Impreso: ${esc(fDT(new Date()))}</div></div>`
}
export function printHTML(body, title = 'Ticket') {
  const cfg = getPrintCfg(), f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f)
  const d = f.contentWindow.document; d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${cfg.paper === 58 ? 58 : 80}mm auto;margin:0}body{margin:0}${TICKET_CSS}</style></head><body>${body}</body></html>`); d.close()
  const go = () => { try { f.contentWindow.focus(); f.contentWindow.print() } catch (e) {} setTimeout(() => f.remove(), 2500) }
  const imgs = [...d.images]; let left = imgs.length; if (!left) return setTimeout(go, 100)
  const done = () => { if (--left <= 0) setTimeout(go, 100) }; imgs.forEach(i => i.complete ? done() : (i.onload = i.onerror = done))
}

// ---------- PDF A4 ----------
export async function boxPDF(mo, settings = {}) {
  const { jsPDF } = await import('jspdf'), doc = new jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 12, CW = W - 2 * M, br = mo.branch || {}, pages = []
  const gen = 'Generado: ' + fD(new Date()) + ', ' + new Date().toLocaleTimeString('es-PE', { ...T, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const txt = (t, x, y, o = {}) => { doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.s || 9); doc.setTextColor(...(o.c || [30, 41, 59])); doc.text(String(t), x, y, { align: o.a || 'left' }) }
  const box = (x, y, w, h, bar, fill = [250, 250, 251]) => { doc.setFillColor(...fill); doc.setDrawColor(226, 232, 240); doc.roundedRect(x, y, w, h, 2, 2, 'FD'); if (bar) { doc.setFillColor(...bar); doc.rect(x, y + 1, 1.2, h - 2, 'F') } }
  let y = 16
  txt((br.name || settings.business_name || 'KOVA').toUpperCase(), W / 2, y, { b: 1, s: 17, a: 'center' }); y += 5.5
  txt([br.address, br.city].filter(Boolean).join(' - '), W / 2, y, { s: 8, a: 'center', c: [100, 116, 139] }); y += 7
  txt(mo.open ? 'Reporte de caja abierta' : 'Reporte de caja cerrada', W / 2, y, { b: 1, s: 12, a: 'center' }); y += 6
  txt(`N° Caja ${mo.num}   |   Fecha: ${fD(mo.b.opened_at)}   |   Sede: ${br.name || ''}`, W / 2, y, { s: 9, a: 'center', c: [71, 85, 105] }); y += 4
  doc.setDrawColor(226, 232, 240); doc.line(M, y, W - M, y); y += 6
  const hw = (CW - 6) / 2
  ;[['APERTURA', [22, 163, 74], M, [['Fecha y hora', fDT(mo.b.opened_at)], ['Responsable', who(mo.seller)], ['Monto de apertura', m(mo.opening)]]], ['CIERRE', [220, 38, 38], M + hw + 6, [['Fecha y hora', mo.b.closed_at ? fDT(mo.b.closed_at) : '-'], ['Responsable', mo.b.closed_at ? who(mo.seller) : '-'], ['Efectivo contado', mo.counted != null && !mo.open ? m(mo.counted) : '-']]]].forEach(([t, c, x, rows]) => {
    box(x, y, hw, 27, c); txt(t, x + 6, y + 7, { b: 1, s: 10, c }); rows.forEach(([k, v], i) => { txt(k, x + 6, y + 13 + i * 5, { s: 8, c: [100, 116, 139] }); txt(v, x + hw - 4, y + 13 + i * 5, { b: 1, s: 8, a: 'right' }) }) })
  y += 33
  const cw = (CW - 8) / 3, cards = [['EFECTIVO', m(mo.by.Efectivo.total), mo.by.Efectivo.n + ' ventas', [37, 99, 235]], ['YAPE', m(mo.by.Yape.total), mo.by.Yape.n + ' ventas', [37, 99, 235]], ['TARJETA', m(mo.by.Tarjeta.total), mo.by.Tarjeta.n + (mo.by.Tarjeta.n === 1 ? ' venta' : ' ventas'), [37, 99, 235]],
    ['TRANSFERENCIA', m(mo.by.Transferencia.total), mo.by.Transferencia.n + ' ventas', [37, 99, 235]], ['EGRESOS', m(mo.egresos), mo.exps.length + ' registros', [217, 119, 6]], ['ANULADO', m(mo.voided.total), mo.voided.n + ' ventas', [220, 38, 38]]]
  cards.forEach(([t, v, s, c], i) => { const x = M + (i % 3) * (cw + 4), yy = y + Math.floor(i / 3) * 21; box(x, yy, cw, 18, c, [255, 255, 255]); txt(t, x + 5, yy + 5.5, { b: 1, s: 7.5, c: [100, 116, 139] }); txt(v, x + 5, yy + 12, { b: 1, s: 13, c }); txt(s, x + 5, yy + 16, { s: 7, c: [148, 163, 184] }) })
  y += 46
  doc.setFillColor(17, 24, 39); doc.roundedRect(M, y, CW, 14, 2, 2, 'F')
  ;[['TOTAL INGRESOS', m(mo.ingresos)], ['(-) EGRESOS', m(mo.egresos)], ['NETO', m(mo.neto)], ['EFECTIVO A ENTREGAR', m(mo.entregar)]].forEach(([k, v], i) => { const cx = M + CW / 8 + i * CW / 4; txt(k, cx, y + 5.5, { s: 7.5, c: [203, 213, 225], a: 'center' }); txt(v, cx, y + 11, { b: 1, s: 11, c: [255, 255, 255], a: 'center' }) })
  y += 21; txt(`Detalle de ventas (${mo.sales.length})`, M, y, { b: 1, s: 11 }); y += 3
  const cols = [['Fecha y hora', 34], ['Comprobante', 27], ['Producto', 66], ['Cant.', 9], ['Precio', 13], ['Importe', 14], ['Método', 17], ['Estado', 14], ['Total venta', 17]], tot = cols.reduce((a, c) => a + c[1], 0), cws = cols.map(c => c[1] / tot * CW)
  const thead = () => { doc.setFillColor(30, 41, 59); doc.rect(M, y, CW, 6, 'F'); let x = M; cols.forEach(([h], i) => { txt(h, x + 1.5, y + 4, { b: 1, s: 7, c: [255, 255, 255] }); x += cws[i] }); y += 6 }
  const footer = () => { pages.push(doc.getNumberOfPages()); txt(gen, M, 289, { s: 7.5, c: [160, 160, 170] }) }
  thead(); let k = 0
  const cell = (t, i, x, yy, o = {}) => { const al = i >= 3 && i !== 6 && i !== 7 ? 'right' : 'left', xx = al === 'right' ? x + cws[i] - 1.5 : x + 1.5; txt(doc.splitTextToSize(String(t ?? ''), cws[i] - 3)[0] || '', xx, yy, { s: 7.3, a: al, ...o }) }
  mo.sales.forEach(s => (s.items?.length ? s.items : [{ name: '-', qty: 1, price: s.total }]).forEach((it, j) => {
    if (y > 280) { footer(); doc.addPage(); y = 14; thead() }
    if (k++ % 2) { doc.setFillColor(247, 247, 249); doc.rect(M, y, CW, 5.2, 'F') }
    doc.setDrawColor(230, 230, 235); doc.rect(M, y, CW, 5.2); let x = M
    const f = j === 0, vals = [f ? fDT(s.created_at) : '', f ? s.number : '', it.name, it.qty, (+it.price).toFixed(2), (it.qty * it.price).toFixed(2), f ? s.payment : '', f ? (s.paid === false ? 'Por cobrar' : 'Pagado') : '', f ? (+s.total).toFixed(2) : '']
    vals.forEach((v, i) => { cell(v, i, x, y + 3.6, i === 8 ? { b: 1 } : {}); x += cws[i] }); y += 5.2 }))
  footer(); const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) { doc.setPage(i); txt(`Página ${i} de ${n}`, W - M, 289, { s: 7.5, c: [160, 160, 170], a: 'right' }) }
  doc.save(`reporte_caja_${String(mo.b.name).toLowerCase().replace(/\s+/g, '_')}_${new Date(mo.b.opened_at).toLocaleDateString('en-CA', T)}.pdf`)
}
