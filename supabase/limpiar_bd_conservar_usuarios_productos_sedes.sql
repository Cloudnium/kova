-- =====================================================================
-- LIMPIADOR DE BASE DE DATOS · conserva USUARIOS, PRODUCTOS (y combos) y SEDES
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
--   · Usuarios: profiles y las cuentas de acceso (auth.users)
--   · Productos, incluidos combos y su composición (products, combo_items), con sus fotos
--   · Sedes (branches) y las sedes asignadas a cada usuario
--
-- BORRA:
--   ventas y pedidos web · cajas · egresos · compras · movimientos de stock · stock por sede
--   (los productos quedan con stock 0) · clientes · promociones · anuncios push y suscriptores
--   · auditoría · configuración de la tienda · correlativos (la numeración vuelve a empezar:
--   NV001-0000001, PW001-0000001, ...)
--
-- OPCIONES (true = CONSERVAR esa parte · false = BORRARLA). Cámbialas aquí abajo si quieres.
--
-- NO BORRA archivos de Storage (comprobantes de pago de la tienda en el bucket «proofs», imágenes de
-- anuncios en «assets»): Supabase no permite borrarlos por SQL; vacíalos desde Storage si quieres.
-- =====================================================================
do $$
declare
  -- ================= OPCIONES =================
  v_confirmar        text    := 'NO';    -- 'NO' = solo prueba · 'BORRAR' = borra de verdad
  v_conservar_stock  boolean := false;   -- true = mantiene el stock actual de cada producto por sede
  v_conservar_config boolean := false;   -- true = mantiene logo, WhatsApp, franja de texto, datos del ticket, etc.
  v_conservar_push   boolean := false;   -- true = mantiene los dispositivos suscritos a notificaciones
  -- ============================================
  v_lista text[] := array['sales', 'purchases', 'expenses', 'cash_registers', 'stock_moves', 'promotions',
                          'push_announcements', 'customers', 'doc_counters', 'audit_log'];
  t text; n bigint; v_resumen text := '';
begin
  if v_confirmar not in ('NO', 'BORRAR') then raise exception 'v_confirmar debe ser ''NO'' (prueba) o ''BORRAR''.'; end if;
  if not v_conservar_stock  then v_lista := array_append(v_lista, 'branch_stock'::text); end if;
  if not v_conservar_push   then v_lista := array_append(v_lista, 'push_subscriptions'::text); end if;
  if not v_conservar_config then v_lista := array_append(v_lista, 'settings'::text); end if;

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

-- Comprobación (solo se llega aquí si se borró de verdad). Debe salir: operaciones en 0, y tus usuarios, productos y sedes intactos.
select (select count(*) from public.sales) as ventas, (select count(*) from public.cash_registers) as cajas, (select count(*) from public.expenses) as egresos,
       (select count(*) from public.customers) as clientes, (select count(*) from public.branch_stock) as stock_filas,
       (select count(*) from public.audit_log) as auditoria_1_registro_de_limpieza,
       (select count(*) from public.profiles) as usuarios, (select count(*) from public.products) as productos, (select count(*) from public.branches) as sedes;
