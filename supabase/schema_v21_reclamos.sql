-- =====================================================================
-- schema_v21_reclamos.sql · LIBRO DE RECLAMACIONES EN EL SISTEMA INTERNO (sin Resend ni correo)
-- Ejecuta en Supabase > SQL Editor (después de schema_v20). Es seguro repetirlo. No borra datos.
--
--   · Los reclamos del footer de la tienda se guardan en la tabla "claims".
--   · El personal los ve y los atiende en  Admin > Reclamos  (estado + respuesta al cliente).
--   · El cliente puede consultar el estado y la respuesta desde el footer con su código + número de documento.
--   · La tienda (anon) solo puede REGISTRAR (create_claim) y CONSULTAR el suyo (claim_status); nunca leer la tabla.
-- =====================================================================
create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now(),
  claim_date date,
  name text not null,
  doc_type text,
  doc_number text not null,
  nationality text,
  address text not null,
  phone text not null,
  email text not null,
  product text not null,
  order_ref text,
  amount numeric(10,2) not null default 0,
  kind text not null default 'Reclamo',
  detail text not null,
  desire text,
  status text not null default 'pendiente' check (status in ('pendiente', 'en_proceso', 'atendido')),
  response text,
  responded_at timestamptz,
  responded_by text
);
create index if not exists claims_created_idx on claims (created_at desc);
create index if not exists claims_status_idx on claims (status);

alter table claims enable row level security;
drop policy if exists "claims staff lee" on claims;
drop policy if exists "claims staff atiende" on claims;
drop policy if exists "claims admin borra" on claims;
create policy "claims staff lee" on claims for select to authenticated using (is_staff());
create policy "claims staff atiende" on claims for update to authenticated using (is_staff()) with check (is_staff());
create policy "claims admin borra" on claims for delete to authenticated using (is_admin());
-- sin política de insert/select para anon: solo entran por create_claim()

-- Registrar un reclamo (lo llama /api/reclamos). El código viene del servidor; si ya existe se devuelve el mismo (reintentos / doble clic).
create or replace function create_claim(p_code text, p_date date, p_name text, p_doc_type text, p_doc_number text, p_nationality text,
  p_address text, p_phone text, p_email text, p_product text, p_order text, p_amount numeric, p_kind text, p_detail text, p_desire text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_code, '') !~ '^LR-[0-9]{8}-[0-9A-F]{6}$' then raise exception 'Código no válido'; end if;
  if exists (select 1 from claims where code = p_code) then return p_code; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(trim(coalesce(p_doc_number, ''))) < 3 or length(trim(coalesce(p_address, ''))) < 3
     or length(trim(coalesce(p_phone, ''))) < 6 or length(trim(coalesce(p_product, ''))) < 2 or length(trim(coalesce(p_detail, ''))) < 3 then
    raise exception 'Completa todos los campos obligatorios'; end if;
  if coalesce(p_email, '') !~ '^\S+@\S+\.\S+$' then raise exception 'El correo electrónico no es válido'; end if;
  if coalesce(p_amount, 0) < 0 or coalesce(p_amount, 0) > 99999999 then raise exception 'El monto reclamado no es válido'; end if;
  -- freno contra abuso: máx. 5 reclamos por hora con el mismo documento y 300 por hora en total
  if (select count(*) from claims where doc_number = trim(p_doc_number) and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from claims where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Se enviaron muchos reclamos seguidos. Inténtalo de nuevo en un rato o escríbenos por WhatsApp'; end if;
  insert into claims (code, claim_date, name, doc_type, doc_number, nationality, address, phone, email, product, order_ref, amount, kind, detail, desire)
  values (p_code, p_date, trim(p_name), p_doc_type, trim(p_doc_number), p_nationality, trim(p_address), trim(p_phone), trim(p_email), trim(p_product),
          nullif(trim(coalesce(p_order, '')), ''), coalesce(p_amount, 0), case when p_kind = 'Queja' then 'Queja' else 'Reclamo' end, trim(p_detail), p_desire)
  on conflict (code) do nothing;
  return p_code;
end $$;
revoke all on function create_claim(text, date, text, text, text, text, text, text, text, text, text, numeric, text, text, text) from public;
grant execute on function create_claim(text, date, text, text, text, text, text, text, text, text, text, numeric, text, text, text) to anon, authenticated, service_role;

-- Consulta del cliente: código + número de documento. Solo devuelve estado y respuesta (nunca datos de otros).
create or replace function claim_status(p_code text, p_doc text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', code, 'kind', kind, 'status', status, 'created_at', created_at, 'product', product,
                            'response', response, 'responded_at', responded_at)
  from claims where code = upper(trim(p_code)) and lower(doc_number) = lower(trim(p_doc)) $$;
grant execute on function claim_status(text, text) to anon, authenticated, service_role;

-- Aviso en vivo en el panel cuando llega un reclamo nuevo
do $$ begin
  alter publication supabase_realtime add table claims;
exception when duplicate_object then null; when undefined_object then null; end $$;
