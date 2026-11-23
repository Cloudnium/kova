-- =====================================================================
-- schema_v14_fix_fotos.sql · CORRIGE el error de Marketing al subir/cambiar fotos:
--   "invalid regular expression: invalid repetition count(s)"
-- Causa: set_product_image() usaba el regex '[^ ]{5,900}' y PostgreSQL solo permite repeticiones hasta 255.
-- Ejecútalo en Supabase > SQL Editor. Es seguro repetirlo. No toca datos ni permisos.
-- =====================================================================
create or replace function set_product_image(p_id uuid, p_url text) returns void language plpgsql security definer set search_path = public as $$
declare v_email text; v_name text;
begin
  select email into v_email from profiles where id = auth.uid() and coalesce(active, true);
  if v_email is null then raise exception 'Sesión no válida'; end if;
  if not (is_admin() or is_marketing()) then raise exception 'No tienes permiso para cambiar fotos'; end if;
  if coalesce(p_url, '') <> '' and (p_url !~ '^https?://[^ ]+$' or length(p_url) not between 10 and 900) then raise exception 'Dirección de imagen no válida'; end if;
  update products set image_url = nullif(p_url, '') where id = p_id returning name into v_name;
  if v_name is null then raise exception 'Producto no encontrado'; end if;
  insert into audit_log(user_email, action, detail) values (v_email, 'Foto de producto cambiada', v_name);
end $$;
grant execute on function set_product_image(uuid, text) to authenticated;
