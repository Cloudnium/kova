-- Corrección urgente (ejecutar UNA vez en el SQL Editor si ya habías ejecutado schema_v10.sql con el error "invalid configuration parameter name")
create or replace function bs_track() returns trigger language plpgsql as $$
begin
  perform set_config('kova.m' || md5(new.branch_id::text || new.product_id::text),
    concat_ws(',', coalesce(old.stock, 0), coalesce(old.stock_warehouse, 0), new.stock, new.stock_warehouse), true);
  return new;
end $$;
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
