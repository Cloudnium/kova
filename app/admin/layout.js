'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase, money, SUPA_OK, getSede, setSede, initials, settingsMap, rpc } from '../../lib/supabase'
import { Ico } from '../../lib/icons'
import { AppCtx } from '../../lib/branch'
import { applyBrand } from '../../lib/brand'
import { playNotify } from '../../lib/sound'
import { Modal, Err } from '../../lib/ui'
import { StockAlert, fetchLowStock, alertSeen, markSeen, clearSeen } from '../../lib/stockalert'

// [ruta, etiqueta, icono, solo administrador]
const MENU = [['PRINCIPAL', [['', 'Dashboard', 'home'], ['ventas', 'Ventas', 'cart'], ['pedidos', 'Pedidos web', 'bag']]],
  ['GESTIÓN', [['productos', 'Productos', 'box'], ['clientes', 'Clientes', 'users'], ['usuarios', 'Usuarios', 'usercog', 1], ['cajas', 'Cajas', 'till'], ['almacen', 'Almacén', 'store']]],
  ['SEDES', [['sedes', 'Sedes', 'building', 1]]],
  ['DOCUMENTOS', [['comprobantes', 'Comprobantes', 'file'], ['egresos', 'Egresos', 'truck'], ['reportes', 'Reportes', 'chart']]],
  ['HERRAMIENTAS', [['asistente', 'Asistente', 'chat'], ['anuncios', 'Anuncios', 'bell', 1], ['impresion', 'Impresión', 'printer'], ['backup', 'Backup', 'db', 1], ['auditoria', 'Auditoría', 'audit', 1], ['config', 'Configuración', 'gear', 1]]]]
const ADMIN_ONLY = MENU.flatMap(m => m[1]).filter(x => x[3]).map(x => x[0])
const NET = { ok: 'En línea', slow: 'Conexión lenta', down: 'Sin respuesta del servidor', off: 'Sin internet' }

