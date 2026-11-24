-- =====================================================================
-- schema_v18_culqi.sql · PAGOS EN LÍNEA CON CULQI (Tarjeta, Yape, PagoEfectivo)
-- Ejecuta en Supabase > SQL Editor (después de schema_v17). Es seguro repetirlo. No borra datos.
--
--  1) sales: columnas del pago en línea (estado, medio, ids de Culqi, CIP, vencimiento, correo).
--  2) culqi_events: bitácora de los avisos (webhooks) que envía Culqi.
--  3) create_culqi_order(): crea el pedido web con pago en línea. SOLO lo puede llamar el servidor
--     (service role); reutiliza create_web_order() para no duplicar precios, promos ni validación de stock.
--  4) culqi_begin / culqi_mark / culqi_attach_order / culqi_abandon: transiciones del pago, solo servidor.
--     Un pedido ya pagado NUNCA retrocede (un aviso tardío de «vencido» no lo afecta).
--  5) confirm_web_order(): igual que schema_v16, pero un pedido de Culqi solo se puede aceptar cuando el pago está acreditado.
--  6) track_web_order(): igual que schema_v15, pero además informa el estado del pago (sin datos personales).
--
--  Flujo del stock (no cambia): el stock se descuenta cuando el personal ACEPTA el pedido en «Pedidos web».
-- =====================================================================

-- 1) Columnas del pago en línea
alter table sales add column if not exists pay_status text;            -- pendiente | procesando | pagado | fallido | vencido (solo pedidos pay_mode = 'culqi')
alter table sales add column if not exists pay_method text;            -- tarjeta | yape | pagoefectivo
alter table sales add column if not exists culqi_order_id text;        -- ord_test_xxx / ord_live_xxx
alter table sales add column if not exists culqi_charge_id text;       -- chr_test_xxx / chr_live_xxx
alter table sales add column if not exists pay_cip text;               -- código de pago de PagoEfectivo
alter table sales add column if not exists pay_expires_at timestamptz; -- vencimiento del CIP
alter table sales add column if not exists pay_updated_at timestamptz;
alter table sales add column if not exists customer_email text;
create unique index if not exists sales_culqi_order_uq on sales(culqi_order_id) where culqi_order_id is not null;
create unique index if not exists sales_culqi_charge_uq on sales(culqi_charge_id) where culqi_charge_id is not null;
create index if not exists sales_pay_status_idx on sales(pay_status) where pay_mode = 'culqi';

-- 2) Bitácora de webhooks (sin políticas: solo el servidor la lee/escribe)
create table if not exists culqi_events(
  id text primary key,
  type text,
  sale_id uuid,
  payload jsonb,
  created_at timestamptz default now());
alter table culqi_events enable row level security;

