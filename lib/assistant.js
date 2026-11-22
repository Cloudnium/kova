'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase, money } from './supabase'
import { useApp, useScope } from './branch'
import { KB } from './kb'
const dk = d => new Date(d).toLocaleDateString('en-CA')
const Bot = ({ s = 36 }) => <span className="as-av" style={{ width: s, height: s }}><img src="/asistente.gif" alt="" draggable="false" className="as-av-img" /></span>
export default function Assistant() {
  const { allBranches } = useApp(), scope = useScope(), hello = '¡Hola! Soy KOVA, tu asistente del sistema. Elige un tema y una pregunta de la lista y te explico paso a paso cómo hacerlo.'
  const [open, setOpen] = useState(false), [msgs, setMsgs] = useState([{ r: 'a', t: hello }]), [topic, setTopic] = useState('cajas'), [q, setQ] = useState(''), [busy, setBusy] = useState(false), end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [msgs, open])
  useEffect(() => { const f = e => e.key === 'Escape' && setOpen(false); window.addEventListener('keydown', f); const o = () => setOpen(true); window.addEventListener('open-assistant', o); return () => { window.removeEventListener('keydown', f); window.removeEventListener('open-assistant', o) } }, [])
  const data = async () => {
    const d = new Date(); d.setDate(d.getDate() - 29); const sb = supabase.from('sales').select('*').gte('created_at', d.toISOString()).limit(5000), stb = supabase.from('branch_stock').select('*').limit(20000), eb = supabase.from('expenses').select('*').gte('created_at', d.toISOString()).limit(5000)
    const [s, st, p, e] = await Promise.all([scope ? sb.eq('branch_id', scope) : sb, scope ? stb.eq('branch_id', scope) : stb, supabase.from('products').select('*').eq('active', true).neq('kind', 'combo'), scope ? eb.eq('branch_id', scope) : eb])
    const sales = s.data || [], ok = sales.filter(x => x.status === 'completado'), today = ok.filter(x => dk(x.created_at) === dk(new Date())), sum = a => a.reduce((t, x) => t + +x.total, 0)
    const tops = {}; ok.forEach(x => (x.items || []).forEach(i => tops[i.name] = (tops[i.name] || 0) + i.qty))
    const stock = {}; (st.data || []).forEach(x => stock[x.product_id] = (stock[x.product_id] || 0) + x.stock)
    return { hoy: { ventas: sum(today), n: today.length }, mes: { ventas: sum(ok), n: ok.length, egresos: sum((e.data || []).map(x => ({ total: x.amount }))) }, web: sales.filter(x => x.source === 'web' && x.status === 'pendiente').length, porCobrar: sum(ok.filter(x => x.paid === false)),
      top: Object.entries(tops).sort((a, b) => b[1] - a[1]).slice(0, 8), bajo: (p.data || []).map(x => [x.name, stock[x.id] || 0]).filter(x => x[1] < 10).sort((a, b) => a[1] - b[1]).slice(0, 15) }
  }
  const LIVE = { 'Ventas de hoy': d => `Hoy llevas ${money(d.hoy.ventas)} en ${d.hoy.n} comprobantes.`, 'Productos más vendidos': d => d.top.length ? 'Más vendidos (últimos 30 días):\n' + d.top.map(([n, c], i) => `${i + 1}. ${n} — ${c} u.`).join('\n') : 'Aún no hay ventas.',
    'Productos con poco stock': d => d.bajo.length ? 'Con menos de 10 unidades en tienda:\n' + d.bajo.map(([n, c]) => `• ${n}: ${c}`).join('\n') : 'Todo el stock está en orden.', 'Pedidos web por atender': d => `Tienes ${d.web} pedido(s) web por confirmar y ${money(d.porCobrar)} por cobrar.`,
    'Resumen de 30 días': d => `Últimos 30 días: ${money(d.mes.ventas)} en ${d.mes.n} comprobantes y ${money(d.mes.egresos)} en egresos (resultado ${money(d.mes.ventas - d.mes.egresos)}).` }
  const topics = [...KB, { id: 'datos', t: 'Mi negocio hoy', live: true }], cur = topics.find(t => t.id === topic)
  const say = (u, a) => setMsgs(m => [...m, { r: 'u', t: u }, { r: 'a', t: a }])
  const pick = ([ques, ans]) => say(ques, ans)
  const live = async k => { if (busy) return; setBusy(true); setMsgs(m => [...m, { r: 'u', t: k }]); try { const a = LIVE[k](await data()); setMsgs(m => [...m, { r: 'a', t: a + (scope ? '' : '\n(Datos de todas tus sedes.)') }]) } catch (e) { setMsgs(m => [...m, { r: 'a', t: 'No pude consultar los datos: ' + e.message }]) } setBusy(false) }
  return (<>
    {!open && <button className="as-fab" aria-label="Abrir el asistente" title="Asistente KOVA" onClick={() => setOpen(true)}><Bot s={64} /></button>}
    {open && <div className="as-pop" role="dialog" aria-label="Asistente KOVA"><div className="as-ph"><Bot s={46} /><div style={{ flex: 1 }}><b>Asistente KOVA</b><small>Elige una pregunta y te explico</small></div><button className="as-x" aria-label="Cerrar" onClick={() => setOpen(false)}>✕</button></div>
      <div className="as-chat"><div className="as-row"><Bot s={32} /><div className="as-b">{msgs[0].t}</div></div>
        {msgs.slice(1).map((m, i) => m.r === 'u' ? <div key={i} className="as-row u"><div className="as-b u">{m.t}</div></div> : <div key={i} className="as-row"><Bot s={32} /><div className="as-b">{m.t}</div></div>)}
        {busy && <div className="as-row"><Bot s={32} /><div className="as-b">Consultando…</div></div>}<div ref={end} /></div>
      <div className="as-foot"><div className="as-h"><span>ELIGE UN TEMA Y UNA PREGUNTA</span><button className="as-new" disabled={msgs.length < 2} onClick={() => setMsgs([{ r: 'a', t: hello }])}>↻ Nueva consulta</button></div>
        <div className="as-tabs">{topics.map(t => <button key={t.id} className={'as-tab' + (topic === t.id ? ' on' : '')} onClick={() => setTopic(t.id)}>{t.t}</button>)}</div>
        <div className="as-qs">{cur.live ? Object.keys(LIVE).map(k => <button key={k} className="as-q" disabled={busy} onClick={() => live(k)}>{k}</button>) : cur.q.map(x => <button key={x[0]} className="as-q" onClick={() => pick(x)}>{x[0]}</button>)}</div></div></div>}</>)
}