export default function AdminLayout({ children }) {
  const path = usePathname(), r = useRouter(), [user, setUser] = useState(null), [prof, setProf] = useState(null), [toast, setToast] = useState(null), [pending, setPending] = useState(0), [bad, setBad] = useState('')
  const [col, setCol] = useState(false), [net, setNet] = useState({ s: 'ok', ms: 0 })
  const [all, setAll] = useState([]), [branchId, setBranchId] = useState(null), [settings, setSettings] = useState({}), [menu, setMenu] = useState(false)
  const [low, setLow] = useState([]), [lowOpen, setLowOpen] = useState(false), [lowErr, setLowErr] = useState('')
  const [box, setBox] = useState(undefined), [boxM, setBoxM] = useState(false), [bf, setBf] = useState({ name: 'Caja 1', amt: 0 }), [be, setBe] = useState(''), [blocked, setBlocked] = useState(false)
  const asked = useRef(new Set()), acc = useRef([]), cfg = useRef({}), names = useRef({}), menuRef = useRef(null)

  useEffect(() => { try { setCol(localStorage.getItem('side-col') === '1') } catch (e) {} }, [])
  const toggle = () => { setCol(c => { try { localStorage.setItem('side-col', c ? '0' : '1') } catch (e) {} return !c }) }
  useEffect(() => {
    let alive = true
    const ping = async () => {
      if (!navigator.onLine) return alive && setNet({ s: 'off', ms: 0 })
      const t = performance.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), 6000)
      try { await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/health', { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }, signal: ac.signal, cache: 'no-store' })
        const ms = Math.round(performance.now() - t); alive && setNet({ s: ms > 1500 ? 'slow' : 'ok', ms })
      } catch (e) { alive && setNet({ s: navigator.onLine ? 'down' : 'off', ms: 0 }) }
      clearTimeout(to)
    }
    ping(); const i = setInterval(ping, 10000)
    window.addEventListener('online', ping); window.addEventListener('offline', ping)
    return () => { alive = false; clearInterval(i); window.removeEventListener('online', ping); window.removeEventListener('offline', ping) }
  }, [])

  // sedes que este usuario puede usar
  const branches = useMemo(() => all.filter(b => b.active !== false && (prof?.role === 'administrador' || (prof?.branch_ids || []).includes(b.id))), [all, prof])
  const isAdmin = prof?.role === 'administrador'
  const branch = branches.find(b => b.id === branchId) || null
  acc.current = branches.map(b => b.id); cfg.current = settings; names.current = Object.fromEntries(all.map(b => [b.id, b.name]))

  const loadSettings = useCallback(async () => { const s = await supabase.from('settings').select('*'); const m = settingsMap(s.data); setSettings(m); applyBrand(m.brand_color); return m }, [])
  const refreshPending = useCallback(async () => {
    let q = supabase.from('sales').select('id', { count: 'exact', head: true }).eq('source', 'web').eq('status', 'pendiente'); if (branchId && branchId !== 'all') q = q.eq('branch_id', branchId)
    const { count } = await q; setPending(count || 0)
  }, [branchId])
  const reloadBox = useCallback(async () => {
    if (!user || !branchId || branchId === 'all') return setBox(undefined)
    const { data } = await supabase.from('cash_registers').select('*').eq('status', 'abierta').eq('user_email', user.email).eq('branch_id', branchId).limit(1)
    setBox(data?.[0] || null); return data?.[0] || null
  }, [user, branchId])

  // arranque: sesión, perfil, sedes y configuración
  useEffect(() => {
    if (!SUPA_OK) return setBad('Las claves de Supabase no llegaron a este despliegue. En Vercel: Settings → Environment Variables (marca Production y Preview) y luego Deployments → Redeploy. Abre /api/health para ver qué falta. En local: revisa .env.local y reinicia npm run dev.')
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession(); if (!data.session) return r.replace('/login')
        const u = data.session.user, [p, b] = await Promise.all([supabase.from('profiles').select('*').eq('id', u.id).single(), supabase.from('branches').select('*').order('created_at')])
        if (p.error || b.error) return setBad((p.error || b.error).message + '. Ejecuta supabase/schema_v5.sql en Supabase.')
        if (p.data.active === false) { await supabase.auth.signOut(); return r.replace('/login') }
        loadSettings(); setProf(p.data); setAll(b.data || []); setUser(u)
      } catch (e) { setBad('No se pudo conectar con Supabase. Revisa la URL y la anon key.') }
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (!s) r.replace('/login') })
    return () => sub.subscription.unsubscribe()
  }, [])
  // sede elegida (si no hay una válida, se pregunta de nuevo)
  useEffect(() => {
    if (!prof) return
    const s = getSede(); if (s === 'all' ? branches.length > 1 : branches.some(b => b.id === s)) setBranchId(s); else r.replace('/seleccionar-sede')
  }, [prof, branches])
  useEffect(() => { reloadBox(); refreshPending() }, [reloadBox, refreshPending])
  // en cada sede hay que abrir una caja para vender: se ofrece al entrar
  useEffect(() => { if (box === null && branchId && !asked.current.has(branchId)) { asked.current.add(branchId); setBoxM(true) } }, [box, branchId])

  // alerta de stock bajo: se muestra una vez al entrar (por sede o en "Todas las sedes") y se puede reabrir desde la barra superior
  const loadLow = useCallback(async () => {
    const { rows, error } = await fetchLowStock(branchId === 'all' ? null : branchId)
    setLowErr(error); if (error) return setLow([])
    setLow(rows); return rows
  }, [branchId])
  useEffect(() => {
    if (!user || !branchId) return
    const k = user.id + ':' + branchId; let alive = true
    loadLow().then(rows => { if (alive && rows?.length && !alertSeen(k)) { markSeen(k); setLowOpen(true) } })
    const i = setInterval(loadLow, 5 * 60000)
    return () => { alive = false; clearInterval(i) }
  }, [user, branchId, loadLow])
  useEffect(() => { const f = () => loadLow(); window.addEventListener('stock-changed', f); return () => window.removeEventListener('stock-changed', f) }, [loadLow])

  // pedidos web en vivo + sonido
  useEffect(() => {
    if (!user) return
    const ch = supabase.channel('pedidos-web').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales', filter: 'source=eq.web' }, p => {
      const o = p.new; if (!acc.current.includes(o.branch_id)) return
      setToast({ t: `Nuevo pedido ${o.order_number || ''} de ${o.customer_name}: ${money(o.total)}${acc.current.length > 1 ? ' · ' + (names.current[o.branch_id] || '') : ''}`, id: o.id })
      setTimeout(() => setToast(null), 12000); refreshPending(); window.dispatchEvent(new Event('pedido-web'))
      if (cfg.current.notify_enabled !== false) playNotify(cfg.current.notify_sound_url, cfg.current.notify_volume ?? 0.8).then(ok => setBlocked(!ok))
    }).subscribe()
    const i = setInterval(refreshPending, 60000)
    const unlock = () => setBlocked(false); window.addEventListener('pointerdown', unlock)
    return () => { supabase.removeChannel(ch); clearInterval(i); window.removeEventListener('pointerdown', unlock) }
  }, [user, refreshPending])
  useEffect(() => { const f = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false) }; document.addEventListener('pointerdown', f); return () => document.removeEventListener('pointerdown', f) }, [])
  useEffect(() => { if (prof && !isAdmin && ADMIN_ONLY.includes(path.split('/')[2])) r.replace('/admin') }, [path, prof])

  const pick = id => { setSede(id); setBranchId(id); setMenu(false); setBox(undefined) }
  const openBox = async () => { setBe(''); const x = await rpc('open_cash', { p_branch: branchId, p_name: bf.name, p_amount: +bf.amt || 0 }); if (x.error) return setBe(x.error); setBoxM(false); reloadBox() }
  const ctx = useMemo(() => ({ user, prof, isAdmin, branches, allBranches: all, branchId, branch, setBranch: pick, settings, reloadSettings: loadSettings, box, reloadBox, askBox: () => setBoxM(true), pending, refreshPending }),
    [user, prof, isAdmin, branches, all, branchId, branch, settings, box, pending, loadSettings, reloadBox, refreshPending])

  if (!user || !branchId) return <div style={{ padding: 40 }}>{bad || 'Cargando...'} {bad && <Link href="/login" style={{ color: 'var(--red)' }}>Volver al login</Link>}</div>
  const href = s => '/admin' + (s ? '/' + s : '')
  const title = MENU.flatMap(m => m[1]).find(x => href(x[0]) === path)?.[1] || 'Sistema'
  const out = async () => { await supabase.auth.signOut(); setSede(null); clearSeen(); r.push('/login') }
  const label = branchId === 'all' ? 'Todas las sedes' : branch?.name
  const name = prof?.name || user.email.split('@')[0]
  return (<AppCtx.Provider value={ctx}><div className="app">
    <aside className={'side' + (col ? ' col' : '')}>
      <div className="brand"><img src={settings.logo_url || '/logo.png'} alt="Logo" /></div>
      <nav className="menu">{MENU.map(([t, items]) => { const v = items.filter(x => !x[3] || isAdmin); return v.length ? <div key={t}><h6>{t}</h6>{v.map(([s, l, i]) => <Link key={s} href={href(s)} title={l} className={path === href(s) ? 'on' : ''}><Ico n={i} /><span className="lb">{l}</span>{s === 'pedidos' && pending > 0 && <span className="mnbadge">{pending}</span>}</Link>)}</div> : null })}</nav>
      <div className="user"><div className="av">{name[0].toUpperCase()}</div><div className="uinfo"><b>{name}</b><br /><small>{isAdmin ? 'Administrador' : 'Trabajador'}</small></div></div>
    </aside>
    <div className="main">
      <div className="bar">
        <div className="barL"><button className={'tgl' + (col ? ' r' : '')} onClick={toggle} aria-label="Contraer menú"><Ico n="chev" /></button><span>{title}</span></div>
        <div className="barR">
          {blocked && <button className="snd" onClick={() => { setBlocked(false); playNotify(settings.notify_sound_url, settings.notify_volume ?? 0.8) }} title="El navegador bloqueó el sonido. Haz clic para activarlo"><Ico n="mute" s={18} /> Activar sonido</button>}
          {low.length > 0 && <button className="alertb" onClick={() => setLowOpen(true)} title="Productos con stock bajo o agotado"><Ico n="warn" s={18} /> <span className="nbadge">{low.length}</span></button>}
          <button onClick={() => r.push('/admin/pedidos')} title="Pedidos web pendientes"><Ico n="bell" s={18} /> {pending > 0 ? <span className="nbadge">{pending}</span> : 0}</button>
          <div className="sedeW" ref={menuRef}>
            <button className="sedeB" onClick={() => setMenu(!menu)} aria-haspopup="listbox"><Ico n="pin" s={18} /><span>{label}</span><span style={{ transform: menu ? 'rotate(180deg)' : 'none', display: 'grid' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg></span></button>
            {menu && <div className="sedeM"><h6>SEDE</h6>
              {branches.length > 1 && <button className={branchId === 'all' ? 'on' : ''} onClick={() => pick('all')}><span className="ic"><Ico n="layers" /></span><span className="tx"><b>Todas las sedes</b><small>Solo consulta y reportes</small></span>{branchId === 'all' && <Ico n="check" s={18} />}</button>}
              {branches.map(b => <button key={b.id} className={branchId === b.id ? 'on' : ''} onClick={() => pick(b.id)}><span className="ic"><Ico n="store" /></span><span className="tx"><b>{b.name}</b><small>{b.city || b.address || initials(b.name)}</small></span>{branchId === b.id && <Ico n="check" s={18} />}</button>)}
              <button onClick={() => { setSede(null); r.push('/seleccionar-sede') }} style={{ color: 'var(--mut)', fontSize: 13, justifyContent: 'center' }}>Volver a la pantalla de sedes</button></div>}
          </div>
          <div className={'net ' + net.s} title="Estado de la conexión con el servidor"><i />{NET[net.s]}{net.s === 'ok' || net.s === 'slow' ? ` · ${net.ms} ms` : ''}</div>
          <button onClick={out}><Ico n="logout" s={18} /> Salir</button>
        </div>
      </div>
      {lowErr && <p style={{ margin: '0 24px', background: '#fef3c7', padding: 12, borderRadius: 8 }}>⚠ No se pudo cargar la alerta de stock: <b>{lowErr}</b>. Ejecuta <code>supabase/schema_v7.sql</code> en Supabase (SQL Editor) y recarga la página.</p>}
      {toast && <div className="toast" style={{ cursor: 'pointer' }} onClick={() => { setToast(null); r.push('/admin/pedidos') }}>🔔 {toast.t}</div>}
      <div className="page">{children}</div>
    </div>
    {boxM && branchId !== 'all' && <Modal title={`Abrir caja · ${branch?.name || ''}`} onClose={() => setBoxM(false)}>
      <p className="sub" style={{ margin: 0 }}>En cada sede necesitas una caja abierta para registrar ventas.</p><Err e={be} />
      <label>Nombre de la caja</label><input value={bf.name} onChange={e => setBf({ ...bf, name: e.target.value })} />
      <label>Monto inicial en efectivo (S/)</label><input type="number" min="0" value={bf.amt} onChange={e => setBf({ ...bf, amt: e.target.value })} />
      <button className="btn g" onClick={openBox}>Abrir caja</button><button className="btn o" onClick={() => setBoxM(false)}>Ahora no</button></Modal>}
    {lowOpen && low.length > 0 && <StockAlert rows={low} label={label} onClose={() => setLowOpen(false)} />}
  </div></AppCtx.Provider>)
}
