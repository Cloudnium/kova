'use client'
import { useEffect, useRef, useState } from 'react'

const initial = () => ({
  date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }),
  name: '', docType: 'DNI', docNumber: '', nationality: 'Peruana', address: '', phone: '', email: '',
  product: '', order: '', amount: '', kind: 'Reclamo', detail: '', desire: 'No solicito conciliación',
  accept: false, website: ''
})

export function ClaimModal({ onClose, onPrivacy, onStatus }) {
  const [f, setF] = useState(initial), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(null)
  const closeRef = useRef(null), headRef = useRef(null), downOnBg = useRef(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  // Hay datos escritos → no cerrar sin avisar (y nunca por un clic suelto fuera de la ventana)
  const dirty = !done && ['name', 'docNumber', 'address', 'phone', 'email', 'product', 'order', 'amount', 'detail'].some(k => String(f[k] || '').trim())
  // onClose llega como función nueva en cada render de la tienda: se guarda en una ref para que el efecto
  // de abajo corra UNA sola vez (antes se reiniciaba solo → robaba el foco, subía el scroll y cerraba el modal)
  const onCloseRef = useRef(onClose), dirtyRef = useRef(dirty)
  onCloseRef.current = onClose; dirtyRef.current = dirty
  const requestClose = () => {
    if (dirtyRef.current && !window.confirm('¿Cerrar el Libro de Reclamaciones? Se perderán los datos que ingresaste.')) return
    onCloseRef.current()
  }
  const requestCloseRef = useRef(requestClose); requestCloseRef.current = requestClose

  useEffect(() => {
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus({ preventScroll: true })
    const key = e => { if (e.key === 'Escape' && !document.querySelector('.legal-bg:not(.claim-bg)')) requestCloseRef.current() }
    window.addEventListener('keydown', key)
    return () => { document.body.style.overflow = before; window.removeEventListener('keydown', key) }
  }, [])

  useEffect(() => { if (done) headRef.current?.focus() }, [done])

  const submit = async e => {
    e.preventDefault(); setErr('')
    if (!f.accept) return setErr('Debes aceptar el tratamiento de tus datos para enviar el reclamo.')
    setBusy(true)
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 30000)
    try {
      const r = await fetch('/api/reclamos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f), signal: ctl.signal
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d.error) throw new Error(d.error || 'No se pudo enviar tu reclamo. Inténtalo de nuevo.')
      setDone(d)
    } catch (e2) {
      setErr(e2.name === 'AbortError' ? 'El envío tardó demasiado. Revisa tu conexión e inténtalo de nuevo (tus datos siguen aquí).' : (e2.message || 'No se pudo enviar tu reclamo. Revisa tu conexión e inténtalo de nuevo.'))
    }
    clearTimeout(timer)
    setBusy(false)
  }

  return <div className="legal-bg claim-bg" onMouseDown={e => { downOnBg.current = e.target === e.currentTarget }} onClick={e => { if (downOnBg.current && e.target === e.currentTarget && !dirty) onClose(); downOnBg.current = false }}>
    <section className="legal-win claim-win" role="dialog" aria-modal="true" aria-labelledby="claim-title">
      <header className="legal-head">
        <div><small>ATENCIÓN AL CLIENTE · KOVA</small><h2 id="claim-title">Libro de Reclamaciones</h2><p>Registra tu queja o reclamo. Te responderemos a la brevedad.</p></div>
        <button ref={closeRef} className="legal-x" type="button" aria-label="Cerrar libro de reclamaciones" onClick={requestClose}>✕</button>
      </header>

      {done ? <div className="claim-done" ref={headRef} tabIndex={-1}>
        <div className="claim-check">✓</div>
        <h3>Reclamo registrado correctamente</h3>
        <p>Tu código de registro es <b>{done.code}</b>. Tu reclamo ya está en manos de nuestra área de atención al cliente. Guarda este código: con él y tu número de documento puedes consultar el estado y la respuesta desde el pie de página de la tienda.</p>
        <div className="claim-actions">{onStatus && <button className="btn o" type="button" onClick={onStatus}>Consultar mi reclamo</button>}<button className="btn o" type="button" onClick={() => { setDone(null); setF(initial()); setErr('') }}>Enviar otro reclamo</button><button className="btn" type="button" onClick={onClose}>Cerrar</button></div>
      </div> : <form className="claim-form" onSubmit={submit}>
        <div className="claim-body">
          {err && <p className="legal-err">⚠ {err}</p>}
          <fieldset className="claim-sec"><legend><i>1</i> Identificación del consumidor</legend>
            <div className="claim-grid">
              <label className="cl"><span>Fecha<b className="rq"> *</b></span><input type="date" value={f.date} onChange={e => set('date', e.target.value)} required /></label>
              <label className="cl"><span>Nombre y apellido completo<b className="rq"> *</b></span><input type="text" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Ej. María Pérez Rojas" maxLength={120} required /></label>
              <label className="cl">Tipo de documento<select value={f.docType} onChange={e => set('docType', e.target.value)}><option>DNI</option><option>CE</option><option>Pasaporte</option><option>RUC</option><option>Otro</option></select></label>
              <label className="cl"><span>Número de documento<b className="rq"> *</b></span><input type="text" value={f.docNumber} onChange={e => set('docNumber', e.target.value)} placeholder="Ej. 12345678" maxLength={30} required /></label>
              <label className="cl">Nacionalidad<input type="text" value={f.nationality} onChange={e => set('nationality', e.target.value)} maxLength={60} /></label>
              <label className="cl"><span>Teléfono / celular<b className="rq"> *</b></span><input type="tel" inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="Ej. 987654321" maxLength={30} required /></label>
              <label className="cl cl-full"><span>Correo electrónico<b className="rq"> *</b></span><input type="email" autoComplete="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="Ej. maria@correo.com" maxLength={120} required /></label>
              <label className="cl cl-full"><span>Domicilio / dirección<b className="rq"> *</b></span><input type="text" value={f.address} onChange={e => set('address', e.target.value)} placeholder="Calle, número, distrito, ciudad" maxLength={220} required /></label>
            </div>
          </fieldset>

          <fieldset className="claim-sec"><legend><i>2</i> Detalle del reclamo</legend>
            <div className="claim-grid">
              <label className="cl"><span>Producto o servicio<b className="rq"> *</b></span><input type="text" value={f.product} onChange={e => set('product', e.target.value)} placeholder="Ej. Pedido de licores / delivery" maxLength={160} required /></label>
              <label className="cl">Número de pedido u operación<input type="text" value={f.order} onChange={e => set('order', e.target.value)} placeholder="Si lo tienes a la mano" maxLength={60} /></label>
              <label className="cl">Tipo<select value={f.kind} onChange={e => set('kind', e.target.value)}><option>Reclamo</option><option>Queja</option></select></label>
              <label className="cl">Monto reclamado (S/)<input type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" /></label>
              <label className="cl cl-full"><span>Descripción de los hechos<b className="rq"> *</b></span><textarea rows={5} value={f.detail} onChange={e => set('detail', e.target.value)} placeholder="Cuéntanos qué ocurrió, cuándo y qué solución esperas..." maxLength={3000} required /></label>
              <label className="cl cl-full">¿Qué deseas?<select value={f.desire} onChange={e => set('desire', e.target.value)}><option>No solicito conciliación</option><option>Solicito conciliación</option></select></label>
            </div>
          </fieldset>

          <label className="claim-checkbox"><input type="checkbox" checked={f.accept} onChange={e => set('accept', e.target.checked)} required /><span>Acepto el tratamiento de mis datos personales para la atención de este reclamo, conforme a la <button type="button" onClick={e => { e.preventDefault(); onPrivacy() }}>Política de Privacidad</button> de KOVA.</span></label>
          <div className="claim-hp" aria-hidden="true"><label>Sitio web<input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => set('website', e.target.value)} /></label></div>
        </div>
        <footer className="legal-foot"><span>Todos los campos marcados con * son obligatorios</span><button className="btn" type="submit" disabled={busy}>{busy ? 'Enviando...' : 'Enviar reclamo'}</button></footer>
      </form>}
    </section>
  </div>
}

