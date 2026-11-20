-- =====================================================================
-- schema_v9.sql · COMBOS Y PROMOCIONES
-- Ejecuta después de schema_v8.sql. Es seguro repetirlo.
-- =====================================================================
-- COMBOS: son productos (kind = 'combo') con una receta (combo_items). No tienen stock propio:
--   su disponibilidad = lo que alcance de los productos que lo componen, y al venderlos
--   (POS o web) se descuentan esos productos de la sede. Al anular se devuelven.
-- PROMOCIONES: precio rebajado por rango de fechas y/o días de la semana, sobre productos o combos.
--   El precio final siempre lo calcula la base de datos (hora de Lima).

alter table products add column if not exists kind text not null default 'producto';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_kind_chk') then
    alter table products add constraint products_kind_chk check (kind in ('producto', 'combo')); end if;
end $$;

create table if not exists combo_items(
  combo_id uuid not null references products(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  qty int not null default 1 check (qty > 0),
  primary key (combo_id, product_id));
alter table combo_items enable row level security;
drop policy if exists "combo_items lee" on combo_items;
drop policy if exists "combo_items admin" on combo_items;
create policy "combo_items lee" on combo_items for select to anon, authenticated using (true);
create policy "combo_items admin" on combo_items for all to authenticated using (is_admin()) with check (is_admin());

create table if not exists promotions(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  start_date date,                       -- null = sin fecha de inicio
  end_date date,                         -- null = sin fecha de fin (inclusive)
  days int[] not null default '{}',      -- 0=domingo … 6=sábado. Vacío = todos los días
  disc_type text not null default 'percent' check (disc_type in ('percent', 'price')),
  value numeric not null check (value >= 0),   -- % de descuento, o precio final por unidad
  product_ids uuid[] not null default '{}',
  created_at timestamptz not null default now());
alter table promotions enable row level security;
drop policy if exists "promos lee" on promotions;
drop policy if exists "promos staff" on promotions;
drop policy if exists "promos admin" on promotions;
create policy "promos lee" on promotions for select to anon using (active);
create policy "promos staff" on promotions for select to authenticated using (is_staff());
create policy "promos admin" on promotions for all to authenticated using (is_admin()) with check (is_admin());

-- ¿Está vigente la promoción ahora (hora de Lima)?
create or replace function promo_live(p promotions) returns boolean language sql stable set search_path = public as $$
  select p.active
    and (p.start_date is null or (now() at time zone 'America/Lima')::date >= p.start_date)
    and (p.end_date is null or (now() at time zone 'America/Lima')::date <= p.end_date)
    and (coalesce(array_length(p.days, 1), 0) = 0 or extract(dow from now() at time zone 'America/Lima')::int = any(p.days)) $$;

-- Precio vigente de un producto/combo (la mejor promoción vigente, o el precio normal)
create or replace function eff_price(p products) returns numeric language sql stable set search_path = public as $$
  select coalesce(least(p.price, min(case pr.disc_type when 'percent' then round(p.price * (1 - least(pr.value, 100) / 100), 2) else pr.value end)), p.price)
  from promotions pr where p.id = any(pr.product_ids) and promo_live(pr) $$;

-- Disponible para vender en la sede (producto: stock de tienda; combo: lo que alcance de sus componentes)
create or replace function avail_stock(p_branch uuid, p_prod products) returns int language sql stable security definer set search_path = public as $$
  select case when p_prod.kind = 'combo' then
    coalesce((select min(floor(coalesce(bs.stock, 0)::numeric / ci.qty))::int from combo_items ci
              left join branch_stock bs on bs.branch_id = p_branch and bs.product_id = ci.product_id
              where ci.combo_id = p_prod.id), 0)
  else coalesce((select stock from branch_stock where branch_id = p_branch and product_id = p_prod.id), 0) end $$;

-- Stock que ve el sistema y la tienda (ya incluye los combos calculados). p_branch null = todas las sedes permitidas.
create or replace function stock_view(p_branch uuid default null)
returns table(branch_id uuid, product_id uuid, stock int, stock_warehouse int)
language sql stable security definer set search_path = public as $$
  select bs.branch_id, bs.product_id, bs.stock, bs.stock_warehouse
  from branch_stock bs join products p on p.id = bs.product_id join branches b on b.id = bs.branch_id
  where p.kind <> 'combo' and (p_branch is null or bs.branch_id = p_branch)
    and (can_branch(b.id) or (coalesce(b.active, true) and coalesce(b.web_enabled, true)))
  union all
  select b.id, c.id, avail_stock(b.id, c), 0
  from branches b cross join products c
  where c.kind = 'combo' and (p_branch is null or b.id = p_branch)
    and (can_branch(b.id) or (coalesce(b.active, true) and coalesce(b.web_enabled, true))) $$;
grant execute on function stock_view(uuid) to anon, authenticated;

-- Descuenta (producto o combo) y devuelve las partes descontadas (null si es un producto normal)
create or replace function take_stock(p_branch uuid, p_prod products, p_qty int, p_dir text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record; v_parts jsonb;
begin
  if p_prod.kind = 'combo' then
    if not exists (select 1 from combo_items where combo_id = p_prod.id) then raise exception 'El combo "%" no tiene productos', p_prod.name; end if;
    for c in select ci.product_id as pid, ci.qty * p_qty as q, pp.name from combo_items ci join products pp on pp.id = ci.product_id
             where ci.combo_id = p_prod.id order by ci.product_id loop
      update branch_stock set stock = stock - c.q where branch_id = p_branch and product_id = c.pid and stock >= c.q;
      if not found then raise exception 'Stock insuficiente de "%" para el combo "%"', c.name, p_prod.name; end if;
      insert into stock_moves(branch_id, product_id, product_name, qty, direction, user_email) values (p_branch, c.pid, c.name, c.q, p_dir || ' · ' || p_prod.name, p_email);
    end loop;
    select jsonb_agg(jsonb_build_object('id', ci.product_id, 'name', pp.name, 'qty', ci.qty)) into v_parts
      from combo_items ci join products pp on pp.id = ci.product_id where ci.combo_id = p_prod.id;
    return v_parts;
  end if;
  update branch_stock set stock = stock - p_qty where branch_id = p_branch and product_id = p_prod.id and stock >= p_qty;
  if not found then raise exception 'Stock insuficiente de "%" en esta sede', p_prod.name; end if;
  insert into stock_moves(branch_id, product_id, product_name, qty, direction, user_email) values (p_branch, p_prod.id, p_prod.name, p_qty, p_dir, p_email);
  return null;
end $$;
revoke all on function take_stock(uuid, products, int, text, text) from public;

-- Venta en el punto de venta (con combos y promociones)
create or replace function create_pos_sale(p_branch uuid, p_cash uuid, p_items jsonb, p_voucher text, p_payment text,
  p_customer_id uuid, p_customer_name text, p_phone text, p_doc text, p_discount numeric default 0)
returns sales language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_box cash_registers; r record; v_prod products; v_sub numeric := 0; v_tot numeric; v_price numeric; v_parts jsonb;
  v_items jsonb := '[]'::jsonb; v_sale sales; v_pre text; v_disc numeric; v_it jsonb;
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
    v_price := eff_price(v_prod);
    v_parts := take_stock(p_branch, v_prod, r.qty::int, 'Venta POS', v_me.email);
    v_it := jsonb_build_object('id', v_prod.id, 'name', v_prod.name, 'price', v_price, 'qty', r.qty);
    if v_price < v_prod.price then v_it := v_it || jsonb_build_object('regular_price', v_prod.price); end if;
    if v_parts is not null then v_it := v_it || jsonb_build_object('parts', v_parts); end if;
    v_items := v_items || v_it;
    v_sub := v_sub + v_price * r.qty;
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

-- Pedido web: recalcula precios (con promociones), revisa stock (combos incluidos) y NO descuenta
create or replace function create_web_order(p_branch uuid, p_name text, p_phone text, p_address text, p_notes text,
  p_items jsonb, p_pay_mode text, p_proof text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b branches; r record; v_prod products; v_have int; v_price numeric; v_tot numeric := 0; v_items jsonb := '[]'::jsonb; v_sale sales;
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
    v_have := avail_stock(p_branch, v_prod);
    if v_have < r.qty then raise exception 'Solo quedan % unidad(es) de "%" en esta sede', v_have, v_prod.name; end if;
    v_price := eff_price(v_prod);
    v_items := v_items || jsonb_build_object('id', v_prod.id, 'name', v_prod.name, 'price', v_price, 'qty', r.qty);
    v_tot := v_tot + v_price * r.qty;
  end loop;

  insert into sales(branch_id, total, subtotal, payment, voucher, customer_name, phone, address, notes, source, status, paid, pay_mode, payment_proof, order_number, items)
  values (p_branch, v_tot, v_tot, case p_pay_mode when 'pagar_ahora' then 'Yape' else 'Efectivo' end, 'Nota de Venta', trim(p_name), trim(p_phone),
    nullif(trim(p_address), ''), nullif(trim(p_notes), ''), 'web', 'pendiente', false, p_pay_mode, case p_pay_mode when 'pagar_ahora' then p_proof end,
    next_doc(p_branch, 'PW'), v_items) returning * into v_sale;
  return jsonb_build_object('id', v_sale.id, 'order_number', v_sale.order_number, 'total', v_sale.total, 'items', v_sale.items, 'created_at', v_sale.created_at,
    'customer_name', v_sale.customer_name, 'phone', v_sale.phone, 'address', v_sale.address, 'notes', v_sale.notes, 'pay_mode', v_sale.pay_mode,
    'branch', jsonb_build_object('name', v_b.name, 'address', v_b.address, 'city', v_b.city, 'phone', v_b.phone));
end $$;

-- Confirmar pedido web: descuenta stock (y componentes de combos) y emite el comprobante
create or replace function confirm_web_order(p_id uuid, p_voucher text, p_doc text, p_paid boolean, p_payment text default null)
returns sales language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_s sales; x jsonb; v_prod products; v_pre text; v_cash uuid; v_parts jsonb; v_new jsonb := '[]'::jsonb;
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

  for x in select e from jsonb_array_elements(v_s.items) e order by e->>'id' loop
    select * into v_prod from products where id = (x->>'id')::uuid;
    if v_prod.id is null then raise exception 'Un producto del pedido ya no existe. Rechaza el pedido'; end if;
    v_parts := take_stock(v_s.branch_id, v_prod, (x->>'qty')::int, 'Pedido web ' || v_s.order_number, v_me.email);
    v_new := v_new || case when v_parts is null then x else x || jsonb_build_object('parts', v_parts) end;
  end loop;

  select id into v_cash from cash_registers where branch_id = v_s.branch_id and status = 'abierta' and user_email = v_me.email limit 1;
  update sales set items = v_new, status = 'completado', voucher = p_voucher, number = next_doc(v_s.branch_id, v_pre), customer_doc = nullif(trim(p_doc), ''),
    payment = coalesce(p_payment, payment), paid = coalesce(p_paid, false), paid_at = case when p_paid then now() end,
    cash_id = case when p_paid then v_cash end, cash_name = (select name from cash_registers where id = v_cash),
    confirmed_at = now(), confirmed_by = v_me.email, seller_name = coalesce(nullif(v_me.name, ''), split_part(v_me.email, '@', 1)),
    delivery_status = 'por_entregar' where id = p_id returning * into v_s;
  insert into audit_log(user_email, action, detail, branch_id) values (v_me.email, 'Pedido web confirmado', v_s.order_number || ' → ' || v_s.number, v_s.branch_id);
  return v_s;
end $$;

-- Anular comprobante: devuelve el stock (los combos devuelven sus componentes)
create or replace function annul_sale(p_id uuid) returns sales language plpgsql security definer set search_path = public as $$
declare v_s sales; x jsonb; pt jsonb; v_email text;
begin
  select * into v_s from sales where id = p_id for update;
  if v_s.id is null or not can_branch(v_s.branch_id) then raise exception 'Comprobante no encontrado'; end if;
  if v_s.status = 'anulado' then raise exception 'Ya está anulado'; end if;
  select email into v_email from profiles where id = auth.uid();
  if v_s.status = 'completado' then
    for x in select e from jsonb_array_elements(v_s.items) e loop
      if jsonb_typeof(x->'parts') = 'array' then
        for pt in select e from jsonb_array_elements(x->'parts') e loop
          perform stock_add(v_s.branch_id, (pt->>'id')::uuid, ((pt->>'qty')::int * (x->>'qty')::int));
          insert into stock_moves(branch_id, product_id, product_name, qty, direction, user_email)
          values (v_s.branch_id, (pt->>'id')::uuid, pt->>'name', (pt->>'qty')::int * (x->>'qty')::int, 'Anulación ' || coalesce(v_s.number, '') || ' · ' || (x->>'name'), v_email);
        end loop;
      else
        perform stock_add(v_s.branch_id, (x->>'id')::uuid, (x->>'qty')::int);
        insert into stock_moves(branch_id, product_id, product_name, qty, direction, user_email)
        values (v_s.branch_id, (x->>'id')::uuid, x->>'name', (x->>'qty')::int, 'Anulación ' || coalesce(v_s.number, ''), v_email);
      end if;
    end loop;
  end if;
  update sales set status = 'anulado' where id = p_id returning * into v_s;
  insert into audit_log(user_email, action, detail, branch_id) values (v_email, 'Comprobante anulado', coalesce(v_s.number, v_s.order_number), v_s.branch_id);
  return v_s;
end $$;

-- Las alertas de stock no incluyen combos (su stock se calcula)
create or replace function low_stock(p_branch uuid default null)
returns table(branch_id uuid, branch_name text, product_id uuid, name text, sku text, category text,
              stock int, warehouse int, total int, min_stock int, status text)
language sql stable security invoker set search_path = public as $$
  select b.id, b.name, p.id, p.name, p.sku, p.category,
         coalesce(bs.stock, 0), coalesce(bs.stock_warehouse, 0), coalesce(bs.stock, 0) + coalesce(bs.stock_warehouse, 0), p.min_stock,
         case when coalesce(bs.stock, 0) + coalesce(bs.stock_warehouse, 0) <= 0 then 'agotado' else 'bajo' end
  from branches b
  cross join products p
  left join branch_stock bs on bs.branch_id = b.id and bs.product_id = p.id
  where coalesce(p.active, true) and p.kind <> 'combo' and coalesce(b.active, true) and can_branch(b.id)
    and (p_branch is null or b.id = p_branch)
    and (coalesce(bs.stock, 0) + coalesce(bs.stock_warehouse, 0) <= 0
         or (p.min_stock > 0 and coalesce(bs.stock, 0) + coalesce(bs.stock_warehouse, 0) <= p.min_stock))
  order by (coalesce(bs.stock, 0) + coalesce(bs.stock_warehouse, 0) > 0), p.name, b.name $$;
revoke all on function low_stock(uuid) from public;
grant execute on function low_stock(uuid) to authenticated;

revoke all on function promo_live(promotions) from public;
revoke all on function eff_price(products) from public;
revoke all on function avail_stock(uuid, products) from public;
