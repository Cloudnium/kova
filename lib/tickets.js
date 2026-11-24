'use client'
// Tickets de venta / pedido: vista previa, impresión térmica (58 u 80 mm) y PDF.
// Un solo "modelo" alimenta los dos formatos para que siempre salgan iguales.
const m = n => 'S/ ' + Number(n || 0).toFixed(2)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const p2 = n => String(n).padStart(2, '0')
export const tkDate = d => { const x = new Date(d || Date.now()); return `${p2(x.getDate())}/${p2(x.getMonth() + 1)}/${x.getFullYear()} ${p2(x.getHours())}:${p2(x.getMinutes())}` }
const TITLES = { 'Nota de Venta': 'NOTA DE VENTA', Boleta: 'BOLETA DE VENTA', Factura: 'FACTURA' }
export const PRINT_KEY = 'print-cfg'
export const getPrintCfg = () => { try { return { paper: 80, logo: true, auto: true, ...JSON.parse(localStorage.getItem(PRINT_KEY) || '{}') } } catch (e) { return { paper: 80, logo: true, auto: true } } }
export const logoOf = settings => (settings && settings.ticket_logo_url) || '/logo.png'
const absUrl = u => /^https?:|^data:/.test(u) ? u : (typeof location !== 'undefined' ? location.origin : '') + u

// ctx = { settings, branch }
export function ticketModel(s, ctx = {}) {
  const st = ctx.settings || {}, b = ctx.branch || {}, web = s.source === 'web', pending = web && s.status === 'pendiente' || (web && !s.number)
  const title = pending ? 'TICKET DE PEDIDO' : (TITLES[s.voucher] || String(s.voucher || 'COMPROBANTE').toUpperCase())
  const head = [b.address, b.city, b.phone ? 'Tel: ' + b.phone : '', st.business_ruc ? 'RUC: ' + st.business_ruc : ''].filter(Boolean)
  const meta = [['Fecha', tkDate(s.created_at)], ['Cliente', s.customer_name || 'Cliente Varios']]
  if (!pending) meta.push(['Documento', s.customer_doc || '-'])
  if (web) { if (!pending && s.order_number) meta.splice(1, 0, ['Pedido', s.order_number]); if (s.phone) meta.push(['Celular', s.phone]); if (s.address) meta.push(['Dirección', s.address]); if (s.geo_lat != null) meta.push(['Ubicación', 'GPS enviada por el cliente']) }
  if (!pending) { meta.push(['Caja', s.cash_name || '-']); meta.push(['Vendedor', s.seller_name || '-']) }
  const items = (s.items || []).map(i => ({ qty: i.qty, name: i.name, amount: i.qty * i.price, unit: i.qty > 1 ? `@ ${m(i.price)} c/u` : '' }))
  const totals = []
  const fee = +s.delivery_fee || 0, sub = items.reduce((a, i) => a + i.amount, 0)
  if (+s.discount > 0) totals.push(['Subtotal', m(sub)], [`Descuento ${(+s.discount).toString().replace(/\.0+$/, '')}%`, '- ' + m(sub - (s.total - fee))])
  else if (fee > 0) totals.push(['Subtotal', m(sub)])
  if (fee > 0) totals.push([`Delivery${+s.delivery_km ? ' (' + (+s.delivery_km).toFixed(1) + ' km)' : ''}`, m(fee)])
  totals.push(['TOTAL', m(s.total), true])
  let pay
  if (pending && s.pay_mode === 'culqi') pay = s.pay_status === 'pagado' ? 'Pagado en línea (' + ({ yape: 'Yape', pagoefectivo: 'PagoEfectivo' }[s.pay_method] || 'Tarjeta') + ')' : 'PagoEfectivo · CIP ' + (s.pay_cip || '-') + ' (pendiente de pago)'
  else if (pending) pay = s.pay_mode === 'pagar_ahora' ? 'Yape (pago por verificar)' : 'Contra entrega'
  else pay = (s.payment || 'Efectivo') + (s.paid === false ? ' · POR COBRAR' : '')
  const foot = [st.ticket_footer || b.ticket_footer || 'Gracias por su compra']
  const note = pending ? 'Este ticket no es un comprobante de pago. La tienda confirmará tu pedido y te contactará.' : ''
  return { title, number: pending ? s.order_number : s.number, head, meta, items, totals, pay, foot, note, logo: logoOf(st) }
}

