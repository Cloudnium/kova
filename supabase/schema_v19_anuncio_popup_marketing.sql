-- =====================================================================
-- schema_v19_anuncio_popup_marketing.sql · ANUNCIO EMERGENTE + ACCESO DE MARKETING A «ANUNCIOS»
-- Ejecuta en Supabase > SQL Editor. Es seguro repetirlo. No borra datos.
--
-- El anuncio emergente de la tienda usa la tabla settings (claves popup_on, popup_image, popup_freq, popup_v)
-- y el bucket público «assets» (carpeta popup/). Esto solo agrega PERMISOS para el rol «marketing»:
--   · settings: solo las claves popup_* y marquee_* (franja de texto). Nada más de la configuración.
--   · storage assets: solo las carpetas popup/ y push/ (imágenes de anuncios).
--   · push_subscriptions / push_announcements: solo lectura (cantidad de suscritos e historial).
--   · audit_log: puede registrar sus acciones (no puede leer la auditoría).
-- Marketing sigue SIN ver ventas, pedidos, clientes, caja ni reportes.
-- =====================================================================
drop policy if exists "settings marketing" on settings;
create policy "settings marketing" on settings for all to authenticated
  using (is_marketing() and (key like 'popup\_%' or key like 'marquee\_%'))
  with check (is_marketing() and (key like 'popup\_%' or key like 'marquee\_%'));

drop policy if exists "assets marketing sube" on storage.objects;
drop policy if exists "assets marketing edita" on storage.objects;
drop policy if exists "assets marketing borra" on storage.objects;
create policy "assets marketing sube" on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and is_marketing() and (name like 'popup/%' or name like 'push/%'));
create policy "assets marketing edita" on storage.objects for update to authenticated
  using (bucket_id = 'assets' and is_marketing() and (name like 'popup/%' or name like 'push/%'));
create policy "assets marketing borra" on storage.objects for delete to authenticated
  using (bucket_id = 'assets' and is_marketing() and (name like 'popup/%' or name like 'push/%'));

drop policy if exists "push subs marketing" on push_subscriptions;
create policy "push subs marketing" on push_subscriptions for select to authenticated using (is_marketing());
drop policy if exists "push ann marketing" on push_announcements;
create policy "push ann marketing" on push_announcements for select to authenticated using (is_marketing());

drop policy if exists "audit crea marketing" on audit_log;
create policy "audit crea marketing" on audit_log for insert to authenticated with check (is_marketing());
