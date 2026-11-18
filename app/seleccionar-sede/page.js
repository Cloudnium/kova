'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, setSede, initials, settingsMap } from '../../lib/supabase'
import { applyBrand } from '../../lib/brand'
import { Ico } from '../../lib/icons'

const COLS = [
  [['/login1.jpg', '1/1'], ['/login3.jpg', '3/4'], ['/login4.jpg', '4/3'], ['/login2.jpg', '1/1']],
  [['/login2.jpg', '3/4'], ['/login4.jpg', '1/1'], ['/login1.jpg', '4/3'], ['/login3.jpg', '1/1']]
]
export default function SeleccionarSede() {
  const r = useRouter(), [d, setD] = useState(null), [err, setErr] = useState('')
  const pick = id => { setSede(id); r.push('/admin') }
  useEffect(() => { (async () => {
    const { data } = await supabase.auth.getSession(), u = data.session?.user
    if (!u) return r.replace('/login')
    const [p, b, s] = await Promise.all([supabase.from('profiles').select('*').eq('id', u.id).single(), supabase.from('branches').select('*').order('created_at'), supabase.from('settings').select('*')])
    if (p.error || b.error) return setErr((p.error || b.error).message + '. ¿Ejecutaste supabase/schema_v5.sql?')
    const prof = p.data, cfg = settingsMap(s.data); applyBrand(cfg.brand_color)
    if (prof.active === false) { await supabase.auth.signOut(); return r.replace('/login') }
    const list = (b.data || []).filter(x => x.active !== false && (prof.role === 'administrador' || (prof.branch_ids || []).includes(x.id)))
    if (list.length === 1) return pick(list[0].id)
    setD({ prof, list, cfg })
  })() }, [])
  const out = async () => { await supabase.auth.signOut(); setSede(null); r.replace('/login') }
  const name = d && (d.prof.name || d.prof.email.split('@')[0]).split(' ')[0]
  return (<div className="lg">
    <aside className="lg-art" aria-hidden="true">{COLS.map((col, c) => <div key={c} className="lg-col"><div className="lg-track" style={{ animationDuration: c ? '60s' : '48s' }}>
      {[0, 1].map(k => <div key={k} className="lg-set">{col.map(([src, ar], i) => <img key={i} src={src} alt="" style={{ aspectRatio: ar }} />)}</div>)}</div></div>)}</aside>
    <main className="lg-form"><div className="sd">
      {err && <p className="lg-err">{err}</p>}
      {!d && !err && <p className="lg-sub">Cargando tus sedes...</p>}
      {d && <>
        <div className="sd-logo"><img src={d.cfg.logo_url || '/logo.png'} alt="" /></div>
        <h1>Hola, {name[0].toUpperCase() + name.slice(1)}</h1>
        <p className="lg-sub">¿En qué sede vas a trabajar hoy? Podrás cambiarla cuando quieras.</p>
        {d.list.map(b => <button key={b.id} className="sd-card" onClick={() => pick(b.id)}>
          <span className="sd-ini">{initials(b.name)}</span>
          <span className="sd-tx"><b>{b.name}</b><small><Ico n="pin" s={14} /> {b.address || b.city || 'Sin dirección'}</small></span><Ico n="arrow" s={18} /></button>)}
        {!d.list.length && <p className="lg-err" style={{ margin: '0 0 16px' }}>No tienes sedes asignadas. Pide al administrador que te asigne una.</p>}
        {d.list.length > 1 && <button className="sd-all" onClick={() => pick('all')}><Ico n="check" s={18} /> Ver todas mis sedes (solo consulta y reportes)</button>}
        <button className="sd-other" onClick={out}>Usar otra cuenta</button>
        <small className="lg-foot">Sistema {d.cfg.business_name || 'Kova'} · v2.0.0</small></>}
    </div></main></div>)
}
