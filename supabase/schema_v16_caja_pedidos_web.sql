-- =====================================================================
-- schema_v16_caja_pedidos_web.sql · CAJA ABIERTA OBLIGATORIA PARA PEDIDOS WEB
-- Ejecuta en Supabase > SQL Editor (después de schema_v15). Es seguro repetirlo. No toca datos.
--  · Aceptar (confirmar) un pedido web exige que TÚ tengas tu caja abierta en la sede del pedido (igual que el POS).
--  · Marcar un pedido como cobrado también la exige (si no, el cobro quedaba fuera de todas las cajas).
--  · Rechazar, «En camino» y «Entregado» NO exigen caja (no mueven dinero).
-- Incluye mark_order con la acción 'on_the_way' de schema_v15 (misma definición, no se pierde nada).
-- =====================================================================

-- Aceptar pedido web: descuenta stock (y componentes de combos), emite el comprobante y exige caja abierta
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
  -- Caja obligatoria: el personal debe tener SU caja abierta en la sede del pedido (igual que en el POS)
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

  update sales set items = v_new, status = 'completado', voucher = p_voucher, number = next_doc(v_s.branch_id, v_pre), customer_doc = nullif(trim(p_doc), ''),
    payment = coalesce(p_payment, payment), paid = coalesce(p_paid, false), paid_at = case when p_paid then now() end,
    cash_id = case when p_paid then v_cash end, cash_name = (select name from cash_registers where id = v_cash),
    confirmed_at = now(), confirmed_by = v_me.email, seller_name = coalesce(nullif(v_me.name, ''), split_part(v_me.email, '@', 1)),
    delivery_status = 'por_entregar' where id = p_id returning * into v_s;
  insert into audit_log(user_email, action, detail, branch_id) values (v_me.email, 'Pedido web confirmado', v_s.order_number || ' → ' || v_s.number, v_s.branch_id);
  return v_s;
end $$;

-- Marcar pedido como cobrado / en camino / entregado
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
