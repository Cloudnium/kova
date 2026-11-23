-- ⚠ Este script borra TAMBIÉN productos y sedes. Si quieres conservar usuarios, productos y sedes usa:
--    limpiar_bd_conservar_usuarios_productos_sedes.sql
-- =====================================================================
-- limpiar_bd.sql · BORRA TODOS LOS DATOS DEL SISTEMA, MENOS LOS USUARIOS
-- Pégalo completo en Supabase > SQL Editor y pulsa Run.
-- IRREVERSIBLE: descarga antes un respaldo (Admin > Backup).
--
-- BORRA: ventas y pedidos web, cajas, egresos, correlativos, stock, movimientos,
--        productos, combos, promociones, compras, clientes, suscriptores y anuncios push, auditoría, configuración y sedes.
-- CONSERVA: usuarios (tabla profiles y cuentas de acceso en auth.users).
-- NO BORRA: las imágenes ya subidas en Storage (bórralas desde Storage > buckets si quieres).
--
-- Al final crea una "Sede Principal" vacía y se la asigna a los usuarios (menos Marketing),
-- porque sin ninguna sede nadie puede entrar al sistema. Si prefieres no crearla,
-- borra el bloque marcado "SEDE NUEVA" al final.
-- =====================================================================
begin;

do $$
declare t text;
begin
  -- orden pensado para respetar las relaciones entre tablas; si alguna tabla no existe (versiones antiguas) se omite
  foreach t in array array['combo_items','promotions','purchases','sales','cash_registers','expenses','stock_moves','doc_counters','branch_stock',
                           'products','customers','push_subscriptions','push_announcements','audit_log','settings','branches'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where true', t);
    end if;
  end loop;
end $$;

-- ===== SEDE NUEVA (se puede borrar este bloque) =====
insert into branches(name, address) values ('Sede Principal', '');
update profiles set branch_ids = array[(select id from branches limit 1)] where coalesce(role, '') <> 'marketing';  -- marketing no usa sedes
-- ====================================================

commit;

-- Comprobación: todo debe salir en 0 (branches = 1 por la sede nueva) y users = tus usuarios
select (select count(*) from sales) as ventas, (select count(*) from products) as productos, (select count(*) from customers) as clientes,
       (select count(*) from audit_log) as auditoria, (select count(*) from branches) as sedes, (select count(*) from profiles) as usuarios;
