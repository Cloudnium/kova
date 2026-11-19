'use client'
import { useEffect, useState } from 'react'
// Abre /diagnostico para saber por qué no conecta con Supabase después de desplegar
const CLIENT = { NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY }
const NOTE = { SUPABASE_SERVICE_ROLE_KEY: 'Necesaria para crear usuarios', VAPID_PRIVATE_KEY: 'Necesaria para enviar anuncios', VAPID_SUBJECT: 'Necesaria para enviar anuncios', NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'Necesaria para notificaciones', NEXT_PUBLIC_SUPABASE_URL: 'Obligatoria', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'Obligatoria' }
export default function Diagnostico() {
  const [h, setH] = useState(null), [conn, setConn] = useState('...')
  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setH).catch(() => setH({ error: true }))
    if (CLIENT.NEXT_PUBLIC_SUPABASE_URL) fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/health', { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' } }).then(r => setConn(r.ok ? 'ok' : 'Respondió ' + r.status + ' (¿anon key incorrecta?)')).catch(() => setConn('No se pudo conectar (¿URL incorrecta?)'))
    else setConn('Sin URL')
  }, [])
  const needRedeploy = h?.variables && Object.keys(CLIENT).some(k => h.variables[k] && !CLIENT[k])
  const Row = ({ ok, t, n }) => <tr><td style={{ padding: '6px 10px' }}>{ok ? '✅' : '❌'}</td><td style={{ padding: '6px 10px' }}><code>{t}</code></td><td style={{ padding: '6px 10px', color: '#6b6361' }}>{n}</td></tr>
  return (<div style={{ maxWidth: 720, margin: '40px auto', padding: 20, fontFamily: 'system-ui' }}><h1>Diagnóstico del despliegue</h1><p style={{ color: '#6b6361' }}>Entorno: <b>{h?.entorno || '...'}</b></p>
    {needRedeploy && <p style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 10 }}><b>Hay que hacer Redeploy.</b> Las variables existen en Vercel pero esta versión de la web se compiló antes de agregarlas. Vercel → Deployments → ⋯ → Redeploy (desmarca «Use existing Build Cache»).</p>}
    {h?.variables && h.urlValida === false && h.variables.NEXT_PUBLIC_SUPABASE_URL && <p style={{ background: '#fef3c7', padding: 12, borderRadius: 10 }}>La URL de Supabase no tiene el formato <code>https://xxxx.supabase.co</code> (revisa que no tenga «/» al final, comillas ni espacios).</p>}
    <table style={{ borderCollapse: 'collapse' }}><tbody>{h?.variables && Object.entries(h.variables).map(([k, v]) => <Row key={k} ok={v && (!(k in CLIENT) || CLIENT[k])} t={k} n={!v ? 'No existe en el servidor. ' + NOTE[k] : k in CLIENT && !CLIENT[k] ? 'Existe pero no está dentro de la web: Redeploy' : NOTE[k]} />)}</tbody></table>
    <p>Conexión con Supabase desde tu navegador: <b>{conn === 'ok' ? '✅ correcta' : '❌ ' + conn}</b></p>
    <p><a href="/login" style={{ color: '#d7202b' }}>Ir al login</a></p></div>)
}
