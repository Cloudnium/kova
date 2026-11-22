-- =====================================================================
-- schema_v11.sql · EGRESOS CON COMPROBANTE Y COMPRAS DE INSUMOS
-- Ejecuta después de schema_v10.sql. Es seguro repetirlo.
-- =====================================================================
-- 0) Endurece el trigger de historial (por si OLD no existe en un INSERT)
create or replace function bs_track() returns trigger language plpgsql as $$
begin
  perform set_config('kova.m' || md5(new.branch_id::text || new.product_id::text),
    concat_ws(',', case when tg_op = 'UPDATE' then old.stock else 0 end, case when tg_op = 'UPDATE' then old.stock_warehouse else 0 end, new.stock, new.stock_warehouse), true);
  return new;
end $$;

-- 1) Egresos con datos del comprobante y del proveedor
alter table expenses add column if not exists doc_type text;
alter table expenses add column if not exists doc_series text;
alter table expenses add column if not exists doc_number text;
alter table expenses add column if not exists doc_date date;
alter table expenses add column if not exists supplier_doc text;
alter table expenses add column if not exists supplier_name text;
alter table expenses add column if not exists notes text;
alter table expenses add column if not exists photo_url text;

-- 2) Compras de insumos (mercadería): al recibirlas entra stock al almacén de la sede
create table if not exists purchases(
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  number text,
  supplier text,
  doc_number text,
  purchase_date date not null default current_date,
  items jsonb not null default '[]',      -- [{id,name,qty,cost}]
  total numeric not null default 0,
  status text not null default 'pendiente' check (status in ('pendiente', 'recibida', 'anulada')),
  user_email text,
  received_at timestamptz,
  created_at timestamptz not null default now());
create index if not exists purchases_branch_idx on purchases(branch_id, created_at desc);
alter table purchases enable row level security;
drop policy if exists "purchases lee" on purchases;
create policy "purchases lee" on purchases for select to authenticated using (can_branch(branch_id));

-- Ingresa al almacén y actualiza el costo con el último precio de compra
create or replace function apply_purchase(p purchases, p_email text) returns void language plpgsql security definer set search_path = public as $$
declare x jsonb;
begin
  for x in select e from jsonb_array_elements(p.items) e loop
    insert into branch_stock(branch_id, product_id, stock_warehouse) values (p.branch_id, (x->>'id')::uuid, (x->>'qty')::int)
      on conflict (branch_id, product_id) do update set stock_warehouse = branch_stock.stock_warehouse + excluded.stock_warehouse;
    update products set cost = (x->>'cost')::numeric where id = (x->>'id')::uuid and (x->>'cost')::numeric > 0;
    insert into stock_moves(branch_id, product_id, product_name, qty, direction, user_email)
    values (p.branch_id, (x->>'id')::uuid, x->>'name', (x->>'qty')::int, 'Compra ' || coalesce(p.number, ''), p_email);
  end loop;
end $$;
revoke all on function apply_purchase(purchases, text) from public;

create or replace function create_purchase(p_branch uuid, p_supplier text, p_doc text, p_date date, p_items jsonb, p_received boolean)
returns purchases language plpgsql security definer set search_path = public as $$
declare v_me profiles; r record; v_prod products; v_items jsonb := '[]'::jsonb; v_tot numeric := 0; v_p purchases;
begin
  select * into v_me from profiles where id = auth.uid() and coalesce(active, true);
  if v_me.id is null then raise exception 'Sesión no válida'; end if;
  if not can_branch(p_branch) then raise exception 'No tienes acceso a esta sede'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un producto'; end if;
  for r in select (x->>'id')::uuid as id, sum((x->>'qty')::int) as qty, max((x->>'cost')::numeric) as cost from jsonb_array_elements(p_items) x group by 1 loop
    if r.qty <= 0 then raise exception 'Cantidad no válida'; end if;
    if coalesce(r.cost, 0) < 0 then raise exception 'Precio de compra no válido'; end if;
    select * into v_prod from products where id = r.id and kind <> 'combo';
    if v_prod.id is null then raise exception 'Un producto de la compra no existe'; end if;
    v_items := v_items || jsonb_build_object('id', v_prod.id, 'name', v_prod.name, 'qty', r.qty, 'cost', coalesce(r.cost, 0));
    v_tot := v_tot + r.qty * coalesce(r.cost, 0);
  end loop;
  insert into purchases(branch_id, number, supplier, doc_number, purchase_date, items, total, status, user_email, received_at)
  values (p_branch, next_doc(p_branch, 'CP'), nullif(trim(p_supplier), ''), nullif(trim(p_doc), ''), coalesce(p_date, current_date), v_items, v_tot,
    case when p_received then 'recibida' else 'pendiente' end, v_me.email, case when p_received then now() end) returning * into v_p;
  if p_received then perform apply_purchase(v_p, v_me.email); end if;
  insert into audit_log(user_email, action, detail, branch_id) values (v_me.email, 'Compra registrada', v_p.number || ' · S/ ' || v_tot, p_branch);
  return v_p;
end $$;

create or replace function receive_purchase(p_id uuid) returns purchases language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_p purchases;
begin
  select * into v_me from profiles where id = auth.uid() and coalesce(active, true);
  select * into v_p from purchases where id = p_id for update;
  if v_p.id is null or v_me.id is null or not can_branch(v_p.branch_id) then raise exception 'Compra no encontrada'; end if;
  if v_p.status <> 'pendiente' then raise exception 'Esta compra ya fue atendida'; end if;
  perform apply_purchase(v_p, v_me.email);
  update purchases set status = 'recibida', received_at = now() where id = p_id returning * into v_p;
  insert into audit_log(user_email, action, detail, branch_id) values (v_me.email, 'Compra recibida', v_p.number, v_p.branch_id);
  return v_p;
end $$;

create or replace function cancel_purchase(p_id uuid) returns purchases language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_p purchases;
begin
  select * into v_me from profiles where id = auth.uid() and coalesce(active, true);
  select * into v_p from purchases where id = p_id for update;
  if v_p.id is null or v_me.id is null or not can_branch(v_p.branch_id) then raise exception 'Compra no encontrada'; end if;
  if v_p.status <> 'pendiente' then raise exception 'Solo se pueden anular compras pendientes'; end if;
  update purchases set status = 'anulada' where id = p_id returning * into v_p;
  insert into audit_log(user_email, action, detail, branch_id) values (v_me.email, 'Compra anulada', v_p.number, v_p.branch_id);
  return v_p;
end $$;
grant execute on function create_purchase(uuid, text, text, date, jsonb, boolean) to authenticated;
grant execute on function receive_purchase(uuid) to authenticated;
grant execute on function cancel_purchase(uuid) to authenticated;
