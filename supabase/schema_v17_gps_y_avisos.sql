-- =====================================================================
-- schema_v17_gps_y_avisos.sql · UBICACIÓN GPS OBLIGATORIA + AVISOS DE ESTADO DEL PEDIDO
-- Ejecuta en Supabase > SQL Editor (después de schema_v16). Es seguro repetirlo. No borra datos.
--  1) Pedidos web: la dirección escrita a mano desaparece; la ubicación GPS (lat, lng, precisión) es OBLIGATORIA.
--     La «Referencia o comentario» se mantiene. Los pedidos antiguos conservan su dirección.
--  2) Avisos push de estado: el cliente, desde «Estado de pedido», puede activar «Avisarme cuando cambie».
--     Su dispositivo se guarda asociado a ESE pedido (tabla order_push) y el sistema le envía el aviso
--     cuando tú pulses Aceptar / En camino / Entregado / Rechazar / Anular.
-- =====================================================================

-- 1) Ubicación GPS en el pedido
alter table sales add column if not exists geo_lat numeric(9,6);
alter table sales add column if not exists geo_lng numeric(9,6);
alter table sales add column if not exists geo_acc int;          -- precisión en metros reportada por el celular

-- Se reemplaza la versión anterior (sin GPS) para que nadie pueda crear pedidos sin ubicación
drop function if exists create_web_order(uuid, text, text, text, text, jsonb, text, text);
create or replace function create_web_order(p_branch uuid, p_name text, p_phone text, p_notes text,
  p_items jsonb, p_pay_mode text, p_proof text, p_lat numeric, p_lng numeric, p_acc int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b branches; r record; v_prod products; v_have int; v_price numeric; v_tot numeric := 0; v_items jsonb := '[]'::jsonb; v_sale sales;
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

  insert into sales(branch_id, total, subtotal, payment, voucher, customer_name, phone, address, notes, geo_lat, geo_lng, geo_acc, source, status, paid, pay_mode, payment_proof, order_number, items)
  values (p_branch, v_tot, v_tot, case p_pay_mode when 'pagar_ahora' then 'Yape' else 'Efectivo' end, 'Nota de Venta', trim(p_name), trim(p_phone),
    null, nullif(left(trim(coalesce(p_notes, '')), 300), ''), round(p_lat, 6), round(p_lng, 6), least(greatest(p_acc, 0), 100000), 'web', 'pendiente', false, p_pay_mode,
    case p_pay_mode when 'pagar_ahora' then p_proof end, next_doc(p_branch, 'PW'), v_items) returning * into v_sale;
  return jsonb_build_object('id', v_sale.id, 'order_number', v_sale.order_number, 'total', v_sale.total, 'items', v_sale.items, 'created_at', v_sale.created_at,
    'customer_name', v_sale.customer_name, 'phone', v_sale.phone, 'address', v_sale.address, 'notes', v_sale.notes, 'pay_mode', v_sale.pay_mode,
    'geo_lat', v_sale.geo_lat, 'geo_lng', v_sale.geo_lng, 'geo_acc', v_sale.geo_acc,
    'branch', jsonb_build_object('name', v_b.name, 'address', v_b.address, 'city', v_b.city, 'phone', v_b.phone));
end $$;
revoke all on function create_web_order(uuid, text, text, text, jsonb, text, text, numeric, numeric, int) from public;
grant execute on function create_web_order(uuid, text, text, text, jsonb, text, text, numeric, numeric, int) to anon, authenticated;

-- 2) Avisos push por pedido
create table if not exists order_push(
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  unique (sale_id, endpoint));
alter table order_push enable row level security;      -- sin políticas: nadie la lee desde el navegador; solo el servidor (service role)
create index if not exists order_push_sale_idx on order_push(sale_id);

-- El cliente activa los avisos de SU pedido (con el número del ticket, igual que la consulta de estado)
create or replace function subscribe_order_push(p_code text, p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v text; v_pre text; v_num text; v_s sales;
begin
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(coalesce(p_p256dh,'')) not between 40 and 200 or length(coalesce(p_auth,'')) not between 10 and 100 then
    raise exception 'Suscripción no válida'; end if;
  v := upper(regexp_replace(translate(coalesce(p_code, ''), '–—−_', '----'), '[^A-Za-z0-9-]', '', 'g'));
  if v ~ '^PW[0-9A-Z]{1,10}-[0-9]{1,12}$' then v_pre := split_part(v, '-', 1); v_num := split_part(v, '-', 2);
  elsif v ~ '^PW[0-9]{3}[0-9]{1,12}$' then v_pre := substr(v, 1, 5); v_num := substr(v, 6);
  else raise exception 'Escribe tu número de pedido, por ejemplo PW001-123'; end if;
  v_num := ltrim(v_num, '0');
  if length(v_num) > 7 or v_num = '' then return false; end if;
  select * into v_s from sales where order_number = v_pre || '-' || lpad(v_num, 7, '0') and source = 'web';
  if v_s.id is null then return false; end if;
  if (select count(*) from order_push where sale_id = v_s.id) >= 5 and not exists (select 1 from order_push where sale_id = v_s.id and endpoint = p_endpoint) then
    raise exception 'Este pedido ya tiene el máximo de dispositivos con avisos'; end if;
  insert into order_push(sale_id, endpoint, p256dh, auth, user_agent) values (v_s.id, p_endpoint, p_p256dh, p_auth, left(p_ua, 200))
  on conflict (sale_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
  return true;
end $$;
revoke all on function subscribe_order_push(text, text, text, text, text) from public;
grant execute on function subscribe_order_push(text, text, text, text, text) to anon, authenticated;
