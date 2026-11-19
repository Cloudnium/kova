-- =====================================================================
-- schema_v7.sql · STOCK MÍNIMO Y ALERTA DE STOCK BAJO
-- Ejecuta después de schema_v6.sql. Es seguro repetirlo.
-- =====================================================================
-- Stock mínimo por producto (igual para todas las sedes). 0 = sin alerta para ese producto.
-- Los productos que ya existían quedan con 5; cámbialo desde Productos > Editar.
alter table products add column if not exists min_stock int not null default 5 check (min_stock >= 0);

-- Productos agotados o con stock bajo por sede (tienda + almacén <= stock mínimo).
-- p_branch = null devuelve todas las sedes. Usa los permisos del usuario (RLS):
-- un trabajador solo ve las sedes que tiene asignadas.
create or replace function low_stock(p_branch uuid default null)
returns table(branch_id uuid, branch_name text, product_id uuid, name text, sku text, category text,
              stock int, warehouse int, total int, min_stock int, status text)
language sql stable security invoker set search_path = public as $$
  select bs.branch_id, b.name, p.id, p.name, p.sku, p.category,
         bs.stock, bs.stock_warehouse, bs.stock + bs.stock_warehouse, p.min_stock,
         case when bs.stock + bs.stock_warehouse <= 0 then 'agotado' else 'bajo' end
  from branch_stock bs
  join products p on p.id = bs.product_id
  join branches b on b.id = bs.branch_id
  where coalesce(p.active, true) and coalesce(b.active, true)
    and p.min_stock > 0 and bs.stock + bs.stock_warehouse <= p.min_stock
    and (p_branch is null or bs.branch_id = p_branch)
  order by (bs.stock + bs.stock_warehouse > 0), p.name, b.name $$;
revoke all on function low_stock(uuid) from public;
grant execute on function low_stock(uuid) to authenticated;
