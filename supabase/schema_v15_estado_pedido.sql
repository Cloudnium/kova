-- =====================================================================
-- schema_v15_estado_pedido.sql · "ESTADO DE PEDIDO" en la tienda
-- Ejecuta en Supabase > SQL Editor (después de schema_v14). Es seguro repetirlo.
--  1) Nuevo estado de entrega "en camino" (delivery_status: por_entregar | en_camino | entregado)
--  2) mark_order() acepta la acción 'on_the_way' (botón "En camino" en Pedidos web)
--  3) track_web_order(): consulta PÚBLICA del estado por número de pedido (PW001-123 o PW001-0000123).
--     Devuelve SOLO el estado y las fechas: nunca nombre, celular, dirección ni productos del cliente.
-- =====================================================================
alter table sales add column if not exists on_the_way_at timestamptz;

-- 2) Marcar pedido como cobrado / en camino / entregado
create or replace function mark_order(p_id uuid, p_action text) returns sales language plpgsql security definer set search_path = public as $$
declare v_s sales; v_email text; v_cash uuid;
begin
  select * into v_s from sales where id = p_id for update;
  if v_s.id is null or not can_branch(v_s.branch_id) then raise exception 'Pedido no encontrado'; end if;
  if v_s.status <> 'completado' then raise exception 'Primero confirma el pedido'; end if;
  select email into v_email from profiles where id = auth.uid();
  if p_action = 'paid' then
    -- Cobrar exige tu caja abierta en la sede del pedido: así el dinero entra al cuadre (antes quedaba sin caja)
    select id into v_cash from cash_registers where branch_id = v_s.branch_id and status = 'abierta' and user_email = v_email limit 1;
    if v_cash is null and v_s.cash_id is null then raise exception 'Debes abrir tu caja en la sede % para registrar el cobro', coalesce((select name from branches where id = v_s.branch_id), ''); end if;
    update sales set paid = true, paid_at = now(), cash_id = coalesce(cash_id, v_cash), cash_name = coalesce(cash_name, (select name from cash_registers where id = v_cash)) where id = p_id returning * into v_s;
  elsif p_action = 'on_the_way' then
    if v_s.delivery_status = 'entregado' then raise exception 'Este pedido ya fue entregado'; end if;
    update sales set delivery_status = 'en_camino', on_the_way_at = coalesce(on_the_way_at, now()) where id = p_id returning * into v_s;
  elsif p_action = 'delivered' then
    update sales set delivery_status = 'entregado', delivered_at = now() where id = p_id returning * into v_s;
  else raise exception 'Acción no válida'; end if;
  insert into audit_log(user_email, action, detail, branch_id) values (v_email, case p_action when 'paid' then 'Pedido cobrado' when 'on_the_way' then 'Pedido en camino' else 'Pedido entregado' end, coalesce(v_s.number, v_s.order_number), v_s.branch_id);
  return v_s;
end $$;

-- 3) Consulta pública del estado de un pedido web
create or replace function track_web_order(p_code text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v text; v_pre text; v_num text; v_s sales; v_branch text; v_stage text;
begin
  -- admite espacios, minúsculas, guiones raros (– — −) y sin ceros a la izquierda: "pw001-12", "PW001 12", "PW001-0000012"
  v := upper(regexp_replace(translate(coalesce(p_code, ''), '–—−_', '----'), '[^A-Za-z0-9-]', '', 'g'));
  if v ~ '^PW[0-9A-Z]{1,10}-[0-9]{1,12}$' then v_pre := split_part(v, '-', 1); v_num := split_part(v, '-', 2);
  elsif v ~ '^PW[0-9]{3}[0-9]{1,12}$' then v_pre := substr(v, 1, 5); v_num := substr(v, 6);
  else raise exception 'Escribe tu número de pedido, por ejemplo PW001-123'; end if;
  v_num := ltrim(v_num, '0');
  if length(v_num) > 7 then return jsonb_build_object('found', false); end if;   -- evita que lpad recorte y coincida con otro pedido
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
    'reason', case when v_stage = 'cancelado' then v_s.reject_reason end);
end $$;
revoke all on function track_web_order(text) from public;
grant execute on function track_web_order(text) to anon, authenticated;
