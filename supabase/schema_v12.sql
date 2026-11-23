-- =====================================================================
-- schema_v12.sql · ROL "MARKETING" (solo puede cambiar las fotos de productos y combos)
-- Ejecuta después de schema_v11.sql. Es seguro repetirlo.
-- =====================================================================
create or replace function is_marketing() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and role = 'marketing' and coalesce(active, true)) $$;

-- "Personal" = cualquier usuario activo que NO sea marketing (marketing no ve datos del negocio)
create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and coalesce(active, true) and role <> 'marketing') $$;

-- Productos: antes cualquier sesión podía escribir. Ahora escribe el personal; marketing solo lee
-- y cambia fotos mediante set_product_image().
drop policy if exists "staff products" on products;
drop policy if exists "products lee personal" on products;
drop policy if exists "products inserta" on products;
drop policy if exists "products edita" on products;
drop policy if exists "products borra" on products;
create policy "products lee personal" on products for select to authenticated using (is_staff() or is_marketing());
create policy "products inserta" on products for insert to authenticated with check (is_staff());
create policy "products edita" on products for update to authenticated using (is_staff()) with check (is_staff());
create policy "products borra" on products for delete to authenticated using (is_staff());

-- Cambiar SOLO la foto de un producto o combo (administrador, personal o marketing)
create or replace function set_product_image(p_id uuid, p_url text) returns void language plpgsql security definer set search_path = public as $$
declare v_email text; v_name text;
begin
  select email into v_email from profiles where id = auth.uid() and coalesce(active, true);
  if v_email is null then raise exception 'Sesión no válida'; end if;
  if not (is_admin() or is_marketing()) then raise exception 'No tienes permiso para cambiar fotos'; end if;
  -- OJO: PostgreSQL no admite cuantificadores > 255 en regex ({5,900} daba "invalid repetition count(s)"); el largo se valida aparte
  if coalesce(p_url, '') <> '' and (p_url !~ '^https?://[^ ]+$' or length(p_url) not between 10 and 900) then raise exception 'Dirección de imagen no válida'; end if;
  update products set image_url = nullif(p_url, '') where id = p_id returning name into v_name;
  if v_name is null then raise exception 'Producto no encontrado'; end if;
  insert into audit_log(user_email, action, detail) values (v_email, 'Foto de producto cambiada', v_name);
end $$;
grant execute on function set_product_image(uuid, text) to authenticated;
