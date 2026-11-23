export default function robots() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://licoreriakova.com'
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/login', '/seleccionar-sede', '/diagnostico']
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl
  }
}