export const TICKET_CSS = `.tk{font:12px/1.4 'Courier New',Courier,monospace;color:#000;background:#fff;padding:10px 8px;box-sizing:border-box}
.tk .c{text-align:center}.tk .ln{border-top:1px dashed #000;margin:9px 0}.tk .r{display:flex;justify-content:space-between;gap:8px}
.tk img{max-width:62%;max-height:26mm;object-fit:contain;display:block;margin:0 auto 8px}.tk .ttl{text-decoration:underline;font-size:12px;margin-bottom:6px}
.tk .no{font-weight:700;font-size:15px;margin-bottom:2px}.tk .it{display:grid;grid-template-columns:24px 1fr auto;gap:4px 8px}.tk .it .h{font-size:11px}
.tk .it .a{text-align:right;white-space:nowrap}.tk .sub{grid-column:2/4;font-size:11px}.tk .tt{font-weight:700;font-size:13px}.tk .nt{font-size:10px;margin-top:8px}`

export function ticketBodyHTML(s, ctx = {}, cfg = getPrintCfg()) {
  const t = ticketModel(s, ctx), w = cfg.paper === 58 ? '48mm' : '72mm'
  return `<div class="tk" style="width:${w};max-width:100%;margin:0 auto">
${cfg.logo !== false ? `<img src="${esc(absUrl(t.logo))}" alt="">` : ''}
<div class="c">${t.head.map(h => `<div>${esc(h)}</div>`).join('')}</div><div class="ln"></div>
<div class="c"><div class="ttl">${esc(t.title)}</div><div class="no">${esc(t.number || '')}</div></div>
<div style="margin-top:8px">${t.meta.map(([k, v]) => `<div>${esc(k)}: ${esc(v)}</div>`).join('')}</div><div class="ln"></div>
<div class="it"><b class="h">CANT</b><b class="h">PRODUCTO</b><b class="h a">IMPORTE</b>
${t.items.map(i => `<span>${i.qty}</span><span>${esc(i.name)}</span><span class="a">${m(i.amount)}</span>${i.unit ? `<span class="sub">${esc(i.unit)}</span>` : ''}`).join('')}</div><div class="ln"></div>
${t.totals.map(([k, v, big]) => `<div class="r${big ? ' tt' : ''}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}
<div style="margin-top:8px">Pago: ${esc(t.pay)}</div><div class="ln"></div>
<div class="c">${t.foot.map(f => `<div>${esc(f)}</div>`).join('')}</div>${t.note ? `<div class="c nt">${esc(t.note)}</div>` : ''}</div>`
}

// Imprime con un iframe oculto (no lo bloquea el navegador como las ventanas emergentes)
export function printTicket(s, ctx = {}) {
  const cfg = getPrintCfg(), f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  const d = f.contentWindow.document
  d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.number || s.order_number || 'Ticket')}</title><style>@page{size:${cfg.paper === 58 ? 58 : 80}mm auto;margin:0}body{margin:0}${TICKET_CSS}</style></head><body>${ticketBodyHTML(s, ctx, cfg)}</body></html>`); d.close()
  const go = () => { try { f.contentWindow.focus(); f.contentWindow.print() } catch (e) {} setTimeout(() => f.remove(), 2500) }
  const imgs = [...d.images]; let left = imgs.length
  if (!left) return setTimeout(go, 100)
  const done = () => { if (--left <= 0) setTimeout(go, 100) }
  imgs.forEach(i => i.complete ? done() : (i.onload = i.onerror = done))
}

