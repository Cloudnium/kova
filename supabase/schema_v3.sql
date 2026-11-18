-- Ejecuta en Supabase > SQL Editor (después de schema_v2.sql)
alter table products add column if not exists old_price numeric(10,2);
