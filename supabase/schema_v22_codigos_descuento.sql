-- =====================================================================
-- schema_v22_codigos_descuento.sql · CÓDIGOS DE DESCUENTO (carrito de la tienda + sección del sistema)
-- Ejecuta en Supabase > SQL Editor (después de schema_v20 y schema_v21). Es seguro repetirlo. No borra datos.
--
-- Qué hace
--   · Tabla discount_codes: los códigos que crea el administrador (quién, cuándo, reglas).
--   · Tabla discount_redemptions: cada vez que un cliente usa un código (quién, cuándo, en qué pedido, cuánto descontó).
--   · El cliente escribe el código en el carrito; el SERVIDOR valida y calcula el descuento (el navegador solo lo muestra).
--   · Tipos de código:
--       - Sobre los PRODUCTOS: % o monto fijo (S/) sobre el total de tu lista de compra.
--       - Sobre el DELIVERY:   % (100 % = delivery gratis) o monto fijo (S/) sobre el costo de envío.
--   · Reglas: compra mínima (en productos), tope máximo de descuento, usos totales, usos por cliente (celular),
--             fechas de inicio/fin (hora de Lima), sede específica o todas, activo/pausado.
--   · Si el pedido se rechaza, se anula o el pago en línea no se completa, el uso se LIBERA solo (el código vuelve a estar disponible).
--   · Guarda en cada pedido: sales.discount_code y sales.code_discount (total = productos + delivery - descuento).
-- =====================================================================

alter table sales add column if not exists discount_code text;
alter table sales add column if not exists code_discount numeric(10,2) not null default 0;

