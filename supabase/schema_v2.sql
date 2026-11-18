-- Ejecuta DESPUÉS de schema.sql (Supabase > SQL Editor). Es seguro de correr una sola vez.
alter table products add column if not exists stock_warehouse int default 0;
create sequence if not exists sale_seq;
grant usage, select on sequence sale_seq to anon, authenticated;
alter table sales add column if not exists number text default ('NV001-' || lpad(nextval('sale_seq')::text, 7, '0'));
alter table sales add column if not exists cash_id uuid;
alter table sales add column if not exists customer_id uuid;
alter table expenses add column if not exists category text default 'Otros';
alter table expenses add column if not exists method text default 'Efectivo';
create table if not exists branches(id uuid primary key default gen_random_uuid(), name text not null, address text, phone text, series text default 'F001 · B001', created_at timestamptz default now());
create table if not exists cash_registers(id uuid primary key default gen_random_uuid(), name text not null, user_email text, opening_amount numeric(10,2) default 0, closing_amount numeric(10,2), status text default 'abierta', opened_at timestamptz default now(), closed_at timestamptz);
create table if not exists profiles(id uuid primary key references auth.users(id) on delete cascade, email text, name text, role text default 'trabajador', active boolean default true, created_at timestamptz default now());
create table if not exists audit_log(id uuid primary key default gen_random_uuid(), user_email text, action text, detail text, created_at timestamptz default now());
create table if not exists stock_moves(id uuid primary key default gen_random_uuid(), product_name text, qty int, direction text, user_email text, created_at timestamptz default now());
do $$ declare t text; begin foreach t in array array['branches','cash_registers','profiles','audit_log','stock_moves'] loop
  execute format('alter table %I enable row level security', t);
  execute format('drop policy if exists "staff %1$s" on %1$I', t);
  execute format('create policy "staff %1$s" on %1$I for all to authenticated using (true) with check (true)', t);
end loop; end $$;
-- Los usuarios que ya creaste pasan a ser administradores
insert into profiles(id, email, name, role) select id, email, split_part(email,'@',1), 'administrador' from auth.users on conflict do nothing;
