-- Ejecuta esto en Supabase > SQL Editor
create extension if not exists "pgcrypto";
create table products(id uuid primary key default gen_random_uuid(), name text not null, sku text, category text default 'Otros',
  price numeric(10,2) not null default 0, stock int not null default 0, image_url text, is_pack boolean default false,
  active boolean default true, created_at timestamptz default now());
create table customers(id uuid primary key default gen_random_uuid(), name text not null, phone text, created_at timestamptz default now());
create table sales(id uuid primary key default gen_random_uuid(), total numeric(10,2) not null, payment text default 'Efectivo',
  voucher text default 'Nota de Venta', customer_name text default 'Cliente Varios', phone text,
  source text default 'pos', status text default 'completado', items jsonb not null default '[]', created_at timestamptz default now());
create table expenses(id uuid primary key default gen_random_uuid(), concept text not null, amount numeric(10,2) not null, created_at timestamptz default now());
alter table products enable row level security; alter table customers enable row level security;
alter table sales enable row level security; alter table expenses enable row level security;
create policy "tienda lee productos" on products for select using (active = true);
create policy "tienda crea pedidos web" on sales for insert to anon with check (source = 'web' and status = 'pendiente');
create policy "staff products" on products for all to authenticated using (true) with check (true);
create policy "staff customers" on customers for all to authenticated using (true) with check (true);
create policy "staff sales" on sales for all to authenticated using (true) with check (true);
create policy "staff expenses" on expenses for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table sales;
insert into products(name,sku,category,price,stock) values
('Ron Cartavio Black 750ml','RON-001','Ron',38,24),('Whisky Johnnie Walker Red 750ml','WHI-001','Whisky',75,12),
('Pisco Quebranta 750ml','PIS-001','Pisco',45,30),('Vodka Smirnoff 750ml','VOD-001','Vodka',42,18),
('Tequila Jose Cuervo 750ml','TEQ-001','Tequila',89,9),('Vino Tabernero Tinto 750ml','VIN-001','Vino',28,40);
-- Luego crea tus usuarios en Authentication > Users (email y contraseña).
