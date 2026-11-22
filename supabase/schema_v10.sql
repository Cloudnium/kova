-- =====================================================================
-- schema_v10.sql · COSTO DE PRODUCTO E HISTORIAL DE MOVIMIENTOS
-- Ejecuta después de schema_v9.sql. Es seguro repetirlo.
-- =====================================================================
-- Costo unitario (para el "Valor del inventario (costo)" en Productos)
alter table products add column if not exists cost numeric not null default 0 check (cost >= 0);

-- Cada movimiento guarda cómo quedó el stock de tienda y almacén (antes → después)
alter table stock_moves add column if not exists st_before int;
alter table stock_moves add column if not exists st_after int;
alter table stock_moves add column if not exists wh_before int;
alter table stock_moves add column if not exists wh_after int;
create index if not exists stock_moves_created_idx on stock_moves(created_at desc);

-- 1) Cuando cambia branch_stock se recuerda (solo dentro de la transacción) el valor anterior y el nuevo
create or replace function bs_track() returns trigger language plpgsql as $$
begin
  perform set_config('kova.m' || md5(new.branch_id::text || new.product_id::text),
    concat_ws(',', coalesce(old.stock, 0), coalesce(old.stock_warehouse, 0), new.stock, new.stock_warehouse), true);
  return new;
end $$;
drop trigger if exists bs_track_t on branch_stock;
create trigger bs_track_t after insert or update on branch_stock for each row execute function bs_track();

-- 2) Al registrar el movimiento se completan las columnas antes/después
create or replace function sm_fill() returns trigger language plpgsql as $$
declare v text; a text[];
begin
  if new.st_before is null and new.branch_id is not null and new.product_id is not null then
    v := current_setting('kova.m' || md5(new.branch_id::text || new.product_id::text), true);
    if v is not null and v <> '' then
      a := string_to_array(v, ',');
      new.st_before := a[1]::int; new.wh_before := a[2]::int; new.st_after := a[3]::int; new.wh_after := a[4]::int;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists sm_fill_t on stock_moves;
create trigger sm_fill_t before insert on stock_moves for each row execute function sm_fill();
