'use client'
import { useEffect, useState } from 'react'
import { supabase, audit } from '../../../lib/supabase'
import { useApp } from '../../../lib/branch'
import { Head, Err } from '../../../lib/ui'
import { compressImage, upload, publicUrl, rnd } from '../../../lib/images'
import { playNotify } from '../../../lib/sound'
import { applyBrand } from '../../../lib/brand'
const KEYS = ['business_name', 'business_ruc', 'ticket_footer', 'logo_url', 'ticket_logo_url', 'brand_color', 'yape_number', 'yape_name', 'yape_qr_url', 'notify_enabled', 'notify_sound_url', 'notify_volume', 'whatsapp']
export default function Config() {
  const { settings, reloadSettings } = useApp(), [f, setF] = useState(null), [msg, setMsg] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState('')
  useEffect(() => { if (!f) setF({ brand_color: '#d7202b', notify_enabled: true, notify_volume: 0.8, ...settings }) }, [settings])
  if (!f) return null
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const up = async (k, file, kind) => {
    if (!file) return; setBusy(k); setErr('')
    try {
      let body = file, ct = file.type, ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (kind === 'img') { const png = /png/.test(file.type); body = await compressImage(file, { max: 900, type: png ? 'image/png' : 'image/webp' }); ct = body.type; ext = png ? 'png' : 'webp' }
      if (kind === 'audio' && file.size > 3 * 1024 * 1024) throw new Error('El audio pesa más de 3 MB. Usa uno corto (unos segundos).')
      const path = await upload('assets', `${k}/${rnd()}.${ext}`, body, ct); set(k, publicUrl('assets', path))
    } catch (e) { setErr('No se pudo subir: ' + e.message + '. ¿Ejecutaste schema_v5.sql? Solo el administrador puede subir.') }
    setBusy('')
  }
  const save = async () => {
    setErr(''); setMsg(''); const rows = KEYS.filter(k => f[k] !== undefined).map(k => ({ key: k, value: f[k] ?? null, updated_at: new Date().toISOString() }))
    const { error } = await supabase.from('settings').upsert(rows); if (error) return setErr(error.message)
    await reloadSettings(); audit('Configuración guardada', ''); setMsg('Cambios guardados.')
  }
  const Up = ({ k, label, kind, accept, hint, children }) => <div style={{ display: 'grid', gap: 8 }}><label>{label}</label>{hint && <small style={{ color: 'var(--mut)' }}>{hint}</small>}{children}
    <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}><label className="btn o mini" style={{ cursor: 'pointer', margin: 0 }}>{busy === k ? 'Subiendo...' : 'Subir archivo'}<input type="file" hidden accept={accept} disabled={!!busy} onChange={e => { up(k, e.target.files[0], kind); e.target.value = '' }} /></label>
      {f[k] && <button className="btn o mini" onClick={() => set(k, null)}>Quitar</button>}</div></div>
  return (<><Head t="Configuración" s="Datos del negocio, marca, pagos de la tienda web y sonido de pedidos"><button className="btn" onClick={save}>Guardar cambios</button></Head><Err e={err} />{msg && <p style={{ background: '#dcfce7', padding: 10, borderRadius: 8, marginBottom: 12 }}>✓ {msg}</p>}
    <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', alignItems: 'start' }}>
      <div className="panel" style={{ display: 'grid', gap: 10 }}><b>Negocio y tickets</b>
        <label>Nombre comercial</label><input value={f.business_name || ''} onChange={e => set('business_name', e.target.value)} />
        <label>RUC (sale en el ticket)</label><input value={f.business_ruc || ''} maxLength={11} onChange={e => set('business_ruc', e.target.value.replace(/\D/g, ''))} />
        <label>Mensaje al pie del ticket</label><input placeholder="Gracias por su compra" value={f.ticket_footer || ''} onChange={e => set('ticket_footer', e.target.value)} />
        <label>WhatsApp de la tienda (con código de país)</label><input placeholder="51999999999" value={f.whatsapp || ''} onChange={e => set('whatsapp', e.target.value.replace(/\D/g, ''))} />
        <Up k="ticket_logo_url" label="Logo para tickets y PDF" kind="img" accept="image/*" hint="Úsalo con fondo claro/transparente: se imprime en blanco y negro o a color sobre papel.">{f.ticket_logo_url && <img src={f.ticket_logo_url} alt="" style={{ maxHeight: 70, objectFit: 'contain', alignSelf: 'start' }} />}</Up></div>
      <div className="panel" style={{ display: 'grid', gap: 10 }}><b>Marca del sistema</b>
        <Up k="logo_url" label="Logo del sistema y la tienda (fondo oscuro)" kind="img" accept="image/*" hint="Se ve sobre fondo negro en el menú, el login y la tienda.">{f.logo_url && <img src={f.logo_url} alt="" style={{ maxHeight: 70, objectFit: 'contain', background: '#000', padding: 8, borderRadius: 10, alignSelf: 'start' }} />}</Up>
        <label>Color principal</label><div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}><input type="color" style={{ width: 60, padding: 2, height: 38 }} value={f.brand_color || '#d7202b'} onChange={e => { set('brand_color', e.target.value); applyBrand(e.target.value) }} /><small>{f.brand_color}</small><button className="btn o mini" onClick={() => { set('brand_color', '#d7202b'); applyBrand('#d7202b') }}>Restaurar</button></div></div>
      <div className="panel" style={{ display: 'grid', gap: 10 }}><b>Pagos de la tienda web (Yape)</b>
        <label>Número de Yape</label><input value={f.yape_number || ''} onChange={e => set('yape_number', e.target.value)} /><label>Titular</label><input value={f.yape_name || ''} onChange={e => set('yape_name', e.target.value)} />
        <Up k="yape_qr_url" label="QR de Yape" kind="img" accept="image/*" hint="Se muestra al cliente cuando elige «Pagar ahora».">{f.yape_qr_url && <img src={f.yape_qr_url} alt="QR Yape" style={{ maxWidth: 190, borderRadius: 10, alignSelf: 'start' }} />}</Up></div>
      <div className="panel" style={{ display: 'grid', gap: 10 }}><b>Sonido de pedidos web</b>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.notify_enabled !== false} onChange={e => set('notify_enabled', e.target.checked)} /> Reproducir sonido al llegar un pedido</label>
        <Up k="notify_sound_url" label="Sonido personalizado (.mp3)" kind="audio" accept="audio/mpeg,audio/*,.mp3" hint={f.notify_sound_url ? 'Usando tu sonido personalizado.' : 'Ahora suena el timbre por defecto. Sube un .mp3 corto para cambiarlo.'}>{f.notify_sound_url && <audio controls src={f.notify_sound_url} style={{ width: '100%' }} />}</Up>
        <label>Volumen: {Math.round((f.notify_volume ?? 0.8) * 100)}%</label><input type="range" min="0.1" max="1" step="0.05" value={f.notify_volume ?? 0.8} onChange={e => set('notify_volume', +e.target.value)} />
        <button className="btn o" onClick={() => playNotify(f.notify_sound_url, f.notify_volume ?? 0.8)}>▶ Probar sonido</button>
        <small style={{ color: 'var(--mut)' }}>Si el navegador bloquea el sonido verás un botón «Activar sonido» arriba: un clic basta. Mantén una pestaña del sistema abierta para oír los pedidos.</small></div>
    </div></>)
}
