'use client'
import Link from 'next/link'
import { supabase } from './supabase'
import { Ico } from './icons'

// Trae todos los productos agotados / con stock bajo (función low_stock de schema_v7.sql).
// scope = id de sede, o null para todas las sedes a las que el usuario tiene acceso.
export async function fetchLowStock(scope) {
  let out = [], from = 0
  for (;;) {
    const { data, error } = await supabase.rpc('low_stock', { p_branch: scope || null }).range(from, from + 999)
    if (error) return { rows: [], error: error.message }
    out = out.concat(data || []); if ((data || []).length < 1000) break; from += 1000
  }
  return { rows: out, error: '' }
}
export const KEY = 'stock-alert-seen:'
export const alertSeen = k => { try { return sessionStorage.getItem(KEY + k) === '1' } catch (e) { return false } }
export const markSeen = k => { try { sessionStorage.setItem(KEY + k, '1') } catch (e) {} }
export const clearSeen = () => { try { Object.keys(sessionStorage).filter(k => k.startsWith(KEY)).forEach(k => sessionStorage.removeItem(k)) } catch (e) {} }

// Ventana "Alerta de inventario" (se muestra al entrar al sistema y desde el botón de la barra superior)
export function StockAlert({ rows, label, onClose }) {
  const out = rows.filter(r => r.status === 'agotado').length, low = rows.length - out
  return <div className="modal sa-bg" onClick={onClose}><div className="sa" role="dialog" aria-label="Alerta de inventario" onClick={e => e.stopPropagation()}>
    <div className="sa-h"><div><h2>Alerta de inventario</h2><p>Productos con stock bajo o agotado · {label}</p></div><button className="sa-x" aria-label="Cerrar" onClick={onClose}>✕</button></div>
    <div className="sa-b">
      <div className="sa-k"><div className="sa-kp r"><span><Ico n="box" s={16} /> SIN STOCK</span><b>{out}</b></div><div className="sa-kp y"><span><Ico n="warn" s={16} /> STOCK BAJO</span><b>{low}</b></div></div>
      <div className="sa-t"><div className="sa-th"><span>PRODUCTO</span><span>STOCK</span><span>MÍNIMO</span><span>ESTADO</span></div>
        {rows.map(r => <div className="sa-tr" key={r.branch_id + r.product_id}>
          <div className="sa-p"><b>{r.name}</b><small>{[r.sku, r.category, r.branch_name].filter(Boolean).join(' · ')}</small></div>
          <div className="sa-s"><b>{r.total}</b><small>{r.total === 1 ? 'unidad' : 'unidades'}</small>{r.warehouse > 0 && r.stock !== r.total && <em>Tienda {r.stock} · Almacén {r.warehouse}</em>}</div>
          <div className="sa-m">{r.min_stock}</div>
          <div><span className={'sa-tag ' + (r.status === 'agotado' ? 'r' : 'y')}>{r.status === 'agotado' ? 'Agotado' : 'Stock bajo'}</span></div></div>)}
      </div></div>
    <div className="sa-f"><button className="sa-ok" onClick={onClose}>Entendido</button><Link href="/admin/productos?stock=alerta" className="btn" onClick={onClose}>Ir a inventario <Ico n="arrow" s={16} /></Link></div>
  </div></div>
}
