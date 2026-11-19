-- =====================================================================
-- schema_v7.sql · STOCK MÍNIMO Y ALERTA DE STOCK BAJO
-- Ejecuta después de schema_v6.sql. Es seguro repetirlo.
-- =====================================================================
-- Stock mínimo por producto (igual para todas las sedes). 0 = sin alerta de stock bajo (el aviso de agotado siempre se muestra).
-- Los productos que ya existían quedan con 5; cámbialo desde Productos > Editar.
alter table products add column if not exists min_stock int not null default 5 check (min_stock >= 0);

-- Alertas por sede. Total = tienda + almacén.
--  · Agotado: total = 0 (siempre alerta, aunque el producto tenga mínimo 0 o nunca se haya cargado en esa sede).
--  · Stock bajo: total <= stock mínimo (solo si el mínimo es mayor que 0).
-- p_branch = null devuelve todas las sedes a las que el usuario tiene acceso.
create or replace function low_stock(p_branch uuid default null)
returns table(branch_id uuid, branch_name text, product_id uuid, name text, sku text, category text,
              stock int, warehouse int, total int, min_stock int, status text)
language sql stable security invoker set search_path = public as $$
  select b.id, b.name, p.id, p.name, p.sku, p.category,
         coalesce(bs.stock, 0), coalesce(bs.stock_warehouse, 0), coalesce(bs.stock, 0) + coalesce(bs.stock_warehouse, 0), p.min_stock,
         case when coalesce(bs.stock, 0) + coalesce(bs.stock_warehouse, 0) <= 0 then 'agotado' else 'bajo' end
  from branches b
  cross join products p
  left join branch_stock bs on bs.branch_id = b.id and bs.product_id = p.id
  where coalesce(p.active, true) and coalesce(b.active, true) and can_branch(b.id)
    and (p_branch is null or b.id = p_branch)
    and (coalesce(bs.stock, 0) + coalesce(bs.stock_warehouse, 0) <= 0
         or (p.min_stock > 0 and coalesce(bs.stock, 0) + coalesce(bs.stock_warehouse, 0) <= p.min_stock))
  order by (coalesce(bs.stock, 0) + coalesce(bs.stock_warehouse, 0) > 0), p.name, b.name $$;
revoke all on function low_stock(uuid) from public;
grant execute on function low_stock(uuid) to authenticated;
