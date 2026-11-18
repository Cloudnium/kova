'use client'
import { useState } from 'react'
import { useTable, Head, Err } from '../../../lib/ui'
import { money, fmtDate } from '../../../lib/supabase'
export default function Clientes() {
  const [cs, , e1] = useTable('customers'), [ss, , e2] = useTable('sales', 'created_at', 3000, true), [q, setQ] = useState('')
  const m = {}; cs.forEach(c => m[c.name] = { name: c.name, phone: c.phone, doc: c.doc_number, n: 0, total: 0, last: null, web: false })
  ss.filter(s => s.status !== 'anulado' && s.status !== 'pendiente' && s.customer_name !== 'Cliente Varios').forEach(s => { const c = m[s.customer_name] ||= { name: s.customer_name, phone: s.phone, n: 0, total: 0, last: null, web: false }
    c.n++; c.total += +s.total; c.phone ||= s.phone; c.doc ||= s.customer_doc; c.web ||= s.source === 'web'; c.last = !c.last || s.created_at > c.last ? s.created_at : c.last })
  const list = Object.values(m).filter(c => (c.name + (c.phone || '') + (c.doc || '')).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.total - a.total)
  return (<><Head t="Clientes" s="Historial de clientes de la tienda y de pedidos web (compras de la sede elegida)" /><Err e={e1 || e2} />
    <div className="panel"><input placeholder="Buscar cliente, celular o documento..." value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} /><table><thead><tr><th>Cliente</th><th>Documento</th><th>Celular</th><th>Origen</th><th>Compras</th><th>Total</th><th>Última compra</th></tr></thead><tbody>
      {list.map(c => <tr key={c.name}><td><b>{c.name}</b></td><td>{c.doc || '-'}</td><td>{c.phone || '-'}</td><td><span className="tag">{c.web ? 'Web' : 'Tienda'}</span></td><td>{c.n}</td><td>{money(c.total)}</td><td>{c.last ? fmtDate(c.last) : '-'}</td></tr>)}
      {!list.length && <tr><td>Aún no hay clientes. Se agregan al vender o al confirmar pedidos web.</td></tr>}</tbody></table></div></>)
}
