// Costo de delivery según la distancia (misma regla que supabase/schema_v20_delivery.sql; el servidor es quien manda al cobrar).
// Hasta 2 km: S/ 3.00 · cada km adicional (o fracción): + S/ 1.50 · máximo 30 km.
export const ORIGIN = { lat: -12.0194788, lng: -76.877243 }      // punto de salida de los pedidos (sobrescribible por sede: branches.geo_lat / geo_lng)
const num = (v, d) => (v !== undefined && v !== null && v !== '' && !isNaN(+v) && +v >= 0 ? +v : d)
export const rates = cfg => ({ base: num(cfg?.delivery_base, 3), baseKm: num(cfg?.delivery_base_km, 2), perKm: num(cfg?.delivery_extra_per_km, 1.5), maxKm: num(cfg?.delivery_max_km, 30), factor: num(cfg?.delivery_road_factor, 1) })
const rad = d => d * Math.PI / 180
export function deliveryQuote(branch, cfg, lat, lng) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null
  const r = rates(cfg), oLat = branch?.geo_lat != null ? +branch.geo_lat : ORIGIN.lat, oLng = branch?.geo_lng != null ? +branch.geo_lng : ORIGIN.lng
  const a = Math.sin(rad(lat - oLat) / 2) ** 2 + Math.cos(rad(oLat)) * Math.cos(rad(lat)) * Math.sin(rad(lng - oLng) / 2) ** 2
  const km = Math.round(6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(a))) * r.factor * 100) / 100
  const fee = r.base + (km > r.baseKm ? Math.ceil(+(km - r.baseKm).toFixed(2)) * r.perKm : 0)
  return { km, fee, ok: km <= r.maxKm, maxKm: r.maxKm }
}
