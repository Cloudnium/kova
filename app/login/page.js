'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, SUPA_OK, setSede } from '../../lib/supabase'

const COLS = [
  [['/login1.jpg', '1/1'], ['/login3.jpg', '3/4'], ['/login4.jpg', '4/3'], ['/login2.jpg', '1/1']],
  [['/login2.jpg', '3/4'], ['/login4.jpg', '1/1'], ['/login1.jpg', '4/3'], ['/login3.jpg', '1/1']]
]
const I = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
export default function Login() {
  const r = useRouter(), [e, setE] = useState(''), [p, setP] = useState(''), [show, setShow] = useState(false), [err, setErr] = useState(''), [load, setLoad] = useState(false)
  const go = async ev => {
    ev.preventDefault(); setErr('')
    if (!SUPA_OK) return setErr('Falta configurar .env.local con las claves de Supabase. Reinicia npm run dev después.')
    setLoad(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: e, password: p })
      if (error) { const m = error.message; setErr(m.includes('Invalid login') ? 'Correo o contraseña incorrectos.' : m.includes('not confirmed') ? 'Confirma el usuario en Supabase (Auto Confirm).' : m); setLoad(false) }
      else { setSede(null); r.push('/seleccionar-sede') }
    } catch (x) { setErr('No se pudo conectar con Supabase. Revisa la URL y la anon key en .env.local.'); setLoad(false) }
  }
  return (<div className="lg">
    <aside className="lg-art" aria-hidden="true">
      {COLS.map((col, c) => <div key={c} className="lg-col"><div className="lg-track" style={{ animationDuration: c ? '60s' : '48s' }}>
        {[0, 1].map(k => <div key={k} className="lg-set">{col.map(([src, ar], i) => <img key={i} src={src} alt="" style={{ aspectRatio: ar }} />)}</div>)}
      </div></div>)}
    </aside>
    <main className="lg-form">
      <form onSubmit={go}>
        <div className="lg-logo"><img src="/logo.png" alt="Kova" /></div>
        <h1>Bienvenido de nuevo</h1>
        <p className="lg-sub">Ingresa tus credenciales para acceder al sistema.</p>
        <label>Correo electrónico</label>
        <div className="lg-field"><svg width="20" height="20" viewBox="0 0 24 24" {...I}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
          <input type="email" required placeholder="correo@ejemplo.com" value={e} onChange={x => setE(x.target.value)} /></div>
        <label>Contraseña</label>
        <div className="lg-field"><svg width="20" height="20" viewBox="0 0 24 24" {...I}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          <input type={show ? 'text' : 'password'} required placeholder="••••••••" value={p} onChange={x => setP(x.target.value)} />
          <button type="button" aria-label="Mostrar contraseña" onClick={() => setShow(!show)}><svg width="20" height="20" viewBox="0 0 24 24" {...I}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{show && <path d="M4 4l16 16" />}</svg></button></div>
        {err && <small className="lg-err">{err}</small>}
        <button className="lg-btn" disabled={load}>{load ? 'Ingresando...' : 'Iniciar sesión  →'}</button>
        <small className="lg-foot">Sistema Kova · v1.0.0</small>
      </form>
    </main>
  </div>)
}
