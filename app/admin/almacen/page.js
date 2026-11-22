'use client'
import { useState } from 'react'
import { rpc } from '../../../lib/supabase'
import { fmtDate } from '../../../lib/supabase'
import { useApp, useScope } from '../../../lib/branch'
import { TransfersModal } from '../../../lib/movesui'
import { Ico } from '../../../lib/icons'
import { useTable, useTableProducts, useStockMap, Head, Err, Modal, AllBanner } from '../../../lib/ui'
export default function Almacen() {
  const { branch, branches, allBranches } = useApp(), scope = useScope()
  const [allRows, , e0] = useTableProducts(), rows = allRows.filter(p => p.kind !== 'combo'), [sm, load, e1] = useStockMap(), [moves, loadMv] = useTable('stock_moves', 'created_at', 60, true)
  const [qty, setQty] = useState({}), [q, setQ] = useState(''), [err, setErr] = useState(''), [tr, setTr] = useState(null), [hist, setHist] = useState(false)
  const S = p => sm[p.id] || { stock: 0, wh: 0, by: {} }
  const mv = async (p, kind) => {
    const n = +(qty[p.id] || 0); if (n <= 0) return setErr('Escribe una cantidad mayor a 0.')
    const x = await rpc('move_stock', { p_branch: scope, p_product: p.id, p_qty: n, p_kind: kind }); if (x.error) return setErr(x.error)
    setErr(''); setQty({ ...qty, [p.id]: '' }); load(); loadMv()
  }
  const doTr = async () => { const x = await rpc('transfer_stock', { p_from: scope, p_to: tr.to, p_product: tr.p.id, p_qty: +tr.n }); if (x.error) return setTr({ ...tr, e: x.error }); setTr(null); setErr(''); load(); loadMv() }
  const others = branches.filter(b => b.id !== scope), list = rows.filter(p => p.name.toLowerCase().includes(q.toLowerCase()))
  return (<><Head t="Almacén" s={scope ? `Stock de ${branch?.name}: mueve entre almacén y tienda, ingresa mercadería o traslada a otra sede` : 'Stock por sede (solo consulta)'}><button className="btn o" onClick={() => setHist(true)}><Ico n="history" s={16} /> Historial de traslados</button></Head><Err e={err || e0 || e1} />
    {!scope && <AllBanner what="mover stock" />}
    <div className="panel"><input placeholder="Buscar producto..." value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <table><thead><tr><th>Producto</th><th>Tienda</th><th>Almacén</th>{scope ? <><th>Cantidad</th><th>Mover</th></> : <th>Por sede</th>}</tr></thead><tbody>
        {list.map(p => <tr key={p.id}><td>{p.name}</td><td>{S(p).stock}</td><td>{S(p).wh}</td>
          {scope ? <><td><input type="number" min="1" style={{ width: 80 }} value={qty[p.id] || ''} onChange={e => setQty({ ...qty, [p.id]: e.target.value })} /></td>
            <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="btn mini" onClick={() => mv(p, 'tienda')}>→ Tienda</button><button className="btn o mini" onClick={() => mv(p, 'almacen')}>→ Almacén</button><button className="btn o mini" onClick={() => mv(p, 'ingreso')}>+ Ingreso</button>
              {others.length > 0 && <button className="btn o mini" onClick={() => setTr({ p, to: others[0].id, n: qty[p.id] || '', e: '' })}>⇄ Trasladar</button>}</td></>
            : <td><small>{Object.entries(S(p).by).map(([b, v]) => `${allBranches.find(x => x.id === b)?.name || '?'}: ${v.stock}+${v.wh}`).join(' · ')}</small></td>}</tr>)}</tbody></table></div>
    <div className="panel" style={{ marginTop: 16 }}><b>Últimos movimientos {scope ? 'de esta sede' : ''}</b><table><thead><tr><th>Fecha</th><th>Producto</th><th>Cant.</th><th>Movimiento</th><th>Usuario</th></tr></thead><tbody>
      {moves.slice(0, 40).map(m => <tr key={m.id}><td>{fmtDate(m.created_at)}</td><td>{m.product_name}</td><td>{m.qty}</td><td>{m.direction}</td><td>{m.user_email}</td></tr>)}{!moves.length && <tr><td colSpan="5">Aún no hay movimientos.</td></tr>}</tbody></table></div>
    {hist && <TransfersModal onClose={() => setHist(false)} scope={scope} scopeName={scope ? branch?.name : ''} products={rows} branches={allBranches} />}
    {tr && <Modal title={`Trasladar ${tr.p.name}`} onClose={() => setTr(null)}><p className="sub" style={{ margin: 0 }}>Sale del <b>almacén</b> de {branch?.name} y entra al <b>almacén</b> de la sede destino (disponible: {S(tr.p).wh}).</p><Err e={tr.e} />
      <label>Sede destino</label><select value={tr.to} onChange={e => setTr({ ...tr, to: e.target.value })}>{others.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <label>Cantidad</label><input type="number" min="1" value={tr.n} onChange={e => setTr({ ...tr, n: e.target.value })} /><button className="btn" disabled={!(+tr.n > 0)} onClick={doTr}>Trasladar</button></Modal>}</>)
}
