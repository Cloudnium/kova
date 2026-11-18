-- =====================================================================
-- schema_v6.sql · NOTIFICACIONES PUSH A CLIENTES (anuncios del negocio)
-- Ejecuta después de schema_v5.sql. Es seguro repetirlo.
-- =====================================================================
create table if not exists push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  branch_id uuid references branches(id) on delete set null,   -- sede que el cliente tenía elegida al aceptar
  user_agent text,
  created_at timestamptz default now(),
  last_seen timestamptz default now());
alter table push_subscriptions enable row level security;

create table if not exists push_announcements(
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null, url text, image text,
  branch_id uuid references branches(id) on delete set null,   -- null = todos los suscriptores
  sent int default 0, failed int default 0, removed int default 0,
  created_by text, created_at timestamptz default now());
alter table push_announcements enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname='public' and tablename in ('push_subscriptions','push_announcements') loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename); end loop; end $$;
-- Solo el administrador puede ver cuántos suscriptores hay y el historial. Los clientes NO pueden leer nada.
create policy "push subs admin" on push_subscriptions for select to authenticated using (is_admin());
create policy "push ann admin" on push_announcements for select to authenticated using (is_admin());

-- El navegador del cliente registra (o renueva) su suscripción solo a través de esta función
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_branch uuid default null, p_ua text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(coalesce(p_p256dh,'')) not between 40 and 200 or length(coalesce(p_auth,'')) not between 10 and 100 then
    raise exception 'Suscripción no válida'; end if;
  insert into push_subscriptions(endpoint, p256dh, auth, branch_id, user_agent) values (p_endpoint, p_p256dh, p_auth,
    (select id from branches where id = p_branch and coalesce(active,true)), left(p_ua, 200))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, branch_id = excluded.branch_id, last_seen = now();
end $$;
create or replace function remove_push_subscription(p_endpoint text) returns void language sql security definer set search_path = public as
$$ delete from push_subscriptions where endpoint = p_endpoint $$;
revoke all on function save_push_subscription(text,text,text,uuid,text) from public;
revoke all on function remove_push_subscription(text) from public;
grant execute on function save_push_subscription(text,text,text,uuid,text) to anon, authenticated;
grant execute on function remove_push_subscription(text) to anon, authenticated;