-- 3) Crear pedido con pago en línea (solo servidor)
create or replace function create_culqi_order(p_branch uuid, p_name text, p_phone text, p_email text, p_notes text,
  p_items jsonb, p_lat numeric, p_lng numeric, p_acc int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if coalesce(p_email, '') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(p_email) > 120 then raise exception 'Escribe un correo válido'; end if;
  -- mismas reglas que un pedido normal: sede activa, GPS, precios/promos del servidor, stock y límite por celular
  v := create_web_order(p_branch, p_name, p_phone, p_notes, p_items, 'contra_entrega', null, p_lat, p_lng, p_acc);
  update sales set pay_mode = 'culqi', pay_status = 'pendiente', payment = 'Tarjeta', customer_email = lower(trim(p_email)), pay_updated_at = now()
    where id = (v->>'id')::uuid;
  return v || jsonb_build_object('pay_mode', 'culqi');
end $$;
revoke all on function create_culqi_order(uuid, text, text, text, text, jsonb, numeric, numeric, int) from public, anon, authenticated;
grant execute on function create_culqi_order(uuid, text, text, text, text, jsonb, numeric, numeric, int) to service_role;

-- 4a) Guarda la orden creada en Culqi
create or replace function culqi_attach_order(p_sale uuid, p_order text, p_expires timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  update sales set culqi_order_id = p_order, pay_expires_at = coalesce(p_expires, pay_expires_at), pay_updated_at = now() where id = p_sale and pay_mode = 'culqi';
end $$;
revoke all on function culqi_attach_order(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function culqi_attach_order(uuid, text, timestamptz) to service_role;

-- 4b) Bloqueo antes de cobrar: evita doble cobro (doble clic, dos pestañas) y cobrar un pedido que ya tiene CIP
create or replace function culqi_begin(p_sale uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update sales set pay_status = 'procesando', pay_updated_at = now()
   where id = p_sale and pay_mode = 'culqi' and status = 'pendiente' and pay_cip is null and culqi_charge_id is null
     and (pay_status in ('pendiente', 'fallido') or (pay_status = 'procesando' and pay_updated_at < now() - interval '2 minutes'));
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function culqi_begin(uuid) from public, anon, authenticated;
grant execute on function culqi_begin(uuid) to service_role;

-- 4c) Cambia el estado del pago (idempotente; lo pagado no retrocede)
create or replace function culqi_mark(p_sale uuid, p_status text, p_method text default null, p_charge text default null,
  p_cip text default null, p_expires timestamptz default null)
returns sales language plpgsql security definer set search_path = public as $$
declare v_s sales; v_pay text;
begin
  if p_status not in ('pendiente', 'pagado', 'fallido', 'vencido') then raise exception 'Estado de pago no válido'; end if;
  select * into v_s from sales where id = p_sale and source = 'web' and pay_mode = 'culqi' for update;
  if v_s.id is null then raise exception 'Pedido no encontrado'; end if;
  if v_s.pay_status = 'pagado' then return v_s; end if;       -- ya pagado: no se retrocede ni se duplica
  -- el campo «payment» alimenta cajas y reportes: PagoEfectivo (banca/agentes) entra como Transferencia
  v_pay := case coalesce(p_method, v_s.pay_method) when 'tarjeta' then 'Tarjeta' when 'yape' then 'Yape' when 'pagoefectivo' then 'Transferencia' else v_s.payment end;
  update sales set pay_status = p_status, pay_method = coalesce(p_method, pay_method), culqi_charge_id = coalesce(p_charge, culqi_charge_id),
    pay_cip = coalesce(p_cip, pay_cip), pay_expires_at = coalesce(p_expires, pay_expires_at), pay_updated_at = now(), payment = v_pay,
    paid = (p_status = 'pagado'), paid_at = case when p_status = 'pagado' then now() end
   where id = p_sale returning * into v_s;
  if p_status = 'pagado' then
    insert into audit_log(user_email, action, detail, branch_id)
    values ('culqi@sistema', case when v_s.status = 'anulado' then 'Pago en línea recibido en pedido ANULADO: devolver' else 'Pago en línea acreditado' end,
            v_s.order_number || ' · ' || coalesce(v_s.pay_method, '') || ' · S/ ' || v_s.total, v_s.branch_id);
  end if;
  return v_s;
end $$;
revoke all on function culqi_mark(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function culqi_mark(uuid, text, text, text, text, timestamptz) to service_role;

-- 4d) El cliente cerró el pago sin completarlo (y no generó CIP): el pedido se descarta
create or replace function culqi_abandon(p_sale uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update sales set status = 'anulado', reject_reason = 'Pago en línea no completado', pay_updated_at = now()
   where id = p_sale and pay_mode = 'culqi' and status = 'pendiente' and pay_status in ('pendiente', 'fallido') and pay_cip is null and culqi_charge_id is null;
end $$;
revoke all on function culqi_abandon(uuid) from public, anon, authenticated;
grant execute on function culqi_abandon(uuid) to service_role;

-- 5) Aceptar pedido web (schema_v16) + un pedido de Culqi solo se acepta cuando el pago está acreditado
create or replace function confirm_web_order(p_id uuid, p_voucher text, p_doc text, p_paid boolean, p_payment text default null)
returns sales language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_s sales; x jsonb; v_prod products; v_pre text; v_cash uuid; v_parts jsonb; v_new jsonb := '[]'::jsonb; v_online boolean;
begin
  select * into v_me from profiles where id = auth.uid() and coalesce(active, true);
  if v_me.id is null then raise exception 'Sesión no válida'; end if;
  select * into v_s from sales where id = p_id and source = 'web' for update;
  if v_s.id is null then raise exception 'Pedido no encontrado'; end if;
  if not can_branch(v_s.branch_id) then raise exception 'No tienes acceso a esta sede'; end if;
  if v_s.status <> 'pendiente' then raise exception 'Este pedido ya fue atendido'; end if;
  v_online := v_s.pay_mode = 'culqi';
  if v_online and coalesce(v_s.pay_status, '') <> 'pagado' then
    raise exception 'Este pedido espera el pago en línea (Culqi). Podrás aceptarlo cuando el pago se acredite'; end if;
  select id into v_cash from cash_registers where branch_id = v_s.branch_id and status = 'abierta' and user_email = v_me.email limit 1;
  if v_cash is null then raise exception 'Debes abrir tu caja en la sede % para aceptar pedidos web', coalesce((select name from branches where id = v_s.branch_id), ''); end if;
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

  -- Pedido de Culqi: el método y el cobro los fija Culqi (el personal no los puede cambiar). Cobrado = true.
  update sales set items = v_new, status = 'completado', voucher = p_voucher, number = next_doc(v_s.branch_id, v_pre), customer_doc = nullif(trim(p_doc), ''),
    payment = case when v_online then payment else coalesce(p_payment, payment) end,
    paid = case when v_online then true else coalesce(p_paid, false) end,
    paid_at = case when v_online then coalesce(paid_at, now()) when p_paid then now() end,
    cash_id = case when v_online or p_paid then v_cash end, cash_name = (select name from cash_registers where id = v_cash),
    confirmed_at = now(), confirmed_by = v_me.email, seller_name = coalesce(nullif(v_me.name, ''), split_part(v_me.email, '@', 1)),
    delivery_status = 'por_entregar' where id = p_id returning * into v_s;
  insert into audit_log(user_email, action, detail, branch_id) values (v_me.email, 'Pedido web confirmado', v_s.order_number || ' → ' || v_s.number, v_s.branch_id);
  return v_s;
end $$;

-- 6) Consulta pública del estado (schema_v15) + estado del pago. Nunca devuelve nombre, celular, correo ni productos.
create or replace function track_web_order(p_code text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v text; v_pre text; v_num text; v_s sales; v_branch text; v_stage text;
begin
  v := upper(regexp_replace(translate(coalesce(p_code, ''), '–—−_', '----'), '[^A-Za-z0-9-]', '', 'g'));
  if v ~ '^PW[0-9A-Z]{1,10}-[0-9]{1,12}$' then v_pre := split_part(v, '-', 1); v_num := split_part(v, '-', 2);
  elsif v ~ '^PW[0-9]{3}[0-9]{1,12}$' then v_pre := substr(v, 1, 5); v_num := substr(v, 6);
  else raise exception 'Escribe tu número de pedido, por ejemplo PW001-123'; end if;
  v_num := ltrim(v_num, '0');
  if length(v_num) > 7 then return jsonb_build_object('found', false); end if;
  select * into v_s from sales where order_number = v_pre || '-' || lpad(v_num, 7, '0') and source = 'web';
  if v_s.id is null then return jsonb_build_object('found', false); end if;
  select name into v_branch from branches where id = v_s.branch_id;
  v_stage := case
    when v_s.status = 'anulado' then 'cancelado'
    when v_s.status = 'pendiente' then 'recibido'
    when v_s.delivery_status = 'entregado' then 'entregado'
    when v_s.delivery_status = 'en_camino' then 'en_camino'
    else 'aceptado' end;
  return jsonb_build_object('found', true, 'order_number', v_s.order_number, 'stage', v_stage, 'branch', v_branch,
    'created_at', v_s.created_at, 'confirmed_at', v_s.confirmed_at, 'on_the_way_at', v_s.on_the_way_at, 'delivered_at', v_s.delivered_at,
    'reason', case when v_stage = 'cancelado' then v_s.reject_reason end,
    'pay', case when v_s.pay_mode = 'culqi' then jsonb_build_object('status', coalesce(v_s.pay_status, 'pendiente'), 'method', v_s.pay_method, 'cip', v_s.pay_cip,
      'expires_at', v_s.pay_expires_at, 'paid_at', v_s.paid_at, 'total', v_s.total) end);
end $$;
revoke all on function track_web_order(text) from public;
grant execute on function track_web_order(text) to anon, authenticated;
