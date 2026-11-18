import { supabase } from './supabase'
// Reduce una imagen en el navegador (por defecto WebP, máx. 1200px) para subirla más rápido
export async function compressImage(file, { max = 1200, type = 'image/webp', quality = 0.85 } = {}) {
  const img = await createImageBitmap(file), sc = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas')
  c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  const blob = await new Promise(r => c.toBlob(r, type, quality))
  if (!blob) throw new Error('No se pudo procesar la imagen')
  return blob
}
export const rnd = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8)
// Sube un blob/archivo y devuelve la ruta
export async function upload(bucket, path, body, contentType) {
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: false })
  if (error) throw error
  return path
}
export const publicUrl = (bucket, path) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
