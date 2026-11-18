'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase, fmtDate } from '../../../lib/supabase'
import { useApp } from '../../../lib/branch'
import { Head, Err } from '../../../lib/ui'
import { compressImage, upload, publicUrl, rnd } from '../../../lib/images'
import { PUBLIC_KEY, pushSupported, getSubscription, subJSON } from '../../../lib/push'
const E = { title: '', body: '', url: '/', image: '', branch_id: '' }
export default function Anuncios() {
  const { allBranches, settings } = useApp(), [f, setF] = useState(E), [subs, setSubs] = useState(null), [hist, setHist] = useState([]), [err, setErr] = useState(''), [ok, setOk] = useState(''), [busy, setBusy] = useState(''), [counts, setCounts] = useState({})
  const load = useCallback(async () => {
    const [s, h] = await Promise.all([supabase.from('push_subscriptions').select('branch_id'), supabase.from('push_announcements').select('*').order('created_at', { ascending: false }).limit(30)])
    if (s.error || h.error) return setErr((s.error || h.error).message + '. ¿Ejecutaste supabase/schema_v6.sql?')
    const c = {}; (s.data || []).forEach(x => c[x.branch_id || 'none'] = (c[x.branch_id || 'none'] || 0) + 1); setCounts(c); setSubs(s.data.length); setHist(h.data || [])
  }, [])
  useEffect(() => { load() }, [load])
  const audience = f.branch_id ? counts[f.branch_id] || 0 : subs || 0
  const call = async body => { const { data } = await supabase.auth.getSession(); return fetch('/api/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify(body) }).then(r => r.json()) }
  const payload = () => ({ title: f.title, body: f.body, url: f.url || '/', image: f.image || null, branch_id: f.branch_id || null })
  const img = async file => { if (!file) return; setBusy('img'); setErr(''); try { const blob = await compressImage(file, { max: 1200 }), path = await upload('assets', `push/${rnd()}.webp`, blob, 'image/webp'); setF(x => ({ ...x, image: publicUrl('assets', path) })) } catch (e) { setErr('No se pudo subir la imagen: ' + e.message) } setBusy('') }
  const test = async () => {
    setErr(''); setOk(''); setBusy('test')
    try { const sub = await getSubscription(true), r = await call({ ...payload(), test: subJSON(sub) }); r.error ? setErr(r.error) : setOk('Prueba enviada: debería aparecer en este dispositivo en unos segundos.') }
    catch (e) { setErr(e.message === 'denied' ? 'Bloqueaste las notificaciones en este navegador. Actívalas desde el candado de la barra de direcciones.' : e.message) }
    setBusy('')
  }
  const send = async () => {
    if (!window.confirm(`¿Enviar este anuncio a ${audience} dispositivo(s)? No se puede deshacer.`)) return
    setErr(''); setOk(''); setBusy('send'); const r = await call(payload()).catch(e => ({ error: e.message })); setBusy('')
    if (r.error) return setErr(r.error); setOk(`Anuncio enviado a ${r.sent} dispositivo(s)${r.failed ? ` (${r.failed} fallaron${r.removed ? `, ${r.removed} ya no estaban activos y se eliminaron` : ''})` : ''}.`); setF(E); load()
  }
  const bname = id => allBranches.find(b => b.id === id)?.name || 'Todos'
  const valid = f.title.trim() && f.body.trim()
  return (<><Head t="Anuncios" s="Envía ofertas y novedades como notificación al celular, tablet o computadora de tus clientes" /><Err e={err} />{ok && <p style={{ background: '#dcfce7', padding: 10, borderRadius: 8, marginBottom: 12 }}>✓ {ok}</p>}
    {!PUBLIC_KEY && <p style={{ background: '#fef3c7', padding: 12, borderRadius: 8, marginBottom: 12 }}>Falta configurar las claves de notificaciones. Genera un par con <code>npx web-push generate-vapid-keys</code> y agrega <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>, <code>VAPID_PRIVATE_KEY</code> y <code>VAPID_SUBJECT</code> a tu <code>.env.local</code> (o a las variables de tu hosting) y reinicia.</p>}
    <div className="kpis"><div className="kpi" style={{ borderLeftColor: 'var(--ok)' }}><span>Clientes suscritos</span><b>{subs ?? '...'}</b><small>dispositivos que aceptaron avisos</small></div><div className="kpi"><span>Anuncios enviados</span><b>{hist.length}</b></div></div>
    <div className="two" style={{ gridTemplateColumns: '1.3fr 1fr' }}><div className="panel" style={{ display: 'grid', gap: 10, alignContent: 'start' }}><b>Nuevo anuncio</b>
      <label>Título ({f.title.length}/65)</label><input maxLength={65} placeholder="🔥 2x1 en ron este fin de semana" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
      <label>Mensaje ({f.body.length}/240)</label><textarea rows={3} maxLength={240} placeholder="Solo hasta el domingo. Haz tu pedido en la web." value={f.body} onChange={e => setF({ ...f, body: e.target.value })} style={{ resize: 'vertical' }} />
      <div className="fgrid"><div><label>Al tocar, abrir</label><select value={f.url} onChange={e => setF({ ...f, url: e.target.value })}><option value="/">La tienda</option><option value="/#cat">El catálogo</option></select></div>
        <div><label>Enviar a</label><select value={f.branch_id} onChange={e => setF({ ...f, branch_id: e.target.value })}><option value="">Todos los suscritos ({subs ?? 0})</option>{allBranches.filter(b => b.active !== false).map(b => <option key={b.id} value={b.id}>Clientes de {b.name} ({counts[b.id] || 0})</option>)}</select></div></div>
      <label>Imagen grande (opcional)</label><div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}><label className="btn o mini" style={{ cursor: 'pointer', margin: 0 }}>{busy === 'img' ? 'Subiendo...' : 'Subir imagen'}<input type="file" hidden accept="image/*" disabled={!!busy} onChange={e => { img(e.target.files[0]); e.target.value = '' }} /></label>{f.image && <button className="btn o mini" onClick={() => setF({ ...f, image: '' })}>Quitar</button>}</div>
      <small style={{ color: 'var(--mut)' }}>La imagen se muestra en Android y escritorio; en iPhone solo se ve el texto.</small>
      <div className="row" style={{ gap: 8, marginTop: 4 }}><button className="btn o" style={{ flex: 1 }} disabled={!valid || !!busy || !pushSupported()} onClick={test}>{busy === 'test' ? 'Enviando...' : '🔔 Enviar prueba a este dispositivo'}</button>
        <button className="btn g" style={{ flex: 1 }} disabled={!valid || !!busy || !audience} onClick={send}>{busy === 'send' ? 'Enviando...' : `Enviar a ${audience}`}</button></div></div>
      <div className="panel" style={{ alignContent: 'start' }}><b>Así lo verá el cliente</b>
        <div style={{ background: '#2b2b2e', borderRadius: 14, padding: 12, color: '#fff', marginTop: 12, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10 }}><img src="/icon-192.png" alt="" style={{ width: 40, height: 40, borderRadius: 8 }} /><div style={{ minWidth: 0 }}><small style={{ color: '#aaa' }}>{settings.business_name || 'KOVA'} · ahora</small><br /><b style={{ wordBreak: 'break-word' }}>{f.title || 'Título del anuncio'}</b><div style={{ fontSize: 13, color: '#ddd', wordBreak: 'break-word' }}>{f.body || 'Aquí va el mensaje que verá tu cliente.'}</div></div></div>
          {f.image && <img src={f.image} alt="" style={{ width: '100%', borderRadius: 8, maxHeight: 160, objectFit: 'cover' }} />}</div>
        <small style={{ color: 'var(--mut)', display: 'block', marginTop: 12 }}>Los clientes aceptan los avisos desde la tienda. Si cambian de opinión pueden bloquearlos en su navegador; los dispositivos que ya no reciben se eliminan solos.</small></div></div>
    <div className="panel" style={{ marginTop: 16 }}><b>Historial</b><table><thead><tr><th>Fecha</th><th>Anuncio</th><th>Audiencia</th><th>Enviados</th><th>Fallidos</th><th>Por</th></tr></thead><tbody>
      {hist.map(h => <tr key={h.id}><td>{fmtDate(h.created_at)}</td><td><b>{h.title}</b><br /><small>{h.body}</small></td><td>{h.branch_id ? bname(h.branch_id) : 'Todos'}</td><td><span className="tag g">{h.sent}</span></td><td>{h.failed > 0 ? <span className="tag r">{h.failed}</span> : 0}</td><td><small>{h.created_by}</small></td></tr>)}
      {!hist.length && <tr><td colSpan="6">Aún no has enviado anuncios.</td></tr>}</tbody></table></div></>)
}
