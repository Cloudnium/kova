-- =====================================================================
-- LIMPIADOR DE BASE DE DATOS · conserva USUARIOS, PRODUCTOS, ANUNCIOS y CONFIGURACIÓN
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
--   · ANUNCIOS: anuncio emergente, franja de texto, notificaciones push enviadas y dispositivos suscritos
--   · CONFIGURACIÓN: todo lo de la tabla settings (logo, colores, WhatsApp, Yape, datos del ticket, tarifas de delivery...)
--   · SEDES (branches): se conservan porque son parte de la configuración y los usuarios y el stock dependen de ellas
--
-- BORRA (todo lo demás):
--   ventas y pedidos web (incluye pagos de Culqi) · cajas · egresos · compras · movimientos de stock · clientes ·
--   avisos de pedidos de clientes (order_push) · registro de avisos de Culqi · auditoría · promociones ·
--   correlativos (la numeración vuelve a empezar: NV001-0000001, PW001-0000001, ...) · stock por sede (queda en 0)
--
-- OPCIONES (true = CONSERVAR esa parte · false = BORRARLA). Cámbialas aquí abajo si quieres.
--
-- NO BORRA archivos de Storage (fotos de comprobantes de pago en el bucket «proofs»): Supabase no permite
-- borrarlos por SQL; vacíalo desde Storage si quieres. Las imágenes de productos y anuncios se conservan.
-- =====================================================================
do $$
declare
  -- ================= OPCIONES =================
  v_confirmar          text    := 'NO';    -- 'NO' = solo prueba · 'BORRAR' = borra de verdad
  v_conservar_stock    boolean := false;   -- true = mantiene el stock actual de cada producto por sede
  v_conservar_promos   boolean := false;   -- true = mantiene las promociones (descuentos programados)
  -- ============================================
  v_lista text[] := array['order_push', 'culqi_events', 'sales', 'purchases', 'expenses', 'cash_registers', 'stock_moves',
                          'customers', 'doc_counters', 'audit_log'];
  t text; n bigint; v_resumen text := '';
begin
  if v_confirmar not in ('NO', 'BORRAR') then raise exception 'v_confirmar debe ser ''NO'' (prueba) o ''BORRAR''.'; end if;
  if not v_conservar_stock  then v_lista := array_append(v_lista, 'branch_stock'::text); end if;
  if not v_conservar_promos then v_lista := array_append(v_lista, 'promotions'::text); end if;

  -- Orden pensado para respetar las relaciones entre tablas. Si una tabla no existe (versión antigua) se omite.
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
  if not v_conservar_stock then update public.products set stock = 0, stock_warehouse = 0 where true; end if;

  -- Deja constancia de la limpieza
  if to_regclass('public.audit_log') is not null then
    insert into public.audit_log(user_email, action, detail) values ('sistema (SQL Editor)', 'Limpieza de base de datos', left(v_resumen, 500));
  end if;
end $$;

-- Comprobación (solo se llega aquí si se borró de verdad). Operaciones en 0; usuarios, productos, sedes, anuncios y configuración intactos.
select (select count(*) from public.sales) as ventas, (select count(*) from public.cash_registers) as cajas, (select count(*) from public.expenses) as egresos,
       (select count(*) from public.customers) as clientes, (select count(*) from public.branch_stock) as stock_filas,
       (select count(*) from public.audit_log) as auditoria_1_registro_de_limpieza,
       (select count(*) from public.profiles) as usuarios, (select count(*) from public.products) as productos, (select count(*) from public.branches) as sedes,
       (select count(*) from public.settings) as configuracion, (select count(*) from public.push_subscriptions) as suscritos_push, (select count(*) from public.push_announcements) as anuncios_push;
