'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase, money } from '../../../lib/supabase'
import { useApp, useScope } from '../../../lib/branch'
import { Head } from '../../../lib/ui'
const dk = d => new Date(d).toLocaleDateString('en-CA')
export default function Asistente() {
  const { branch, allBranches } = useApp(), scope = useScope(), [msgs, setMsgs] = useState([{ r: 'a', t: 'Hola, soy tu asistente. Pregúntame por las ventas, el stock o los pedidos de ' + (scope ? branch?.name : 'todas las sedes') + '. Usa los atajos o escribe tu pregunta.' }]), [q, setQ] = useState(''), [busy, setBusy] = useState(false), end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  const data = async () => {
    const d = new Date(); d.setDate(d.getDate() - 29); const sb = supabase.from('sales').select('*').gte('created_at', d.toISOString()).limit(5000), stb = supabase.from('branch_stock').select('*').limit(20000), eb = supabase.from('expenses').select('*').gte('created_at', d.toISOString()).limit(5000)
    const [s, st, p, e] = await Promise.all([scope ? sb.eq('branch_id', scope) : sb, scope ? stb.eq('branch_id', scope) : stb, supabase.from('products').select('id,name,price').eq('active', true), scope ? eb.eq('branch_id', scope) : eb])
    const sales = s.data || [], ok = sales.filter(x => x.status === 'completado'), today = ok.filter(x => dk(x.created_at) === dk(new Date())), sum = a => a.reduce((t, x) => t + +x.total, 0)
    const tops = {}; ok.forEach(x => (x.items || []).forEach(i => tops[i.name] = (tops[i.name] || 0) + i.qty))
    const stock = {}; (st.data || []).forEach(x => stock[x.product_id] = (stock[x.product_id] || 0) + x.stock)
    return { hoy: { ventas: sum(today), comprobantes: today.length }, mes30: { ventas: sum(ok), comprobantes: ok.length, egresos: sum((e.data || []).map(x => ({ total: x.amount }))) },
      pedidosWebPorConfirmar: sales.filter(x => x.source === 'web' && x.status === 'pendiente').length, porCobrar: sum(ok.filter(x => x.paid === false)),
      topProductos: Object.entries(tops).sort((a, b) => b[1] - a[1]).slice(0, 8), stockBajo: (p.data || []).map(x => [x.name, stock[x.id] || 0]).filter(x => x[1] < 10).sort((a, b) => a[1] - b[1]).slice(0, 15),
      porSede: Object.entries(ok.reduce((m, x) => (m[x.branch_id] = (m[x.branch_id] || 0) + +x.total, m), {})).map(([id, v]) => [allBranches.find(b => b.id === id)?.name, v]) }
  }
  const quick = { 'Ventas de hoy': d => `Hoy llevas ${money(d.hoy.ventas)} en ${d.hoy.comprobantes} comprobantes.`, 'Más vendidos': d => d.topProductos.length ? 'Más vendidos (30 días):\n' + d.topProductos.map(([n, c], i) => `${i + 1}. ${n} — ${c} u.`).join('\n') : 'Aún no hay ventas.',
    'Stock bajo': d => d.stockBajo.length ? 'Productos con menos de 10 unidades en tienda:\n' + d.stockBajo.map(([n, c]) => `• ${n}: ${c}`).join('\n') : 'Todo el stock está en orden.', 'Pedidos web': d => `Tienes ${d.pedidosWebPorConfirmar} pedido(s) web por confirmar y ${money(d.porCobrar)} por cobrar.`,
    'Resumen 30 días': d => `Últimos 30 días: ${money(d.mes30.ventas)} en ${d.mes30.comprobantes} comprobantes y ${money(d.mes30.egresos)} en egresos (resultado ${money(d.mes30.ventas - d.mes30.egresos)}).` }
  const ask = async text => {
    if (!text.trim() || busy) return; setBusy(true); setQ(''); setMsgs(m => [...m, { r: 'u', t: text }])
    try { const d = await data()
      if (quick[text]) setMsgs(m => [...m, { r: 'a', t: quick[text](d) }])
      else { const { data: ses } = await supabase.auth.getSession(); const r = await fetch('/api/asistente', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ses.session.access_token }, body: JSON.stringify({ question: text, data: d, sede: scope ? branch?.name : 'Todas las sedes' }) }).then(x => x.json())
        setMsgs(m => [...m, { r: 'a', t: r.answer || r.error || 'No pude responder.' }]) }
    } catch (e) { setMsgs(m => [...m, { r: 'a', t: 'Ocurrió un error: ' + e.message }]) }
    setBusy(false)
  }
  return (<><Head t="Asistente" s="Consulta rápida de tu negocio" /><div className="panel"><div className="chips" style={{ marginBottom: 12 }}>{Object.keys(quick).map(k => <button key={k} className="chip" disabled={busy} onClick={() => ask(k)}>{k}</button>)}</div>
    <div className="chat">{msgs.map((m, i) => <div key={i} className={'msg ' + m.r}>{m.t}</div>)}{busy && <div className="msg a">Pensando...</div>}<div ref={end} /></div>
    <div className="row" style={{ marginTop: 12, gap: 8 }}><input placeholder="Escribe tu pregunta (ej. ¿qué producto debería reponer primero?)" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask(q)} /><button className="btn" style={{ width: 'auto' }} disabled={busy || !q.trim()} onClick={() => ask(q)}>Enviar</button></div>
    <small style={{ color: 'var(--mut)' }}>Los atajos funcionan siempre. Las preguntas libres usan IA si el administrador configuró ANTHROPIC_API_KEY en el servidor.</small></div></>)
}
