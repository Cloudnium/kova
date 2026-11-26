-- =====================================================================
-- LIMPIADOR DE BASE DE DATOS · conserva SOLO USUARIOS, PRODUCTOS y CONFIGURACIÓN
-- Pégalo completo en Supabase > SQL Editor y pulsa Run.
--
-- ⚠ IRREVERSIBLE. Descarga antes un respaldo (Admin > Backup).
--
-- SEGURIDAD: por defecto está en MODO PRUEBA. Al ejecutarlo NO borra nada: se detiene con un
-- mensaje que dice cuántos registros borraría de cada tabla. Cuando estés seguro, cambia
--      v_confirmar text := 'NO';      →      v_confirmar text := 'BORRAR';
-- y vuelve a ejecutarlo.
--
-- CONSERVA (nunca se toca):
--   · USUARIOS: profiles y las cuentas de acceso (auth.users), con sus sedes asignadas
--   · PRODUCTOS: products y combos (combo_items), con sus fotos y precios
--   · CONFIGURACIÓN: tabla settings (logo, colores, WhatsApp, Yape, ticket, tarifas de delivery, anuncio emergente, franja de texto...)
--   · SEDES (branches): se conservan porque los usuarios y el stock dependen de ellas (si quieres borrarlas, hazlo desde Admin > Sedes)
--
-- BORRA (todo lo demás, incluida la AUDITORÍA, sin dejar ni un registro):
--   ventas y pedidos web (incluye pagos de Culqi) · cajas · egresos · compras · movimientos de stock · clientes ·
--   reclamos (Libro de Reclamaciones) · avisos de pedidos (order_push) · registro de avisos de Culqi · auditoría ·
--   historial de notificaciones push enviadas · promociones · correlativos (la numeración vuelve a empezar) · stock por sede (queda en 0)
--
-- OPCIÓN: v_conservar_suscritos = true mantiene los celulares/navegadores de clientes suscritos a notificaciones push
--         (no se pueden recuperar si se borran). Ponla en false si quieres borrarlos también.
--
-- NO BORRA archivos de Storage (fotos de comprobantes en el bucket «proofs»): Supabase no permite borrarlos por SQL.
-- =====================================================================
do $$
declare
  -- ================= OPCIONES =================
  v_confirmar            text    := 'NO';   -- 'NO' = solo prueba · 'BORRAR' = borra de verdad
  v_conservar_suscritos  boolean := true;   -- true = conserva los dispositivos suscritos a push
  -- ============================================
  v_lista text[] := array['order_push', 'culqi_events', 'claims', 'discount_redemptions', 'sales', 'purchases', 'expenses', 'cash_registers', 'stock_moves',
                          'customers', 'doc_counters', 'branch_stock', 'promotions', 'push_announcements', 'audit_log'];
  t text; n bigint; v_resumen text := '';
begin
  if v_confirmar not in ('NO', 'BORRAR') then raise exception 'v_confirmar debe ser ''NO'' (prueba) o ''BORRAR''.'; end if;
  if not v_conservar_suscritos then v_lista := array_append(v_lista, 'push_subscriptions'::text); end if;

  -- Si una tabla no existe (versión antigua) se omite.
  foreach t in array v_lista loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select count(*) from public.%I', t) into n;
    v_resumen := v_resumen || t || ' = ' || n || ' · ';
    if v_confirmar = 'BORRAR' then execute format('delete from public.%I where true', t); end if;
  end loop;

  if v_confirmar <> 'BORRAR' then
    raise exception 'MODO PRUEBA: no se borró nada. Se borrarían estos registros -> %  Para borrar de verdad cambia v_confirmar a ''BORRAR'' y vuelve a ejecutar.', v_resumen;
  end if;

  -- Los productos quedan sin stock (columnas antiguas de stock global)
  update public.products set stock = 0, stock_warehouse = 0 where true;
end $$;

-- Comprobación (solo se llega aquí si se borró de verdad)
select (select count(*) from public.sales) as ventas, (select count(*) from public.cash_registers) as cajas, (select count(*) from public.expenses) as egresos,
       (select count(*) from public.customers) as clientes, (select count(*) from public.claims) as reclamos, (select count(*) from public.branch_stock) as stock_filas,
       (select count(*) from public.audit_log) as auditoria,
       (select count(*) from public.profiles) as usuarios, (select count(*) from public.products) as productos, (select count(*) from public.branches) as sedes,
       (select count(*) from public.settings) as configuracion;
