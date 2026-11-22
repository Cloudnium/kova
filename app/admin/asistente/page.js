'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
// El asistente ahora es una burbuja flotante en todo el sistema
export default function Asistente() { const r = useRouter(); useEffect(() => { r.replace('/admin'); setTimeout(() => window.dispatchEvent(new Event('open-assistant')), 600) }, []); return null }