create table if not exists discount_codes(
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text,
  applies_to text not null default 'productos' check (applies_to in ('productos', 'delivery')),
  disc_type text not null default 'percent' check (disc_type in ('percent', 'fixed')),
  value numeric(10,2) not null check (value > 0),
  min_purchase numeric(10,2) not null default 0 check (min_purchase >= 0),
  max_discount numeric(10,2) check (max_discount is null or max_discount > 0),
  max_uses int check (max_uses is null or max_uses > 0),                -- null = ilimitado
  per_customer int not null default 1 check (per_customer >= 0),        -- usos por celular · 0 = ilimitado
  starts_at date,
  expires_at date,
  branch_id uuid references branches(id),                               -- null = todas las sedes
  active boolean not null default true,
  created_by text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists discount_codes_code_uq on discount_codes(upper(code));

create table if not exists discount_redemptions(
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references discount_codes(id) on delete cascade,
  code text not null,
  sale_id uuid references sales(id) on delete set null,
  order_number text,
  customer_name text,
  phone text,
  branch_id uuid references branches(id),
  discount numeric(10,2) not null default 0,
  used_at timestamptz not null default now(),
  released_at timestamptz,                                              -- si el pedido se anuló/rechazó, el uso se libera
  release_reason text
);
create index if not exists discount_redemptions_code_idx on discount_redemptions(code_id, used_at desc);
create index if not exists discount_redemptions_sale_idx on discount_redemptions(sale_id);

-- Seguridad: solo el administrador lee; todo lo demás pasa por las funciones de abajo
alter table discount_codes enable row level security;
alter table discount_redemptions enable row level security;
drop policy if exists "dc admin lee" on discount_codes;
create policy "dc admin lee" on discount_codes for select to authenticated using (is_admin());
drop policy if exists "dr admin lee" on discount_redemptions;
create policy "dr admin lee" on discount_redemptions for select to authenticated using (is_admin());

-- Últimos 9 dígitos del celular (para contar usos por cliente aunque lo escriba con +51 o con espacios)
create or replace function norm_phone(p text) returns text language sql immutable as $$ select right(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 9) $$;

-- Subtotal de productos con los precios/promos del servidor (para validar el código antes de pedir)
create or replace function cart_subtotal(p_items jsonb) returns numeric language plpgsql stable security definer set search_path = public as $$
declare v numeric := 0; r record; p products;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 60 then return 0; end if;
  for r in select (x->>'id')::uuid as id, sum(least(greatest((x->>'qty')::int, 0), 99)) as qty from jsonb_array_elements(p_items) x group by 1 loop
    select * into p from products where id = r.id and active;
    if p.id is not null then v := v + eff_price(p) * r.qty; end if;
  end loop;
  return v;
end $$;
revoke all on function cart_subtotal(jsonb) from public;

-- Regla única: valida un código y calcula el descuento. La usan el carrito (vista previa) y el pedido (definitivo).
--   p_sub = subtotal de productos · p_fee = costo de delivery (null si aún no hay ubicación) · p_lock = bloquea el código al pedir
create or replace function discount_eval(p_code text, p_branch uuid, p_sub numeric, p_fee numeric, p_phone text, p_lock boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c discount_codes; v_today date := (now() at time zone 'America/Lima')::date; v_used int; v_mine int; v_base numeric; v_d numeric; v_ph text := norm_phone(p_phone);
begin
  if nullif(trim(coalesce(p_code, '')), '') is null then return jsonb_build_object('ok', false, 'error', 'Escribe tu código de descuento'); end if;
  if p_lock then select * into c from discount_codes where upper(code) = upper(trim(p_code)) for update;
  else select * into c from discount_codes where upper(code) = upper(trim(p_code)); end if;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Este código no existe o no es válido'); end if;
  if not c.active then return jsonb_build_object('ok', false, 'error', 'Este código está desactivado'); end if;
  if c.starts_at is not null and v_today < c.starts_at then return jsonb_build_object('ok', false, 'error', 'Este código estará disponible desde el ' || to_char(c.starts_at, 'DD/MM/YYYY')); end if;
  if c.expires_at is not null and v_today > c.expires_at then return jsonb_build_object('ok', false, 'error', 'Este código venció el ' || to_char(c.expires_at, 'DD/MM/YYYY')); end if;
  if c.branch_id is not null and p_branch is not null and c.branch_id <> p_branch then return jsonb_build_object('ok', false, 'error', 'Este código no es válido en la sede que elegiste'); end if;
  if c.min_purchase > 0 and coalesce(p_sub, 0) < c.min_purchase then
    return jsonb_build_object('ok', false, 'error', 'Este código es para compras desde S/ ' || to_char(c.min_purchase, 'FM999990.00') || ' en productos (llevas S/ ' || to_char(coalesce(p_sub, 0), 'FM999990.00') || ')'); end if;
  select count(*) into v_used from discount_redemptions where code_id = c.id and released_at is null;
  if c.max_uses is not null and v_used >= c.max_uses then return jsonb_build_object('ok', false, 'error', 'Este código ya alcanzó su límite de usos'); end if;
  if c.per_customer > 0 and length(v_ph) >= 6 then
    select count(*) into v_mine from discount_redemptions where code_id = c.id and released_at is null and norm_phone(phone) = v_ph;
    if v_mine >= c.per_customer then return jsonb_build_object('ok', false, 'error', case when c.per_customer = 1 then 'Ya usaste este código con tu celular' else 'Ya alcanzaste el límite de usos de este código con tu celular' end); end if;
  end if;
  v_base := case c.applies_to when 'productos' then coalesce(p_sub, 0) else p_fee end;
  if v_base is null then
    return jsonb_build_object('ok', true, 'need_gps', true, 'id', c.id, 'code', c.code, 'applies_to', c.applies_to, 'disc_type', c.disc_type, 'value', c.value, 'description', c.description, 'discount', 0); end if;
  v_d := case c.disc_type when 'percent' then round(v_base * least(c.value, 100) / 100, 2) else c.value end;
  if c.max_discount is not null then v_d := least(v_d, c.max_discount); end if;
  v_d := least(v_d, v_base);
  if v_d <= 0 then return jsonb_build_object('ok', false, 'error', case c.applies_to when 'delivery' then 'Tu delivery ya no tiene costo para descontar' else 'Este código no genera descuento en tu compra' end); end if;
  return jsonb_build_object('ok', true, 'id', c.id, 'code', c.code, 'applies_to', c.applies_to, 'disc_type', c.disc_type, 'value', c.value, 'description', c.description, 'discount', v_d);
end $$;
revoke all on function discount_eval(text, uuid, numeric, numeric, text, boolean) from public;

-- Vista previa en el carrito (la puede llamar cualquier visitante; no cambia nada)
create or replace function validate_discount_code(p_code text, p_branch uuid, p_items jsonb, p_phone text default null, p_lat numeric default null, p_lng numeric default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_sub numeric := cart_subtotal(p_items); v_fee numeric := null; v_q jsonb;
begin
  if v_sub <= 0 then return jsonb_build_object('ok', false, 'error', 'Agrega productos al carrito para usar tu código'); end if;
  if p_lat is not null and p_lng is not null and p_lat between -90 and 90 and p_lng between -180 and 180 and not (p_lat = 0 and p_lng = 0) then
    v_q := delivery_quote(p_branch, p_lat, p_lng); v_fee := (v_q->>'fee')::numeric; end if;
  return discount_eval(p_code, p_branch, v_sub, v_fee, p_phone, false) || jsonb_build_object('subtotal', v_sub);
end $$;
revoke all on function validate_discount_code(text, uuid, jsonb, text, numeric, numeric) from public;
grant execute on function validate_discount_code(text, uuid, jsonb, text, numeric, numeric) to anon, authenticated;

-- Pedido web (schema_v20) + código de descuento. La firma cambia (suma p_code), por eso se reemplaza la anterior.
drop function if exists create_web_order(uuid, text, text, text, jsonb, text, text, numeric, numeric, int);
create or replace function create_web_order(p_branch uuid, p_name text, p_phone text, p_notes text,
  p_items jsonb, p_pay_mode text, p_proof text, p_lat numeric, p_lng numeric, p_acc int default null, p_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b branches; r record; v_prod products; v_have int; v_price numeric; v_tot numeric := 0; v_items jsonb := '[]'::jsonb; v_sale sales; v_q jsonb; v_fee numeric := 0;
  v_e jsonb; v_disc numeric := 0; v_dcode text;
begin
  select * into v_b from branches where id = p_branch and coalesce(active, true) and coalesce(web_enabled, true);
  if v_b.id is null then raise exception 'La sede seleccionada no recibe pedidos web'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 80 then raise exception 'Escribe tu nombre'; end if;
  if coalesce(p_phone, '') !~ '^[0-9+ ]{6,20}$' then raise exception 'Escribe un celular válido'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or (p_lat = 0 and p_lng = 0) then
    raise exception 'Comparte tu ubicación con el botón «Usar mi ubicación» para poder llevarte el pedido'; end if;
  -- 'culqi' solo lo puede usar create_culqi_order (marca app.culqi_order): así el pedido nace ya como pago en línea y NO suena el aviso hasta que Culqi confirme el pago
  if p_pay_mode not in ('contra_entrega', 'pagar_ahora') and not (p_pay_mode = 'culqi' and coalesce(current_setting('app.culqi_order', true), '') = '1') then raise exception 'Elige una forma de pago'; end if;
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

  v_q := delivery_quote(p_branch, p_lat, p_lng); v_fee := (v_q->>'fee')::numeric;
  if not (v_q->>'ok')::boolean then
    raise exception 'Estás a % km de la tienda y el delivery llega hasta % km. Escríbenos por WhatsApp para coordinar tu pedido', v_q->>'km', v_q->>'max_km'; end if;

  -- CÓDIGO DE DESCUENTO: lo valida y calcula el servidor (bloquea el código para que dos pedidos no lo usen a la vez)
  if nullif(trim(coalesce(p_code, '')), '') is not null then
    v_e := discount_eval(p_code, p_branch, v_tot, v_fee, p_phone, true);
    if not (v_e->>'ok')::boolean then raise exception '%', v_e->>'error'; end if;
    v_disc := (v_e->>'discount')::numeric; v_dcode := v_e->>'code';
  end if;

  insert into sales(branch_id, total, subtotal, delivery_fee, delivery_km, discount_code, code_discount, payment, voucher, customer_name, phone, address, notes, geo_lat, geo_lng, geo_acc, source, status, paid, pay_mode, pay_status, pay_updated_at, payment_proof, order_number, items)
  values (p_branch, v_tot + v_fee - v_disc, v_tot, v_fee, (v_q->>'km')::numeric, v_dcode, v_disc, case p_pay_mode when 'pagar_ahora' then 'Yape' when 'culqi' then 'Tarjeta' else 'Efectivo' end, 'Nota de Venta', trim(p_name), trim(p_phone),
    null, nullif(left(trim(coalesce(p_notes, '')), 300), ''), round(p_lat, 6), round(p_lng, 6), least(greatest(p_acc, 0), 100000), 'web', 'pendiente', false, p_pay_mode,
    case when p_pay_mode = 'culqi' then 'pendiente' end, case when p_pay_mode = 'culqi' then now() end,
    case p_pay_mode when 'pagar_ahora' then p_proof end, next_doc(p_branch, 'PW'), v_items) returning * into v_sale;

  if v_dcode is not null then
    insert into discount_redemptions(code_id, code, sale_id, order_number, customer_name, phone, branch_id, discount)
    values ((v_e->>'id')::uuid, v_dcode, v_sale.id, v_sale.order_number, v_sale.customer_name, v_sale.phone, p_branch, v_disc);
  end if;

  return jsonb_build_object('id', v_sale.id, 'order_number', v_sale.order_number, 'total', v_sale.total, 'subtotal', v_sale.subtotal, 'delivery_fee', v_sale.delivery_fee, 'delivery_km', v_sale.delivery_km,
    'discount_code', v_sale.discount_code, 'code_discount', v_sale.code_discount, 'items', v_sale.items, 'created_at', v_sale.created_at,
    'customer_name', v_sale.customer_name, 'phone', v_sale.phone, 'address', v_sale.address, 'notes', v_sale.notes, 'pay_mode', v_sale.pay_mode,
    'geo_lat', v_sale.geo_lat, 'geo_lng', v_sale.geo_lng, 'geo_acc', v_sale.geo_acc,
    'branch', jsonb_build_object('name', v_b.name, 'address', v_b.address, 'city', v_b.city, 'phone', v_b.phone));
end $$;
revoke all on function create_web_order(uuid, text, text, text, jsonb, text, text, numeric, numeric, int, text) from public;
grant execute on function create_web_order(uuid, text, text, text, jsonb, text, text, numeric, numeric, int, text) to anon, authenticated;

-- Pedido con pago en línea (schema_v18) + código. Solo el servidor (service role) lo puede llamar.
drop function if exists create_culqi_order(uuid, text, text, text, text, jsonb, numeric, numeric, int);
create or replace function create_culqi_order(p_branch uuid, p_name text, p_phone text, p_email text, p_notes text,
  p_items jsonb, p_lat numeric, p_lng numeric, p_acc int default null, p_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if coalesce(p_email, '') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(p_email) > 120 then raise exception 'Escribe un correo válido'; end if;
  perform set_config('app.culqi_order', '1', true);      -- el pedido se crea YA como pago en línea (sin sonido en el sistema hasta que se acredite)
  v := create_web_order(p_branch, p_name, p_phone, p_notes, p_items, 'culqi', null, p_lat, p_lng, p_acc, p_code);
  perform set_config('app.culqi_order', '', true);
  update sales set customer_email = lower(trim(p_email)) where id = (v->>'id')::uuid;
  return v || jsonb_build_object('pay_mode', 'culqi');
end $$;
revoke all on function create_culqi_order(uuid, text, text, text, text, jsonb, numeric, numeric, int, text) from public, anon, authenticated;
grant execute on function create_culqi_order(uuid, text, text, text, text, jsonb, numeric, numeric, int, text) to service_role;

-- Si el pedido se rechaza, se anula o el pago en línea no se completa: el uso del código se libera (vuelve a estar disponible)
create or replace function discount_release() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'anulado' and old.status is distinct from 'anulado' then
    update discount_redemptions set released_at = now(), release_reason = coalesce(nullif(trim(new.reject_reason), ''), 'Pedido anulado')
     where sale_id = new.id and released_at is null;
  end if;
  return new;
end $$;
drop trigger if exists sales_discount_release on sales;
create trigger sales_discount_release after update of status on sales for each row execute function discount_release();

-- ---------------------------------------------------------------------
-- Administración (solo administrador): crear / editar / pausar / eliminar
-- ---------------------------------------------------------------------
create or replace function save_discount_code(p jsonb) returns discount_codes language plpgsql security definer set search_path = public as $$
declare me profiles; v_id uuid := nullif(p->>'id', '')::uuid; v_code text := upper(trim(coalesce(p->>'code', ''))); old discount_codes; v discount_codes;
  v_applies text := coalesce(p->>'applies_to', 'productos'); v_type text := coalesce(p->>'disc_type', 'percent'); v_val numeric := nullif(p->>'value', '')::numeric;
  v_min numeric := coalesce(nullif(p->>'min_purchase', '')::numeric, 0); v_max numeric := nullif(p->>'max_discount', '')::numeric;
  v_uses int := nullif(p->>'max_uses', '')::int; v_per int := coalesce(nullif(p->>'per_customer', '')::int, 1);
  v_from date := nullif(p->>'starts_at', '')::date; v_to date := nullif(p->>'expires_at', '')::date; v_branch uuid := nullif(p->>'branch_id', '')::uuid;
begin
  select * into me from profiles where id = auth.uid() and role = 'administrador' and coalesce(active, true);
  if me.id is null then raise exception 'Solo el administrador puede gestionar códigos de descuento'; end if;
  if v_code !~ '^[A-Z0-9_-]{3,24}$' then raise exception 'El código debe tener de 3 a 24 caracteres: letras, números, guion o guion bajo (sin espacios)'; end if;
  if v_applies not in ('productos', 'delivery') then raise exception 'Tipo de descuento no válido'; end if;
  if v_type not in ('percent', 'fixed') then raise exception 'Tipo de valor no válido'; end if;
  if v_val is null or v_val <= 0 then raise exception 'Escribe el valor del descuento'; end if;
  if v_type = 'percent' and v_val > 100 then raise exception 'El porcentaje no puede pasar de 100'; end if;
  if v_min < 0 or (v_max is not null and v_max <= 0) or (v_uses is not null and v_uses <= 0) or v_per < 0 then raise exception 'Revisa los límites del código'; end if;
  if v_from is not null and v_to is not null and v_to < v_from then raise exception 'La fecha final es anterior a la inicial'; end if;
  if v_id is null then
    insert into discount_codes(code, description, applies_to, disc_type, value, min_purchase, max_discount, max_uses, per_customer, starts_at, expires_at, branch_id, active, created_by, created_by_name)
    values (v_code, nullif(left(trim(coalesce(p->>'description', '')), 200), ''), v_applies, v_type, v_val, v_min, v_max, v_uses, v_per, v_from, v_to, v_branch, coalesce((p->>'active')::boolean, true), me.email, coalesce(nullif(me.name, ''), split_part(me.email, '@', 1)))
    returning * into v;
    insert into audit_log(user_email, action, detail) values (me.email, 'Código de descuento creado', v.code);
  else
    select * into old from discount_codes where id = v_id for update;
    if old.id is null then raise exception 'Código no encontrado'; end if;
    if old.code <> v_code and exists(select 1 from discount_redemptions where code_id = v_id) then raise exception 'Este código ya se usó: no se puede cambiar su texto. Créalo de nuevo con otro nombre'; end if;
    update discount_codes set code = v_code, description = nullif(left(trim(coalesce(p->>'description', '')), 200), ''), applies_to = v_applies, disc_type = v_type, value = v_val, min_purchase = v_min,
      max_discount = v_max, max_uses = v_uses, per_customer = v_per, starts_at = v_from, expires_at = v_to, branch_id = v_branch, active = coalesce((p->>'active')::boolean, active), updated_at = now()
     where id = v_id returning * into v;
    insert into audit_log(user_email, action, detail) values (me.email, 'Código de descuento editado', v.code);
  end if;
  return v;
exception when unique_violation then raise exception 'Ya existe un código llamado %', v_code;
end $$;
revoke all on function save_discount_code(jsonb) from public, anon;
grant execute on function save_discount_code(jsonb) to authenticated;

create or replace function set_discount_active(p_id uuid, p_active boolean) returns discount_codes language plpgsql security definer set search_path = public as $$
declare me profiles; v discount_codes;
begin
  select * into me from profiles where id = auth.uid() and role = 'administrador' and coalesce(active, true);
  if me.id is null then raise exception 'Solo el administrador puede gestionar códigos de descuento'; end if;
  update discount_codes set active = p_active, updated_at = now() where id = p_id returning * into v;
  if v.id is null then raise exception 'Código no encontrado'; end if;
  insert into audit_log(user_email, action, detail) values (me.email, case when p_active then 'Código de descuento activado' else 'Código de descuento pausado' end, v.code);
  return v;
end $$;
revoke all on function set_discount_active(uuid, boolean) from public, anon;
grant execute on function set_discount_active(uuid, boolean) to authenticated;

create or replace function delete_discount_code(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare me profiles; v discount_codes;
begin
  select * into me from profiles where id = auth.uid() and role = 'administrador' and coalesce(active, true);
  if me.id is null then raise exception 'Solo el administrador puede gestionar códigos de descuento'; end if;
  select * into v from discount_codes where id = p_id;
  if v.id is null then raise exception 'Código no encontrado'; end if;
  if exists(select 1 from discount_redemptions where code_id = p_id) then raise exception 'Este código ya tiene usos registrados: no se puede eliminar. Pausa el código para que nadie más lo use'; end if;
  delete from discount_codes where id = p_id;
  insert into audit_log(user_email, action, detail) values (me.email, 'Código de descuento eliminado', v.code);
end $$;
revoke all on function delete_discount_code(uuid) from public, anon;
grant execute on function delete_discount_code(uuid) to authenticated;
