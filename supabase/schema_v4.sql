-- Ejecuta en Supabase > SQL Editor: habilita la subida de imágenes de productos
insert into storage.buckets (id, name, public) values ('products', 'products', true)
on conflict (id) do update set public = true;
drop policy if exists "imagenes publicas" on storage.objects;
drop policy if exists "staff sube imagenes" on storage.objects;
drop policy if exists "staff edita imagenes" on storage.objects;
drop policy if exists "staff borra imagenes" on storage.objects;
create policy "imagenes publicas" on storage.objects for select using (bucket_id = 'products');
create policy "staff sube imagenes" on storage.objects for insert to authenticated with check (bucket_id = 'products');
create policy "staff edita imagenes" on storage.objects for update to authenticated using (bucket_id = 'products');
create policy "staff borra imagenes" on storage.objects for delete to authenticated using (bucket_id = 'products');
