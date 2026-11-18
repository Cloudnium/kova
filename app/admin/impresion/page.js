'use client'
import { useEffect, useState } from 'react'
import { useApp } from '../../../lib/branch'
import { Head } from '../../../lib/ui'
import { PRINT_KEY, getPrintCfg, printTicket, ticketPDF, ticketBodyHTML, TICKET_CSS } from '../../../lib/tickets'
export default function Impresion() {
  const { settings, branch, allBranches } = useApp(), [c, setC] = useState(null)
  useEffect(() => { setC(getPrintCfg()) }, [])
  if (!c) return null
  const set = (k, v) => { const n = { ...c, [k]: v }; setC(n); try { localStorage.setItem(PRINT_KEY, JSON.stringify(n)) } catch (e) {} }
  const b = branch || allBranches[0], ctx = { settings, branch: b }
  const demo = { voucher: 'Nota de Venta', number: 'NV' + (b?.code || '001') + '-0000001', created_at: new Date().toISOString(), customer_name: 'Cliente Varios', cash_name: 'Caja 1', seller_name: 'Vendedor', payment: 'Efectivo', paid: true, total: 11.5, source: 'pos', status: 'completado',
    items: [{ qty: 1, name: 'Powerade Multifrutas 600ml', price: 3.5 }, { qty: 2, name: 'Agua San Luis S/gas 750ml', price: 2.5 }, { qty: 1, name: 'Sporade Blueberry 500ml', price: 3 }] }
  return (<><Head t="Impresión" s="Ajustes del ticket para esta computadora (impresora térmica de 58 u 80 mm)" />
    <div className="two" style={{ gridTemplateColumns: '1fr 1fr' }}><div className="panel" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
      <label>Ancho del papel</label><div className="seg">{[80, 58].map(w => <button key={w} className={c.paper === w ? 'on' : ''} onClick={() => set('paper', w)}>{w} mm</button>)}</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={c.auto} onChange={e => set('auto', e.target.checked)} /> Imprimir automáticamente al registrar una venta</label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={c.logo !== false} onChange={e => set('logo', e.target.checked)} /> Mostrar logo en el ticket</label>
      <div className="row" style={{ gap: 8 }}><button className="btn" onClick={() => printTicket(demo, ctx)}>🖨 Imprimir prueba</button><button className="btn o" onClick={() => ticketPDF(demo, ctx)}>⬇ PDF de prueba</button></div>
      <small style={{ color: 'var(--mut)' }}>Consejo: en el diálogo de impresión elige tu impresora térmica, márgenes «Ninguno» y desactiva «Encabezados y pies de página». Con Chrome puedes activar la impresión silenciosa (--kiosk-printing) para que no pregunte cada vez. El logo, RUC y mensaje se cambian en Configuración; dirección y teléfono en Sedes.</small></div>
      <div className="panel"><b>Vista previa</b><style>{TICKET_CSS}</style><div className="tkbox" style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: ticketBodyHTML(demo, ctx, c) }} /></div></div></>)
}
