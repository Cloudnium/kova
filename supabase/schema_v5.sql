-- =====================================================================
-- schema_v5.sql  ·  MULTISEDE REAL + PEDIDOS WEB + COMPROBANTES
-- Ejecuta en Supabase > SQL Editor DESPUÉS de schema_v4.sql.
-- Es seguro correrlo más de una vez (idempotente), salvo el paso de
-- "migración de datos existentes" que solo actúa si aún no hay datos migrados.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. SEDES
-- ---------------------------------------------------------------------
alter table branches add column if not exists code text;
alter table branches add column if not exists city text;
alter table branches add column if not exists active boolean default true;
alter table branches add column if not exists web_enabled boolean default true;
alter table branches add column if not exists ticket_footer text;

create or replace function branches_defaults() returns trigger language plpgsql as $$
begin
  if new.code is null or new.code = '' then
    select lpad((coalesce(max(code::int), 0) + 1)::text, 3, '0') into new.code from branches where code ~ '^[0-9]+$';
  end if;
  new.series := 'NV' || new.code || ' · B' || new.code || ' · F' || new.code;
  return new;
end $$;
drop trigger if exists branches_defaults_t on branches;
create trigger branches_defaults_t before insert or update of code on branches for each row execute function branches_defaults();

-- Si no existe ninguna sede, crea una para no perder datos
insert into branches(name, address) select 'Sede Principal', '' where not exists (select 1 from branches);
-- Asigna código (001, 002, ...) a las sedes que no lo tengan
do $$ declare r record; begin
  for r in select id from branches where code is null or code = '' order by created_at, id loop
    update branches set code = '' where id = r.id;
  end loop;
end $$;
create unique index if not exists branches_code_uq on branches(code);

-- ---------------------------------------------------------------------
-- 2. CONFIGURACIÓN DEL NEGOCIO (datos no secretos; la web los lee)
-- ---------------------------------------------------------------------
create table if not exists settings(key text primary key, value jsonb, updated_at timestamptz default now());
alter table settings enable row level security;

-- ---------------------------------------------------------------------
-- 3. USUARIOS: a qué sedes puede entrar cada uno
-- ---------------------------------------------------------------------
alter table profiles add column if not exists branch_ids uuid[] default '{}';
-- (una sola vez) los trabajadores que ya existían pueden entrar a todas las sedes actuales
update profiles set branch_ids = (select coalesce(array_agg(id), '{}') from branches)
 where role <> 'administrador' and coalesce(array_length(branch_ids, 1), 0) = 0;

create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and coalesce(active, true)) $$;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and role = 'administrador' and coalesce(active, true)) $$;
create or replace function can_branch(b uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles p where p.id = auth.uid() and coalesce(p.active, true)
   and (p.role = 'administrador' or b = any(coalesce(p.branch_ids, '{}')))) $$;

