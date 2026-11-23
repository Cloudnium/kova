import './globals.css'
import { Cormorant_Garamond, Playfair_Display, Montserrat, Comfortaa } from 'next/font/google'
const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--serif' })
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '700'], variable: '--playfair' })
const mont = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--mont' })
const comf = Comfortaa({ subsets: ['latin'], weight: ['400', '500'], variable: '--comf' })
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://licoreriakova.com'

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'KOVA | Licorería en Perú',
    template: '%s | KOVA'
  },
  description: 'Licorería KOVA. Compra licores, cervezas, vinos, whiskys y más al mejor precio. Delivery y atención por WhatsApp.',
  applicationName: 'KOVA',
  keywords: ['licorería KOVA', 'licoreria kova', 'licorería en Perú', 'licores', 'cervezas', 'vinos', 'whisky', 'delivery de licores', 'KOVA'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_PE',
    url: '/',
    siteName: 'KOVA',
    title: 'KOVA | Licorería en Perú',
    description: 'Licorería KOVA. Compra licores, cervezas, vinos, whiskys y más al mejor precio. Delivery y atención por WhatsApp.',
    images: [{ url: '/logo.png', alt: 'KOVA Licorería' }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KOVA | Licorería en Perú',
    description: 'Licorería KOVA. Compra licores, cervezas, vinos, whiskys y más al mejor precio.',
    images: ['/logo.png']
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 }
  },
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
  icons: { icon: '/logo.png', apple: '/apple-touch-icon.png' },
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'KOVA', statusBarStyle: 'black' }
}
export const viewport = { themeColor: '#000000' }
export default function Root({ children }) {
  return <html lang="es"><body className={[serif.variable, playfair.variable, mont.variable, comf.variable].join(' ')}>{children}</body></html>
}
