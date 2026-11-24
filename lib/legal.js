'use client'
import { useEffect, useRef, useState } from 'react'

const DOCS = {
  terminos: { file: 'terminos', title: 'Términos y Condiciones', sub: 'Condiciones de uso y compra en KOVA' },
  privacidad: { file: 'privacidad', title: 'Políticas de Privacidad', sub: 'Tratamiento y protección de tus datos personales' }
}

function inline(text) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

function parse(text) {
  const lines = String(text).split(/\r?\n/), out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    let m = line.match(/^#{2,3}\s+(.+)$/)
    if (m) { out.push({ type: line.startsWith('###') ? 'h4' : 'h3', text: m[1] }); i++; continue }
    m = line.match(/^\*\*(.+)\*\*$/)
    if (m) { out.push({ type: /derechos reservados/i.test(m[1]) ? 'center' : 'h3', text: m[1] }); i++; continue }
    if (/^[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*]\s+/, '')); i++ }
      out.push({ type: 'ul', items }); continue
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s+/, '')); i++ }
      out.push({ type: 'ol', items }); continue
    }
    out.push({ type: 'p', text: line }); i++
  }
  return out
}

export function LegalModal({ doc, onClose }) {
  const data = DOCS[doc] || DOCS.terminos
  const [text, setText] = useState(''), [error, setError] = useState('')
  const closeRef = useRef(null), bodyRef = useRef(null)

  useEffect(() => {
    let live = true
    setText(''); setError('')
    fetch(`/legal/${data.file}.txt`)
      .then(r => { if (!r.ok) throw new Error('No se pudo cargar el documento.'); return r.text() })
      .then(t => { if (live) setText(t) })
      .catch(e => { if (live) setError(e.message || 'No se pudo cargar el documento.') })
    return () => { live = false }
  }, [data.file])

  useEffect(() => {
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const key = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => { document.body.style.overflow = before; window.removeEventListener('keydown', key) }
  }, [onClose])

  useEffect(() => { if (text && bodyRef.current) bodyRef.current.scrollTop = 0 }, [text])

  return <div className="legal-bg" onMouseDown={onClose}>
    <section className="legal-win" role="dialog" aria-modal="true" aria-labelledby="legal-title" onMouseDown={e => e.stopPropagation()}>
      <header className="legal-head">
        <div><small>INFORMACIÓN LEGAL · KOVA</small><h2 id="legal-title">{data.title}</h2><p>{data.sub}</p></div>
        <button ref={closeRef} className="legal-x" type="button" aria-label="Cerrar documento" onClick={onClose}>✕</button>
      </header>
      <div className="legal-body" ref={bodyRef} tabIndex={0}>
        {error && <p className="legal-err">⚠ {error}</p>}
        {!error && !text && <div className="legal-load"><span /><span /><span /></div>}
        {!error && text && <article className="legal-doc">{parse(text).map((b, i) => {
          if (b.type === 'h3') return <h3 key={i}>{inline(b.text)}</h3>
          if (b.type === 'h4') return <h4 key={i}>{inline(b.text)}</h4>
          if (b.type === 'ul') return <ul key={i}>{b.items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>
          if (b.type === 'ol') return <ol key={i}>{b.items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ol>
          if (b.type === 'center') return <p className="legal-end" key={i}>{inline(b.text)}</p>
          return <p key={i}>{inline(b.text)}</p>
        })}</article>}
      </div>
      <footer className="legal-foot"><span>Documento vigente · KOVA</span><button className="btn" type="button" onClick={onClose}>Entendido</button></footer>
    </section>
  </div>
}
