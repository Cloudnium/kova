-- Categorías de productos
-- Ejecutar en Supabase > SQL Editor.
-- Reemplaza las categorías actuales por la lista definida, sin tocar código del sistema.

begin;

-- 1) Normaliza categorías existentes al nuevo catálogo.
update public.products
set category = case upper(trim(coalesce(category, '')))
  when 'AGUA' then 'AGUA'
  when 'CERVEZA' then 'CERVEZA'
  when 'DULCES' then 'DULCES'
  when 'ENERGIZANTE' then 'ENERGIZANTE'
  when 'GASEOSA' then 'GASEOSA'
  when 'JAGGER' then 'JAGGER'
  when 'JUGO' then 'JUGO'
  when 'LICOR' then 'LICOR'
  when 'RON' then 'RON'
  when 'SNACK' then 'SNACK'
  when 'TEQUILA' then 'TEQUILA'
  when 'VINO' then 'VINO'
  when 'VODKA' then 'VODKA'
  when 'WHISKY' then 'WHISKY'
  when 'CIGARRO' then 'CIGARRO'
  when 'ENCENDEDOR' then 'ENCENDEDOR'
  when 'OTROS' then 'OTROS'
  -- Mapeo de categorías antiguas del sistema
  when 'BURBUJAS' then 'GASEOSA'
  when 'GIN' then 'LICOR'
  when 'PISCO' then 'LICOR'
  else 'OTROS'
end;

-- 2) Default para nuevos productos.
alter table public.products
  alter column category set default 'OTROS';

-- 3) Restringe a las categorías permitidas.
alter table public.products
  drop constraint if exists products_category_chk;

alter table public.products
  add constraint products_category_chk check (
    category in (
      'AGUA', 'CERVEZA', 'DULCES', 'ENERGIZANTE', 'GASEOSA', 'JAGGER', 'JUGO',
      'LICOR', 'RON', 'SNACK', 'TEQUILA', 'VINO', 'VODKA', 'WHISKY',
      'CIGARRO', 'ENCENDEDOR', 'OTROS'
    )
  );

commit;