-- ---------------------------------------------------------------------
-- 4. STOCK POR SEDE (tienda + almacén en cada sede)
-- ---------------------------------------------------------------------
create table if not exists branch_stock(
  branch_id uuid not null references branches(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  stock int not null default 0 check (stock >= 0),
  stock_warehouse int not null default 0 check (stock_warehouse >= 0),
  primary key (branch_id, product_id));
create index if not exists branch_stock_prod on branch_stock(product_id);
alter table branch_stock enable row level security;

-- Migración (una sola vez): el stock global actual pasa a la primera sede
insert into branch_stock(branch_id, product_id, stock, stock_warehouse)
select (select id from branches order by created_at, id limit 1), p.id, greatest(p.stock, 0), greatest(coalesce(p.stock_warehouse, 0), 0)
from products p where not exists (select 1 from branch_stock);

-- ---------------------------------------------------------------------
-- 5. VENTAS / PEDIDOS: columnas nuevas
-- ---------------------------------------------------------------------
alter table sales add column if not exists branch_id uuid references branches(id);
alter table sales add column if not exists order_number text;
alter table sales add column if not exists pay_mode text;            -- contra_entrega | pagar_ahora
alter table sales add column if not exists payment_proof text;       -- ruta en el bucket privado 'proofs'
alter table sales add column if not exists address text;
alter table sales add column if not exists notes text;
alter table sales add column if not exists customer_doc text;
alter table sales add column if not exists paid boolean default true;
alter table sales add column if not exists paid_at timestamptz;
alter table sales add column if not exists confirmed_at timestamptz;
alter table sales add column if not exists confirmed_by text;
alter table sales add column if not exists delivery_status text;     -- por_entregar | entregado
alter table sales add column if not exists delivered_at timestamptz;
alter table sales add column if not exists seller_name text;
alter table sales add column if not exists cash_name text;
alter table sales add column if not exists subtotal numeric(10,2);
alter table sales add column if not exists discount numeric(5,2) default 0;
alter table sales add column if not exists reject_reason text;
alter table sales alter column number drop default;   -- ahora lo asigna el servidor por sede y tipo

alter table customers add column if not exists doc_number text;
alter table customers add column if not exists address text;

alter table cash_registers add column if not exists branch_id uuid references branches(id);
alter table cash_registers add column if not exists expected_amount numeric(10,2);
alter table expenses add column if not exists branch_id uuid references branches(id);
alter table expenses add column if not exists cash_id uuid;
alter table expenses add column if not exists user_email text;
alter table stock_moves add column if not exists branch_id uuid references branches(id);
alter table stock_moves add column if not exists product_id uuid;
alter table audit_log add column if not exists branch_id uuid references branches(id);

-- Datos existentes -> primera sede
do $$ declare b uuid := (select id from branches order by created_at, id limit 1); begin
  update sales set branch_id = b where branch_id is null;
  update cash_registers set branch_id = b where branch_id is null;
  update expenses set branch_id = b where branch_id is null;
  update stock_moves set branch_id = b where branch_id is null;
  update audit_log set branch_id = b where branch_id is null;
end $$;
update sales set paid = false where status = 'pendiente' and source = 'web' and paid is distinct from false;

create index if not exists sales_branch_date on sales(branch_id, created_at desc);
create index if not exists sales_src_status on sales(source, status);
create unique index if not exists sales_number_uq on sales(number) where number is not null;
create unique index if not exists sales_order_uq on sales(order_number) where order_number is not null;
-- una caja abierta por usuario y por sede
create unique index if not exists one_open_cash on cash_registers(user_email, branch_id) where status = 'abierta';

-- ---------------------------------------------------------------------
-- 6. CORRELATIVOS POR SEDE (NV001-0000001, B001-..., F001-..., PW001-...)
-- ---------------------------------------------------------------------
create table if not exists doc_counters(branch_id uuid not null references branches(id) on delete cascade, doc text not null, last_number int not null default 0, primary key (branch_id, doc));
alter table doc_counters enable row level security;

-- Conserva la numeración que ya llevabas (NV001-xxxxxxx) en la primera sede
insert into doc_counters(branch_id, doc, last_number)
select (select id from branches order by created_at, id limit 1), 'NV',
  coalesce((select max(regexp_replace(number, '^NV001-', '')::int) from sales where number ~ '^NV001-[0-9]+$'), 0)
where not exists (select 1 from doc_counters where doc = 'NV');

create or replace function next_doc(p_branch uuid, p_doc text) returns text language plpgsql security definer set search_path = public as $$
declare v_code text; v_n int;
begin
  select code into v_code from branches where id = p_branch;
  if v_code is null then raise exception 'Sede no válida'; end if;
  insert into doc_counters(branch_id, doc, last_number) values (p_branch, p_doc, 1)
    on conflict (branch_id, doc) do update set last_number = doc_counters.last_number + 1 returning last_number into v_n;
  return p_doc || v_code || '-' || lpad(v_n::text, 7, '0');
end $$;

-- Pedidos web antiguos: les damos número de pedido y los quitamos de comprobantes
do $$ declare r record; begin
  for r in select id, branch_id from sales where source = 'web' and order_number is null order by created_at loop
    update sales set order_number = next_doc(r.branch_id, 'PW') where id = r.id;
  end loop;
  update sales set number = null where source = 'web' and status = 'pendiente';
end $$;

create or replace function stock_add(p_branch uuid, p_product uuid, p_qty int) returns void language sql security definer set search_path = public as $$
  insert into branch_stock(branch_id, product_id, stock) values (p_branch, p_product, p_qty)
  on conflict (branch_id, product_id) do update set stock = branch_stock.stock + excluded.stock $$;

-- ---------------------------------------------------------------------
-- 7. POLÍTICAS DE SEGURIDAD (RLS) POR SEDE
-- ---------------------------------------------------------------------
do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
    and tablename in ('branches','profiles','sales','cash_registers','expenses','stock_moves','audit_log','branch_stock','settings','doc_counters') loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- sedes: la web ve las activas con pedidos web; el personal ve todas; solo admin escribe
create policy "sedes web" on branches for select to anon, authenticated using (coalesce(active, true) and coalesce(web_enabled, true));
create policy "sedes staff" on branches for select to authenticated using (is_staff());
create policy "sedes admin" on branches for all to authenticated using (is_admin()) with check (is_admin());
-- configuración
create policy "settings lee" on settings for select to anon, authenticated using (true);
create policy "settings admin" on settings for all to authenticated using (is_admin()) with check (is_admin());
-- usuarios: cada uno se ve a sí mismo; admin ve todos. Se modifican solo desde /api/users (service role)
create policy "profiles lee" on profiles for select to authenticated using (id = auth.uid() or is_admin());
-- stock por sede
create policy "stock web" on branch_stock for select to anon using (exists (select 1 from branches b where b.id = branch_id and coalesce(b.active, true) and coalesce(b.web_enabled, true)));
create policy "stock staff" on branch_stock for select to authenticated using (can_branch(branch_id));
-- ventas / cajas / movimientos: lectura por sede; toda escritura pasa por funciones seguras
create policy "ventas lee" on sales for select to authenticated using (can_branch(branch_id));
create policy "cajas lee" on cash_registers for select to authenticated using (can_branch(branch_id));
create policy "movs lee" on stock_moves for select to authenticated using (can_branch(branch_id));
-- egresos
create policy "egresos lee" on expenses for select to authenticated using (can_branch(branch_id));
create policy "egresos crea" on expenses for insert to authenticated with check (can_branch(branch_id));
create policy "egresos admin" on expenses for update to authenticated using (is_admin()) with check (is_admin());
create policy "egresos borra" on expenses for delete to authenticated using (is_admin());
-- auditoría
create policy "audit lee" on audit_log for select to authenticated using (is_admin());
create policy "audit crea" on audit_log for insert to authenticated with check (is_staff());
-- contadores: solo lectura para admin (respaldo)
create policy "contadores admin" on doc_counters for select to authenticated using (is_admin());

-- ---------------------------------------------------------------------
-- 8. FUNCIONES DE NEGOCIO (atómicas: validan y mueven stock en el servidor)
-- ---------------------------------------------------------------------
create or replace function doc_prefix(p_voucher text) returns text language sql immutable as $$
  select case p_voucher when 'Boleta' then 'B' when 'Factura' then 'F' when 'Nota de Venta' then 'NV' end $$;

-- 8.1 Venta en el punto de venta
create or replace function create_pos_sale(p_branch uuid, p_cash uuid, p_items jsonb, p_voucher text, p_payment text,
  p_customer_id uuid, p_customer_name text, p_phone text, p_doc text, p_discount numeric default 0)
returns sales language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_box cash_registers; r record; v_prod products; v_sub numeric := 0; v_tot numeric;
  v_items jsonb := '[]'::jsonb; v_sale sales; v_pre text; v_disc numeric;
begin
  select * into v_me from profiles where id = auth.uid() and coalesce(active, true);
  if v_me.id is null then raise exception 'Sesión no válida'; end if;
  if not can_branch(p_branch) then raise exception 'No tienes acceso a esta sede'; end if;
  select * into v_box from cash_registers where id = p_cash and branch_id = p_branch and status = 'abierta' and user_email = v_me.email;
  if v_box.id is null then raise exception 'Debes abrir tu caja en esta sede para vender'; end if;
  v_pre := doc_prefix(p_voucher);
  if v_pre is null then raise exception 'Tipo de comprobante no válido'; end if;
  if p_payment not in ('Efectivo','Yape','Tarjeta','Transferencia') then raise exception 'Método de pago no válido'; end if;
  if p_voucher = 'Factura' and coalesce(p_doc, '') !~ '^[0-9]{11}$' then raise exception 'La factura requiere un RUC de 11 dígitos'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;
  v_disc := least(greatest(coalesce(p_discount, 0), 0), 100);

  for r in select (x->>'id')::uuid as id, sum((x->>'qty')::int) as qty from jsonb_array_elements(p_items) x group by 1 order by 1 loop
    if r.qty <= 0 then raise exception 'Cantidad no válida'; end if;
    select * into v_prod from products where id = r.id and active;
    if v_prod.id is null then raise exception 'Un producto del carrito ya no está disponible'; end if;
    update branch_stock set stock = stock - r.qty where branch_id = p_branch and product_id = r.id and stock >= r.qty;
    if not found then raise exception 'Stock insuficiente de "%" en esta sede', v_prod.name; end if;
    v_items := v_items || jsonb_build_object('id', v_prod.id, 'name', v_prod.name, 'price', v_prod.price, 'qty', r.qty);
    v_sub := v_sub + v_prod.price * r.qty;
    insert into stock_moves(branch_id, product_id, product_name, qty, direction, user_email) values (p_branch, v_prod.id, v_prod.name, r.qty, 'Venta POS', v_me.email);
  end loop;
  v_tot := round(v_sub * (1 - v_disc / 100), 2);

  insert into sales(branch_id, cash_id, cash_name, seller_name, total, subtotal, discount, payment, voucher, number, customer_id, customer_name,
    phone, customer_doc, source, status, paid, paid_at, items)
  values (p_branch, v_box.id, v_box.name, coalesce(nullif(v_me.name, ''), split_part(v_me.email, '@', 1)), v_tot, v_sub, v_disc, p_payment, p_voucher,
    next_doc(p_branch, v_pre), p_customer_id, coalesce(nullif(trim(p_customer_name), ''), 'Cliente Varios'), nullif(trim(p_phone), ''),
    nullif(trim(p_doc), ''), 'pos', 'completado', true, now(), v_items) returning * into v_sale;
  insert into audit_log(user_email, action, detail, branch_id) values (v_me.email, 'Venta registrada', v_sale.number || ' · S/ ' || v_tot, p_branch);
  return v_sale;
end $$;

-- 8.2 Pedido web (lo llama la tienda sin iniciar sesión). Recalcula precios y NO descuenta stock.
create or replace function create_web_order(p_branch uuid, p_name text, p_phone text, p_address text, p_notes text,
  p_items jsonb, p_pay_mode text, p_proof text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b branches; r record; v_prod products; v_have int; v_tot numeric := 0; v_items jsonb := '[]'::jsonb; v_sale sales;
begin
  select * into v_b from branches where id = p_branch and coalesce(active, true) and coalesce(web_enabled, true);
  if v_b.id is null then raise exception 'La sede seleccionada no recibe pedidos web'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 80 then raise exception 'Escribe tu nombre'; end if;
  if coalesce(p_phone, '') !~ '^[0-9+ ]{6,20}$' then raise exception 'Escribe un celular válido'; end if;
  if p_pay_mode not in ('contra_entrega', 'pagar_ahora') then raise exception 'Elige una forma de pago'; end if;
  if p_pay_mode = 'pagar_ahora' and (p_proof is null or p_proof !~ '^[A-Za-z0-9._-]{5,120}$') then raise exception 'Adjunta la foto de tu pago'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 60 then raise exception 'Tu carrito está vacío'; end if;
  if (select count(*) from sales where source = 'web' and phone = trim(p_phone) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Has enviado muchos pedidos seguidos. Intenta de nuevo en un rato o escríbenos por WhatsApp'; end if;

  for r in select (x->>'id')::uuid as id, sum((x->>'qty')::int) as qty from jsonb_array_elements(p_items) x group by 1 order by 1 loop
    if r.qty <= 0 or r.qty > 99 then raise exception 'Cantidad no válida'; end if;
    select * into v_prod from products where id = r.id and active;
    if v_prod.id is null then raise exception 'Un producto del carrito ya no está disponible'; end if;
    select coalesce(stock, 0) into v_have from branch_stock where branch_id = p_branch and product_id = r.id;
    if coalesce(v_have, 0) < r.qty then raise exception 'Solo quedan % unidad(es) de "%" en esta sede', coalesce(v_have, 0), v_prod.name; end if;
    v_items := v_items || jsonb_build_object('id', v_prod.id, 'name', v_prod.name, 'price', v_prod.price, 'qty', r.qty);
    v_tot := v_tot + v_prod.price * r.qty;
  end loop;

  insert into sales(branch_id, total, subtotal, payment, voucher, customer_name, phone, address, notes, source, status, paid, pay_mode, payment_proof, order_number, items)
  values (p_branch, v_tot, v_tot, case p_pay_mode when 'pagar_ahora' then 'Yape' else 'Efectivo' end, 'Nota de Venta', trim(p_name), trim(p_phone),
    nullif(trim(p_address), ''), nullif(trim(p_notes), ''), 'web', 'pendiente', false, p_pay_mode, case p_pay_mode when 'pagar_ahora' then p_proof end,
    next_doc(p_branch, 'PW'), v_items) returning * into v_sale;
  return jsonb_build_object('id', v_sale.id, 'order_number', v_sale.order_number, 'total', v_sale.total, 'items', v_sale.items, 'created_at', v_sale.created_at,
    'customer_name', v_sale.customer_name, 'phone', v_sale.phone, 'address', v_sale.address, 'notes', v_sale.notes, 'pay_mode', v_sale.pay_mode,
    'branch', jsonb_build_object('name', v_b.name, 'address', v_b.address, 'city', v_b.city, 'phone', v_b.phone));
end $$;

-- 8.3 Confirmar pedido web: descuenta stock de la sede y emite el comprobante
create or replace function confirm_web_order(p_id uuid, p_voucher text, p_doc text, p_paid boolean, p_payment text default null)
returns sales language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_s sales; r record; v_prod products; v_pre text; v_cash uuid;
begin
  select * into v_me from profiles where id = auth.uid() and coalesce(active, true);
  if v_me.id is null then raise exception 'Sesión no válida'; end if;
  select * into v_s from sales where id = p_id and source = 'web' for update;
  if v_s.id is null then raise exception 'Pedido no encontrado'; end if;
  if not can_branch(v_s.branch_id) then raise exception 'No tienes acceso a esta sede'; end if;
  if v_s.status <> 'pendiente' then raise exception 'Este pedido ya fue atendido'; end if;
  v_pre := doc_prefix(p_voucher);
  if v_pre is null then raise exception 'Tipo de comprobante no válido'; end if;
  if p_voucher = 'Factura' and coalesce(p_doc, '') !~ '^[0-9]{11}$' then raise exception 'La factura requiere un RUC de 11 dígitos'; end if;
  if coalesce(p_payment, 'Efectivo') not in ('Efectivo','Yape','Tarjeta','Transferencia') then raise exception 'Método de pago no válido'; end if;

  for r in select (x->>'id')::uuid as id, sum((x->>'qty')::int) as qty from jsonb_array_elements(v_s.items) x group by 1 order by 1 loop
    select * into v_prod from products where id = r.id;
    update branch_stock set stock = stock - r.qty where branch_id = v_s.branch_id and product_id = r.id and stock >= r.qty;
    if not found then raise exception 'Stock insuficiente de "%" en esta sede. Ajusta el stock o rechaza el pedido', coalesce(v_prod.name, 'producto'); end if;
    insert into stock_moves(branch_id, product_id, product_name, qty, direction, user_email) values (v_s.branch_id, r.id, coalesce(v_prod.name, ''), r.qty, 'Pedido web ' || v_s.order_number, v_me.email);
  end loop;

  select id into v_cash from cash_registers where branch_id = v_s.branch_id and status = 'abierta' and user_email = v_me.email limit 1;
  update sales set status = 'completado', voucher = p_voucher, number = next_doc(v_s.branch_id, v_pre), customer_doc = nullif(trim(p_doc), ''),
    payment = coalesce(p_payment, payment), paid = coalesce(p_paid, false), paid_at = case when p_paid then now() end,
    cash_id = case when p_paid then v_cash end, cash_name = (select name from cash_registers where id = v_cash),
    confirmed_at = now(), confirmed_by = v_me.email, seller_name = coalesce(nullif(v_me.name, ''), split_part(v_me.email, '@', 1)),
    delivery_status = 'por_entregar' where id = p_id returning * into v_s;
  insert into audit_log(user_email, action, detail, branch_id) values (v_me.email, 'Pedido web confirmado', v_s.order_number || ' → ' || v_s.number, v_s.branch_id);
  return v_s;
end $$;

-- 8.4 Rechazar pedido web (no toca el stock)
create or replace function reject_web_order(p_id uuid, p_reason text default null) returns sales language plpgsql security definer set search_path = public as $$
declare v_s sales; v_email text;
begin
  select * into v_s from sales where id = p_id and source = 'web' for update;
  if v_s.id is null or not can_branch(v_s.branch_id) then raise exception 'Pedido no encontrado'; end if;
  if v_s.status <> 'pendiente' then raise exception 'Este pedido ya fue atendido'; end if;
  select email into v_email from profiles where id = auth.uid();
  update sales set status = 'anulado', reject_reason = nullif(trim(p_reason), '') where id = p_id returning * into v_s;
  insert into audit_log(user_email, action, detail, branch_id) values (v_email, 'Pedido web rechazado', v_s.order_number, v_s.branch_id);
  return v_s;
end $$;

-- 8.5 Anular comprobante (devuelve el stock a la sede)
create or replace function annul_sale(p_id uuid) returns sales language plpgsql security definer set search_path = public as $$
declare v_s sales; r record; v_email text;
begin
  select * into v_s from sales where id = p_id for update;
  if v_s.id is null or not can_branch(v_s.branch_id) then raise exception 'Comprobante no encontrado'; end if;
  if v_s.status = 'anulado' then raise exception 'Ya está anulado'; end if;
  select email into v_email from profiles where id = auth.uid();
  if v_s.status = 'completado' then
    for r in select (x->>'id')::uuid as id, sum((x->>'qty')::int) as qty, max(x->>'name') as name from jsonb_array_elements(v_s.items) x group by 1 order by 1 loop
      perform stock_add(v_s.branch_id, r.id, r.qty::int);
      insert into stock_moves(branch_id, product_id, product_name, qty, direction, user_email) values (v_s.branch_id, r.id, r.name, r.qty, 'Anulación ' || coalesce(v_s.number, ''), v_email);
    end loop;
  end if;
  update sales set status = 'anulado' where id = p_id returning * into v_s;
  insert into audit_log(user_email, action, detail, branch_id) values (v_email, 'Comprobante anulado', coalesce(v_s.number, v_s.order_number), v_s.branch_id);
  return v_s;
end $$;

-- 8.6 Marcar pedido como cobrado / entregado
create or replace function mark_order(p_id uuid, p_action text) returns sales language plpgsql security definer set search_path = public as $$
declare v_s sales; v_email text; v_cash uuid;
begin
  select * into v_s from sales where id = p_id for update;
  if v_s.id is null or not can_branch(v_s.branch_id) then raise exception 'Pedido no encontrado'; end if;
  if v_s.status <> 'completado' then raise exception 'Primero confirma el pedido'; end if;
  select email into v_email from profiles where id = auth.uid();
  if p_action = 'paid' then
    select id into v_cash from cash_registers where branch_id = v_s.branch_id and status = 'abierta' and user_email = v_email limit 1;
    update sales set paid = true, paid_at = now(), cash_id = coalesce(cash_id, v_cash), cash_name = coalesce(cash_name, (select name from cash_registers where id = v_cash)) where id = p_id returning * into v_s;
  elsif p_action = 'delivered' then
    update sales set delivery_status = 'entregado', delivered_at = now() where id = p_id returning * into v_s;
  else raise exception 'Acción no válida'; end if;
  insert into audit_log(user_email, action, detail, branch_id) values (v_email, case p_action when 'paid' then 'Pedido cobrado' else 'Pedido entregado' end, coalesce(v_s.number, v_s.order_number), v_s.branch_id);
  return v_s;
end $$;

-- 8.7 Cajas
create or replace function open_cash(p_branch uuid, p_name text, p_amount numeric) returns cash_registers language plpgsql security definer set search_path = public as $$
declare v_email text; v_c cash_registers;
begin
  if not can_branch(p_branch) then raise exception 'No tienes acceso a esta sede'; end if;
  select email into v_email from profiles where id = auth.uid() and coalesce(active, true);
  if v_email is null then raise exception 'Sesión no válida'; end if;
  if exists (select 1 from cash_registers where user_email = v_email and branch_id = p_branch and status = 'abierta') then raise exception 'Ya tienes una caja abierta en esta sede'; end if;
  insert into cash_registers(name, user_email, branch_id, opening_amount) values (coalesce(nullif(trim(p_name), ''), 'Caja 1'), v_email, p_branch, greatest(coalesce(p_amount, 0), 0)) returning * into v_c;
  insert into audit_log(user_email, action, detail, branch_id) values (v_email, 'Caja abierta', v_c.name, p_branch);
  return v_c;
end $$;

create or replace function close_cash(p_id uuid, p_counted numeric) returns cash_registers language plpgsql security definer set search_path = public as $$
declare v_c cash_registers; v_email text; v_exp numeric;
begin
  select * into v_c from cash_registers where id = p_id for update;
  if v_c.id is null or not can_branch(v_c.branch_id) then raise exception 'Caja no encontrada'; end if;
  select email into v_email from profiles where id = auth.uid();
  if v_c.user_email <> v_email and not is_admin() then raise exception 'Solo quien abrió la caja (o un administrador) puede cerrarla'; end if;
  if v_c.status <> 'abierta' then raise exception 'La caja ya está cerrada'; end if;
  v_exp := v_c.opening_amount
    + coalesce((select sum(total) from sales where cash_id = p_id and status = 'completado' and paid and payment = 'Efectivo'), 0)
    - coalesce((select sum(amount) from expenses where cash_id = p_id and method = 'Efectivo'), 0);
  update cash_registers set status = 'cerrada', closed_at = now(), expected_amount = v_exp, closing_amount = coalesce(p_counted, v_exp) where id = p_id returning * into v_c;
  insert into audit_log(user_email, action, detail, branch_id) values (v_email, 'Caja cerrada', v_c.name || ' · esperado S/ ' || v_exp || ' · contado S/ ' || v_c.closing_amount, v_c.branch_id);
  return v_c;
end $$;

-- 8.8 Stock: mover tienda<->almacén, ingresar, ajustar y trasladar entre sedes
create or replace function move_stock(p_branch uuid, p_product uuid, p_qty int, p_kind text) returns void language plpgsql security definer set search_path = public as $$
declare v_email text; v_name text; v_label text;
begin
  if not can_branch(p_branch) then raise exception 'No tienes acceso a esta sede'; end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'Escribe una cantidad mayor a 0'; end if;
  select email into v_email from profiles where id = auth.uid();
  select name into v_name from products where id = p_product;
  insert into branch_stock(branch_id, product_id) values (p_branch, p_product) on conflict do nothing;
  if p_kind = 'tienda' then
    update branch_stock set stock = stock + p_qty, stock_warehouse = stock_warehouse - p_qty where branch_id = p_branch and product_id = p_product and stock_warehouse >= p_qty;
    v_label := 'Almacén → Tienda';
  elsif p_kind = 'almacen' then
    update branch_stock set stock = stock - p_qty, stock_warehouse = stock_warehouse + p_qty where branch_id = p_branch and product_id = p_product and stock >= p_qty;
    v_label := 'Tienda → Almacén';
  elsif p_kind = 'ingreso' then
    update branch_stock set stock_warehouse = stock_warehouse + p_qty where branch_id = p_branch and product_id = p_product;
    v_label := 'Ingreso a almacén';
  else raise exception 'Movimiento no válido'; end if;
  if not found then raise exception 'No hay stock suficiente para mover esa cantidad'; end if;
  insert into stock_moves(branch_id, product_id, product_name, qty, direction, user_email) values (p_branch, p_product, v_name, p_qty, v_label, v_email);
  insert into audit_log(user_email, action, detail, branch_id) values (v_email, 'Movimiento de stock', v_name || ' · ' || p_qty || ' · ' || v_label, p_branch);
end $$;

create or replace function transfer_stock(p_from uuid, p_to uuid, p_product uuid, p_qty int) returns void language plpgsql security definer set search_path = public as $$
declare v_email text; v_name text;
begin
  if p_from = p_to then raise exception 'Elige una sede de destino distinta'; end if;
  if not (can_branch(p_from) and can_branch(p_to)) then raise exception 'No tienes acceso a ambas sedes'; end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'Escribe una cantidad mayor a 0'; end if;
  select email into v_email from profiles where id = auth.uid();
  select name into v_name from products where id = p_product;
  update branch_stock set stock_warehouse = stock_warehouse - p_qty where branch_id = p_from and product_id = p_product and stock_warehouse >= p_qty;
  if not found then raise exception 'El almacén de origen no tiene stock suficiente'; end if;
  insert into branch_stock(branch_id, product_id, stock_warehouse) values (p_to, p_product, p_qty)
    on conflict (branch_id, product_id) do update set stock_warehouse = branch_stock.stock_warehouse + excluded.stock_warehouse;
  insert into stock_moves(branch_id, product_id, product_name, qty, direction, user_email) values
    (p_from, p_product, v_name, p_qty, 'Traslado enviado a ' || (select name from branches where id = p_to), v_email),
    (p_to, p_product, v_name, p_qty, 'Traslado recibido de ' || (select name from branches where id = p_from), v_email);
  insert into audit_log(user_email, action, detail, branch_id) values (v_email, 'Traslado entre sedes', v_name || ' · ' || p_qty, p_from);
end $$;

create or replace function set_branch_stock(p_branch uuid, p_product uuid, p_stock int, p_wh int) returns void language plpgsql security definer set search_path = public as $$
declare v_email text; v_name text; v_old branch_stock;
begin
  if not can_branch(p_branch) then raise exception 'No tienes acceso a esta sede'; end if;
  if p_stock < 0 or p_wh < 0 then raise exception 'El stock no puede ser negativo'; end if;
  select email into v_email from profiles where id = auth.uid();
  select name into v_name from products where id = p_product;
  select * into v_old from branch_stock where branch_id = p_branch and product_id = p_product;
  if v_old.product_id is not null and v_old.stock = p_stock and v_old.stock_warehouse = p_wh then return; end if;
  insert into branch_stock(branch_id, product_id, stock, stock_warehouse) values (p_branch, p_product, p_stock, p_wh)
    on conflict (branch_id, product_id) do update set stock = excluded.stock, stock_warehouse = excluded.stock_warehouse;
  insert into stock_moves(branch_id, product_id, product_name, qty, direction, user_email)
    values (p_branch, p_product, v_name, abs(p_stock + p_wh - coalesce(v_old.stock, 0) - coalesce(v_old.stock_warehouse, 0)),
      'Ajuste manual (tienda ' || p_stock || ' · almacén ' || p_wh || ')', v_email);
end $$;

-- 8.9 Permisos de ejecución
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    and p.proname in ('is_staff','is_admin','can_branch','create_pos_sale','create_web_order','confirm_web_order','reject_web_order','annul_sale','mark_order',
      'open_cash','close_cash','move_stock','transfer_stock','set_branch_stock','next_doc','stock_add','doc_prefix') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname in ('next_doc', 'stock_add') then null;               -- solo uso interno
    elsif f.proname = 'create_web_order' then execute format('grant execute on function %s to anon, authenticated', f.sig);
    else execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9. ALMACENAMIENTO
--   proofs : fotos de pago de pedidos web (PRIVADO; la tienda sube, solo el personal ve)
--   assets : logos, QR de Yape y sonido de notificación (público; solo admin sube)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit) values ('proofs', 'proofs', false, 6291456)
  on conflict (id) do update set public = false, file_size_limit = 6291456;
insert into storage.buckets (id, name, public, file_size_limit) values ('assets', 'assets', true, 10485760)
  on conflict (id) do update set public = true, file_size_limit = 10485760;
drop policy if exists "proofs sube" on storage.objects;
drop policy if exists "proofs ve" on storage.objects;
drop policy if exists "assets ve" on storage.objects;
drop policy if exists "assets admin sube" on storage.objects;
drop policy if exists "assets admin edita" on storage.objects;
drop policy if exists "assets admin borra" on storage.objects;
create policy "proofs sube" on storage.objects for insert to anon, authenticated with check (bucket_id = 'proofs');
create policy "proofs ve" on storage.objects for select to authenticated using (bucket_id = 'proofs' and is_staff());
create policy "assets ve" on storage.objects for select using (bucket_id = 'assets');
create policy "assets admin sube" on storage.objects for insert to authenticated with check (bucket_id = 'assets' and is_admin());
create policy "assets admin edita" on storage.objects for update to authenticated using (bucket_id = 'assets' and is_admin());
create policy "assets admin borra" on storage.objects for delete to authenticated using (bucket_id = 'assets' and is_admin());

-- Ya no se permite insertar pedidos directo desde la web: ahora pasan por create_web_order()
-- (las políticas viejas "tienda crea pedidos web" y "staff sales" se eliminaron arriba).
-- Nota: products.stock y products.stock_warehouse quedan como columnas heredadas sin uso; el stock real vive en branch_stock.
