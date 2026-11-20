import './globals.css'
import { Cormorant_Garamond, Playfair_Display, Montserrat, Comfortaa } from 'next/font/google'
const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--serif' })
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '700'], variable: '--playfair' })
const mont = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--mont' })
const comf = Comfortaa({ subsets: ['latin'], weight: ['400', '500'], variable: '--comf' })
export const metadata = { title: 'KOVA | Elige tu momento', description: 'Licores al mejor precio', icons: { icon: '/logo.png', apple: '/apple-touch-icon.png' }, manifest: '/manifest.json', appleWebApp: { capable: true, title: 'KOVA', statusBarStyle: 'black' } }
export const viewport = { themeColor: '#000000' }
export default function Root({ children }) {
  return <html lang="es"><body className={[serif.variable, playfair.variable, mont.variable, comf.variable].join(' ')}>{children}</body></html>
}
