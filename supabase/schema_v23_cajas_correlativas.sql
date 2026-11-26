-- =====================================================================
-- schema_v23_cajas_correlativas.sql · NUMERACIÓN CORRELATIVA DE CAJAS
-- Ejecuta en Supabase > SQL Editor (después de schema_v22). Es seguro repetirlo.
--
-- Antes, todas las cajas salían como «Caja 1». Ahora el número es correlativo POR SEDE y NO se reinicia cada día:
--   Día 1: abres 1 caja  -> Caja 1
--   Día 2: abres 2 cajas -> Caja 2 y Caja 3
--   Día 3: ...           -> Caja 4, Caja 5, etc.
-- Si al abrir la caja escribes un nombre propio (ej. «Caja barra»), se respeta ese nombre (el contador igual avanza).
-- Las cajas ya existentes con nombre «Caja N» se renumeran en orden de apertura (por sede) y sus ventas muestran el nuevo nombre.
-- =====================================================================

create or replace function open_cash(p_branch uuid, p_name text, p_amount numeric) returns cash_registers language plpgsql security definer set search_path = public as $$
declare v_email text; v_c cash_registers; v_n int; v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if not can_branch(p_branch) then raise exception 'No tienes acceso a esta sede'; end if;
  select email into v_email from profiles where id = auth.uid() and coalesce(active, true);
  if v_email is null then raise exception 'Sesión no válida'; end if;
  if exists (select 1 from cash_registers where user_email = v_email and branch_id = p_branch and status = 'abierta') then raise exception 'Ya tienes una caja abierta en esta sede'; end if;
  -- número correlativo por sede (no se reinicia cada día)
  insert into doc_counters(branch_id, doc, last_number) values (p_branch, 'CAJA', 1)
    on conflict (branch_id, doc) do update set last_number = doc_counters.last_number + 1 returning last_number into v_n;
  if v_name is null or v_name ~* '^caja\s*[0-9]+$' then v_name := 'Caja ' || v_n; end if;      -- vacío o «Caja N» escrito a mano = automático
  insert into cash_registers(name, user_email, branch_id, opening_amount) values (v_name, v_email, p_branch, greatest(coalesce(p_amount, 0), 0)) returning * into v_c;
  insert into audit_log(user_email, action, detail, branch_id) values (v_email, 'Caja abierta', v_c.name, p_branch);
  return v_c;
end $$;
revoke all on function open_cash(uuid, text, numeric) from public, anon;
grant execute on function open_cash(uuid, text, numeric) to authenticated;

-- Renumera las cajas ya creadas (solo las que se llaman «Caja N»), por sede y en orden de apertura
with r as (select id, branch_id, row_number() over (partition by branch_id order by opened_at, id) as n from cash_registers where name ~* '^caja\s*[0-9]+$')
update cash_registers c set name = 'Caja ' || r.n from r where c.id = r.id and c.name is distinct from 'Caja ' || r.n;
update sales s set cash_name = c.name from cash_registers c where s.cash_id = c.id and s.cash_name is distinct from c.name;
-- El contador sigue desde la última caja
insert into doc_counters(branch_id, doc, last_number)
  select branch_id, 'CAJA', count(*) from cash_registers group by branch_id
  on conflict (branch_id, doc) do update set last_number = greatest(doc_counters.last_number, excluded.last_number);
