import './globals.css'
import { Cormorant_Garamond } from 'next/font/google'
const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600'], variable: '--serif' })
export const metadata = { title: 'KOVA | Elige tu momento', description: 'Licores al mejor precio', icons: { icon: '/logo.png', apple: '/apple-touch-icon.png' }, manifest: '/manifest.json', appleWebApp: { capable: true, title: 'KOVA', statusBarStyle: 'black' } }
export const viewport = { themeColor: '#000000' }
export default function Root({ children }) {
  return <html lang="es"><body className={serif.variable}>{children}</body></html>
}