const ST = { pendiente: 'Pendiente', en_proceso: 'En proceso', atendido: 'Atendido' }
const fmt = d => d ? new Date(d).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }) : ''

// El cliente consulta su reclamo con código + número de documento
export function ClaimStatusModal({ onClose, onNew }) {
  const [code, setCode] = useState(''), [doc, setDoc] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState(null), closeRef = useRef(null)
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose
  useEffect(() => {
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus({ preventScroll: true })
    const key = e => { if (e.key === 'Escape' && !document.querySelector('.legal-bg:not(.claim-bg)')) onCloseRef.current() }
    window.addEventListener('keydown', key)
    return () => { document.body.style.overflow = before; window.removeEventListener('keydown', key) }
  }, [])
  const submit = async e => {
    e.preventDefault(); setErr(''); setRes(null); setBusy(true)
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000)
    try {
      const r = await fetch('/api/reclamos/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, doc }), signal: ctl.signal })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d.error) throw new Error(d.error || 'No se pudo consultar tu reclamo. Inténtalo de nuevo.')
      setRes(d.claim)
    } catch (e2) { setErr(e2.name === 'AbortError' ? 'La consulta tardó demasiado. Revisa tu conexión e inténtalo de nuevo.' : (e2.message || 'No se pudo consultar tu reclamo.')) }
    clearTimeout(timer); setBusy(false)
  }
  return <div className="legal-bg claim-bg" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="legal-win claim-win" style={{ height: 'auto', maxHeight: 'calc(100vh - 36px)' }} role="dialog" aria-modal="true" aria-labelledby="claimst-title">
      <header className="legal-head">
        <div><small>ATENCIÓN AL CLIENTE · KOVA</small><h2 id="claimst-title">Consultar mi reclamo</h2><p>Ingresa el código que recibiste al registrarlo y tu número de documento.</p></div>
        <button ref={closeRef} className="legal-x" type="button" aria-label="Cerrar consulta" onClick={onClose}>✕</button>
      </header>
      <form className="claim-body" onSubmit={submit}>
        <div className="claim-st">
          {err && <p className="legal-err">⚠ {err}</p>}
          <label className="cl"><span>Código del reclamo<b className="rq"> *</b></span><input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Ej. LR-20261124-A1B2C3" maxLength={40} autoComplete="off" required /></label>
          <label className="cl"><span>Número de documento<b className="rq"> *</b></span><input type="text" value={doc} onChange={e => setDoc(e.target.value)} placeholder="El mismo que usaste al registrarlo" maxLength={30} autoComplete="off" required /></label>
          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Consultando...' : 'Consultar'}</button>
          {res && <div className="claim-res" role="status">
            <h4>{res.kind} {res.code}<span className={'tag ' + (res.status === 'atendido' ? 'g' : res.status === 'pendiente' ? 'y' : '')}>{ST[res.status] || res.status}</span></h4>
            <p><b>Registrado:</b> {fmt(res.created_at)}</p><p><b>Producto o servicio:</b> {res.product}</p>
            {res.response ? <><p><b>Respuesta{res.responded_at ? ' (' + fmt(res.responded_at) + ')' : ''}:</b></p><p>{res.response}</p></> : <p>Aún no hay una respuesta. Estamos revisando tu caso y te contactaremos a la brevedad.</p>}
          </div>}
          {onNew && <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13 }}>¿Aún no registraste tu reclamo? <button type="button" onClick={onNew} style={{ background: 'none', border: 0, color: 'var(--red)', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Abrir el Libro de Reclamaciones</button></p>}
        </div>
      </form>
    </section>
  </div>
}
