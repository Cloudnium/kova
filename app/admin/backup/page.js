'use client'
import { useState } from 'react'
import { supabase, audit } from '../../../lib/supabase'
import { Head, Err } from '../../../lib/ui'
const TABLES = ['branches', 'products', 'branch_stock', 'customers', 'sales', 'expenses', 'cash_registers', 'stock_moves', 'audit_log', 'profiles', 'settings', 'doc_counters', 'discount_codes', 'discount_redemptions']
const fetchAll = async t => { let out = [], from = 0; for (;;) { const { data, error } = await supabase.from(t).select('*').range(from, from + 999); if (error) throw new Error(`${t}: ${error.message}`); out = out.concat(data); if (data.length < 1000) return out; from += 1000 } }
const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click() }
const csv = rows => { if (!rows.length) return ''; const h = Object.keys(rows[0]); return '\ufeff' + [h.join(','), ...rows.map(r => h.map(k => { const v = r[k] == null ? '' : typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k]); return `"${v.replace(/"/g, '""')}"` }).join(','))].join('\n') }
export default function Backup() {
  const [busy, setBusy] = useState(''), [err, setErr] = useState(''), [info, setInfo] = useState('')
  const stamp = new Date().toLocaleDateString('en-CA')
  const full = async () => { setBusy('full'); setErr(''); setInfo(''); try { const o = { generado: new Date().toISOString(), tablas: {} }; for (const t of TABLES) o.tablas[t] = await fetchAll(t); dl(`respaldo-${stamp}.json`, JSON.stringify(o), 'application/json'); setInfo('Respaldo descargado: ' + TABLES.map(t => `${t} (${o.tablas[t].length})`).join(' · ')); audit('Respaldo descargado', 'JSON completo') } catch (e) { setErr(e.message) } setBusy('') }
  const one = async t => { setBusy(t); setErr(''); try { dl(`${t}-${stamp}.csv`, csv(await fetchAll(t)), 'text/csv'); audit('Exportación CSV', t) } catch (e) { setErr(e.message) } setBusy('') }
  return (<><Head t="Backup" s="Descarga una copia de todos los datos de todas las sedes" /><Err e={err} />{info && <p style={{ background: '#dcfce7', padding: 10, borderRadius: 8, marginBottom: 12 }}>✓ {info}</p>}
    <div className="panel" style={{ marginBottom: 16 }}><b>Respaldo completo</b><p className="sub">Un archivo JSON con sedes, productos, stock por sede, clientes, ventas, pedidos, cajas, egresos, movimientos y auditoría.</p><button className="btn" disabled={!!busy} onClick={full}>{busy === 'full' ? 'Generando...' : '⬇ Descargar respaldo completo (.json)'}</button></div>
    <div className="panel"><b>Exportar una tabla (CSV para Excel)</b><div className="chips" style={{ marginTop: 10 }}>{TABLES.map(t => <button key={t} className="chip" disabled={!!busy} onClick={() => one(t)}>{busy === t ? '...' : t}</button>)}</div>
      <small style={{ color: 'var(--mut)' }}>Para copias automáticas diarias y restauración, activa los backups del proyecto en Supabase (Database → Backups). Este respaldo es una copia de consulta; la restauración se hace desde Supabase.</small></div></>)
}
