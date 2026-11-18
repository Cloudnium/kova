'use client'
import { useTable, Head, Err } from '../../../lib/ui'
import { fmtDate } from '../../../lib/supabase'
import { useApp, useScope } from '../../../lib/branch'
export default function Auditoria() {
  const { allBranches } = useApp(), scope = useScope()
  const [rows, , err] = useTable('audit_log', 'created_at', 400, true)
  return (<><Head t="Auditoría" s="Registro de lo que hace cada usuario" /><Err e={err} /><div className="panel"><table><thead><tr><th>Fecha</th><th>Usuario</th>{!scope && <th>Sede</th>}<th>Acción</th><th>Detalle</th></tr></thead><tbody>
    {rows.map(r => <tr key={r.id}><td>{fmtDate(r.created_at)}</td><td>{r.user_email}</td>{!scope && <td>{allBranches.find(b => b.id === r.branch_id)?.name || '-'}</td>}<td><b>{r.action}</b></td><td>{r.detail}</td></tr>)}</tbody></table></div></>)
}
