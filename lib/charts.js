'use client'
import { useId } from 'react'
export const PAL = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#64748b']
const smooth = pts => pts.map((p, i) => {
  if (!i) return `M${p[0]} ${p[1]}`
  const q = pts[i - 1], cx = (q[0] + p[0]) / 2
  return `C${cx} ${q[1]} ${cx} ${p[1]} ${p[0]} ${p[1]}`
}).join(' ')
const nice = m => { if (m <= 0) return 10; const e = Math.pow(10, Math.floor(Math.log10(m))), f = m / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e }
const short = n => n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0).replace('.0', '') + 'k' : String(Math.round(n))
/* Líneas suaves (1 o 2 series). series: [{name,color,data:[{l,v}],area}] */
export function LineChart({ series, h = 220, dots = true }) {
  const id = useId().replace(/:/g, ''), W = 620, L = 44, R = 14, T = 14, B = 28, n = series[0]?.data.length || 0
  const mx = nice(Math.max(...series.flatMap(s => s.data.map(d => d.v)), 1)), ticks = [0, 1, 2, 3, 4].map(i => mx / 4 * i)
  const X = i => L + i * (W - L - R) / Math.max(n - 1, 1), Y = v => T + (h - T - B) * (1 - v / mx)
  return <svg viewBox={`0 0 ${W} ${h}`} className="ch-svg" role="img">
    <defs>{series.map((s, k) => <linearGradient key={k} id={`${id}g${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity=".28" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient>)}</defs>
    {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="#e5e7eb" strokeDasharray={i ? '3 4' : ''} /><text x={L - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#9ca3af">{short(t)}</text></g>)}
    {series[0]?.data.map((d, i) => <text key={i} x={X(i)} y={h - 8} textAnchor="middle" fontSize="11.5" fill="#6b7280">{d.l}</text>)}
    {series.map((s, k) => { const pts = s.data.map((d, i) => [X(i), Y(d.v)]); if (!pts.length) return null; const ln = smooth(pts)
      return <g key={k}>{s.area && <path d={`${ln} L${pts.at(-1)[0]} ${Y(0)} L${pts[0][0]} ${Y(0)}Z`} fill={`url(#${id}g${k})`} />}<path d={ln} fill="none" stroke={s.color} strokeWidth="2.6" strokeLinecap="round" />
        {dots && pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" fill="#fff" stroke={s.color} strokeWidth="2.2"><title>{s.name}: {s.data[i].l} · {Math.round(s.data[i].v * 100) / 100}</title></circle>)}</g> })}
  </svg>
}
/* Barras verticales */
export function BarChart({ data, color = '#3b82f6', h = 230 }) {
  const W = 620, L = 44, R = 14, T = 14, B = 28, mx = nice(Math.max(...data.map(d => d.v), 1)), ticks = [0, 1, 2, 3, 4].map(i => mx / 4 * i)
  const bw = (W - L - R) / Math.max(data.length, 1), Y = v => T + (h - T - B) * (1 - v / mx)
  return <svg viewBox={`0 0 ${W} ${h}`} className="ch-svg" role="img">
    {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="#e5e7eb" strokeDasharray={i ? '3 4' : ''} /><text x={L - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#9ca3af">{short(t)}</text></g>)}
    {data.map((d, i) => { const x = L + i * bw + bw * .22, w = bw * .56, y = Y(d.v); return <g key={i}><rect x={x} y={y} width={w} height={Math.max(Y(0) - y, 0)} rx="6" fill={color}><title>{d.l}: {Math.round(d.v * 100) / 100}</title></rect><text x={x + w / 2} y={h - 8} textAnchor="middle" fontSize="11.5" fill="#6b7280">{d.l}</text></g> })}
  </svg>
}
/* Dona + leyenda */
export function Donut({ data, fmt = v => v, center }) {
  const tot = data.reduce((a, d) => a + d.v, 0), R = 62, C = 2 * Math.PI * R; let acc = 0
  return <div className="ch-donut"><svg viewBox="0 0 170 170" width="170" height="170" role="img"><circle cx="85" cy="85" r={R} fill="none" stroke="#f1f5f9" strokeWidth="26" />
    {tot > 0 && data.map((d, i) => { const len = d.v / tot * C, o = -acc / tot * C; acc += d.v; return <circle key={i} cx="85" cy="85" r={R} fill="none" stroke={PAL[i % PAL.length]} strokeWidth="26" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={o} transform="rotate(-90 85 85)"><title>{d.l}: {fmt(d.v)}</title></circle> })}
    {center && <text x="85" y="90" textAnchor="middle" fontSize="15" fontWeight="700" fill="#111827">{center}</text>}</svg>
    <ul className="ch-leg">{data.map((d, i) => <li key={d.l}><i style={{ background: PAL[i % PAL.length] }} /><span>{d.l}</span><b>{tot ? Math.round(d.v / tot * 100) : 0}%</b></li>)}{!data.length && <li className="sub">Sin datos en este periodo.</li>}</ul></div>
}