// ----- PDF (jsPDF se carga solo cuando se necesita) -----
const safe = s => String(s ?? '').replace(/[→–—]/g, '-').replace(/[^\x20-\xFF]/g, '?')
async function loadLogo(url) {
  try {
    const blob = await (await fetch(absUrl(url))).blob()
    const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob) })
    const dim = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok([i.width, i.height]); i.onerror = no; i.src = data })
    return { data, w: dim[0], h: dim[1], fmt: /png/i.test(blob.type) ? 'PNG' : /webp/i.test(blob.type) ? 'WEBP' : 'JPEG' }
  } catch (e) { return null }
}
export async function ticketPDF(s, ctx = {}, { save = true } = {}) {
  const { jsPDF } = await import('jspdf'), cfg = getPrintCfg(), t = ticketModel(s, ctx), W = cfg.paper === 58 ? 58 : 80, M = 4, fs = W === 58 ? 7.5 : 8.5, lh = fs * 0.43
  const logo = cfg.logo !== false ? await loadLogo(t.logo) : null
  const draw = doc => {
    let y = M; doc.setFont('courier', 'normal'); doc.setFontSize(fs)
    const ctr = (txt, bold) => { doc.setFont('courier', bold ? 'bold' : 'normal'); doc.splitTextToSize(safe(txt), W - 2 * M).forEach(l => { y += lh; doc.text(l, W / 2, y, { align: 'center' }) }) }
    const line = () => { y += 2; doc.setLineDashPattern([0.6, 0.6], 0); doc.line(M, y, W - M, y); doc.setLineDashPattern([], 0); y += 1.5 }
    const row = (a, b, bold) => { doc.setFont('courier', bold ? 'bold' : 'normal'); y += lh; doc.text(safe(a), M, y); doc.text(safe(b), W - M, y, { align: 'right' }) }
    if (logo) { const mw = (W - 2 * M) * 0.6, mh = 18, k = Math.min(mw / logo.w, mh / logo.h), w = logo.w * k, h = logo.h * k; doc.addImage(logo.data, logo.fmt, (W - w) / 2, y, w, h); y += h + 1 }
    t.head.forEach(h => ctr(h)); line()
    y += 1; doc.setFont('courier', 'normal'); y += lh; const tw = doc.getTextWidth(safe(t.title)); doc.text(safe(t.title), W / 2, y, { align: 'center' }); doc.line((W - tw) / 2, y + 0.6, (W + tw) / 2, y + 0.6)
    doc.setFontSize(fs + 2.5); ctr(t.number || '', true); doc.setFontSize(fs); y += 1.5
    t.meta.forEach(([k, v]) => { doc.setFont('courier', 'normal'); doc.splitTextToSize(safe(`${k}: ${v}`), W - 2 * M).forEach(l => { y += lh; doc.text(l, M, y) }) }); line()
    doc.setFont('courier', 'bold'); y += lh; doc.text('CANT', M, y); doc.text('PRODUCTO', M + 9, y); doc.text('IMPORTE', W - M, y, { align: 'right' }); doc.setFont('courier', 'normal')
    t.items.forEach(i => {
      const nm = doc.splitTextToSize(safe(i.name), W - 2 * M - 9 - 19); y += lh + 0.4
      doc.text(String(i.qty), M, y); doc.text(nm[0], M + 9, y); doc.text(safe(m(i.amount)), W - M, y, { align: 'right' })
      nm.slice(1).forEach(l => { y += lh; doc.text(l, M + 9, y) }); if (i.unit) { y += lh; doc.text(safe(i.unit), M + 9, y) }
    }); line()
    t.totals.forEach(([k, v, big]) => row(k, v, big)); y += 1.5; doc.setFont('courier', 'normal')
    doc.splitTextToSize(safe('Pago: ' + t.pay), W - 2 * M).forEach(l => { y += lh; doc.text(l, M, y) }); line()
    t.foot.forEach(f => ctr(f)); if (t.note) { doc.setFontSize(fs - 1.5); y += 1.5; ctr(t.note); doc.setFontSize(fs) }
    return y + M
  }
  const h = Math.max(60, Math.ceil(draw(new jsPDF({ unit: 'mm', format: [W, 600] }))))
  const doc = new jsPDF({ unit: 'mm', format: [W, h] }); draw(doc)
  if (save) doc.save(`${(t.number || 'ticket').replace(/[^\w-]/g, '')}.pdf`)
  return doc
}
