-- =====================================================================
-- schema_v20_delivery.sql · COSTO DE DELIVERY SEGÚN LA DISTANCIA (pedidos web)
-- Ejecuta en Supabase > SQL Editor (después de schema_v18). Es seguro repetirlo. No borra datos.
--
-- Regla (la calcula SIEMPRE el servidor con la ubicación GPS del cliente; el navegador solo la muestra):
--   · Hasta 2 km desde la tienda ........................ S/ 3.00
--   · Más de 2 km: cada kilómetro adicional (o fracción) .. + S/ 1.50
--       ej.  1.8 km = S/ 3.00 · 2.3 km = S/ 4.50 · 3.0 km = S/ 4.50 · 3.1 km = S/ 6.00 · 5.4 km = S/ 9.00 ...
--   · Distancia en línea recta (fórmula de Haversine) desde el punto de salida de los pedidos.
--   · Más allá de 30 km no se acepta el pedido por la web (evita cobros absurdos si el celular/PC ubica mal al cliente).
--
-- Punto de salida por defecto: -12.0194788, -76.877243 (tu ubicación). Para otra sede, rellena branches.geo_lat / geo_lng.
-- Cambiar tarifas sin tocar código: inserta en la tabla settings las claves  delivery_base (3), delivery_base_km (2),
-- delivery_extra_per_km (1.5), delivery_max_km (30), delivery_road_factor (1; ej. 1.3 si quieres acercarte a la distancia por calles).
--
-- Guarda en cada pedido: delivery_fee y delivery_km. total = productos + delivery (subtotal = solo productos).
-- Los pedidos de Culqi usan create_web_order(), así que cobran el delivery automáticamente.
-- =====================================================================
alter table sales add column if not exists delivery_fee numeric(10,2) not null default 0;
alter table sales add column if not exists delivery_km numeric(8,2);
alter table branches add column if not exists geo_lat numeric;
alter table branches add column if not exists geo_lng numeric;

-- Lee un número de la tabla settings (con valor por defecto si no existe o no es un número)
create or replace function cfg_num(p_key text, p_def numeric) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select case when (value #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' then (value #>> '{}')::numeric end from settings where key = p_key), p_def) $$;

-- Distancia y costo de delivery desde la sede hasta el cliente
create or replace function delivery_quote(p_branch uuid, p_lat numeric, p_lng numeric) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o_lat float8; o_lng float8; a float8; v_km numeric; v_fee numeric;
  v_base numeric := cfg_num('delivery_base', 3); v_base_km numeric := cfg_num('delivery_base_km', 2);
  v_per numeric := cfg_num('delivery_extra_per_km', 1.5); v_max numeric := cfg_num('delivery_max_km', 30); v_f numeric := cfg_num('delivery_road_factor', 1);
begin
  select coalesce(geo_lat, -12.0194788), coalesce(geo_lng, -76.877243) into o_lat, o_lng from branches where id = p_branch;
  if o_lat is null then o_lat := -12.0194788; o_lng := -76.877243; end if;
  a := power(sin(radians(p_lat::float8 - o_lat) / 2), 2) + cos(radians(o_lat)) * cos(radians(p_lat::float8)) * power(sin(radians(p_lng::float8 - o_lng) / 2), 2);
  v_km := round((6371.0088 * 2 * asin(least(1, sqrt(a))))::numeric * v_f, 2);
  v_fee := v_base + case when v_km > v_base_km then ceil(v_km - v_base_km) * v_per else 0 end;
  return jsonb_build_object('km', v_km, 'fee', v_fee, 'base', v_base, 'base_km', v_base_km, 'per_km', v_per, 'max_km', v_max, 'ok', v_km <= v_max);
end $$;
grant execute on function delivery_quote(uuid, numeric, numeric) to anon, authenticated, service_role;

-- Pedido web (schema_v17) + delivery. Igual que antes; solo suma el costo de envío al total.
create or replace function create_web_order(p_branch uuid, p_name text, p_phone text, p_notes text,
  p_items jsonb, p_pay_mode text, p_proof text, p_lat numeric, p_lng numeric, p_acc int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b branches; r record; v_prod products; v_have int; v_price numeric; v_tot numeric := 0; v_items jsonb := '[]'::jsonb; v_sale sales; v_q jsonb; v_fee numeric := 0;
begin
  select * into v_b from branches where id = p_branch and coalesce(active, true) and coalesce(web_enabled, true);
  if v_b.id is null then raise exception 'La sede seleccionada no recibe pedidos web'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 80 then raise exception 'Escribe tu nombre'; end if;
  if coalesce(p_phone, '') !~ '^[0-9+ ]{6,20}$' then raise exception 'Escribe un celular válido'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or (p_lat = 0 and p_lng = 0) then
    raise exception 'Comparte tu ubicación con el botón «Usar mi ubicación» para poder llevarte el pedido'; end if;
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

  -- DELIVERY: la distancia y el precio los calcula el servidor con la ubicación enviada (el navegador no puede cambiarlos)
  v_q := delivery_quote(p_branch, p_lat, p_lng); v_fee := (v_q->>'fee')::numeric;
  if not (v_q->>'ok')::boolean then
    raise exception 'Estás a % km de la tienda y el delivery llega hasta % km. Escríbenos por WhatsApp para coordinar tu pedido', v_q->>'km', v_q->>'max_km'; end if;

  insert into sales(branch_id, total, subtotal, delivery_fee, delivery_km, payment, voucher, customer_name, phone, address, notes, geo_lat, geo_lng, geo_acc, source, status, paid, pay_mode, payment_proof, order_number, items)
  values (p_branch, v_tot + v_fee, v_tot, v_fee, (v_q->>'km')::numeric, case p_pay_mode when 'pagar_ahora' then 'Yape' else 'Efectivo' end, 'Nota de Venta', trim(p_name), trim(p_phone),
    null, nullif(left(trim(coalesce(p_notes, '')), 300), ''), round(p_lat, 6), round(p_lng, 6), least(greatest(p_acc, 0), 100000), 'web', 'pendiente', false, p_pay_mode,
    case p_pay_mode when 'pagar_ahora' then p_proof end, next_doc(p_branch, 'PW'), v_items) returning * into v_sale;
  return jsonb_build_object('id', v_sale.id, 'order_number', v_sale.order_number, 'total', v_sale.total, 'subtotal', v_sale.subtotal, 'delivery_fee', v_sale.delivery_fee, 'delivery_km', v_sale.delivery_km, 'items', v_sale.items, 'created_at', v_sale.created_at,
    'customer_name', v_sale.customer_name, 'phone', v_sale.phone, 'address', v_sale.address, 'notes', v_sale.notes, 'pay_mode', v_sale.pay_mode,
    'geo_lat', v_sale.geo_lat, 'geo_lng', v_sale.geo_lng, 'geo_acc', v_sale.geo_acc,
    'branch', jsonb_build_object('name', v_b.name, 'address', v_b.address, 'city', v_b.city, 'phone', v_b.phone));
end $$;

revoke all on function create_web_order(uuid, text, text, text, jsonb, text, text, numeric, numeric, int) from public;
grant execute on function create_web_order(uuid, text, text, text, jsonb, text, text, numeric, numeric, int) to anon, authenticated;
