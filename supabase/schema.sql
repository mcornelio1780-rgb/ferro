-- =====================================================================
-- FERRO · Base de datos (Supabase)
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede ejecutar más de una vez sin romper nada.
-- Al final, cambia TU_CORREO por tu correo para ver la pestaña Admin.
-- =====================================================================

-- 1) Perfiles de usuario (se crea solo cuando alguien se registra)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  company text,
  role text,
  country text,
  lang text default 'es',
  marketing_opt_in boolean default false,
  terms_accepted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) Suscriptores del índice (formulario de la landing)
create table if not exists public.subscribers (
  id bigint generated always as identity primary key,
  email text not null,
  country text,
  role text,
  lang text,
  source text default 'landing',
  created_at timestamptz default now()
);
create unique index if not exists subscribers_email_key on public.subscribers (lower(email));

-- 3) Mensajes de contacto (formulario "Contacto" de la landing)
create table if not exists public.contact_messages (
  id bigint generated always as identity primary key,
  name text,
  email text not null,
  company text,
  country text,
  topic text,
  message text not null,
  lang text,
  user_id uuid references auth.users(id) on delete set null,
  status text default 'nuevo',
  created_at timestamptz default now()
);

-- 4) Escenarios guardados en la app (uno por modelo y usuario)
create table if not exists public.scenarios (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  model text not null,
  name text not null default 'default',
  inputs jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, model, name)
);

-- 5) Administradores (quién puede leer contactos y suscriptores)
create table if not exists public.admins (email text primary key);

-- ---------- función: ¿el usuario actual es admin? ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- crear perfil automáticamente al registrarse ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, lang, marketing_opt_in, terms_accepted_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'lang', 'es'),
    coalesce((new.raw_user_meta_data ->> 'marketing_opt_in')::boolean, false),
    nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- seguridad por filas (RLS) ----------
alter table public.profiles enable row level security;
alter table public.subscribers enable row level security;
alter table public.contact_messages enable row level security;
alter table public.scenarios enable row level security;
alter table public.admins enable row level security;  -- sin políticas: nadie la lee desde la web

-- profiles: cada uno ve y edita el suyo; admin ve todos
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
  using ((select auth.uid()) = id or public.is_admin());
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- subscribers: cualquiera puede suscribirse; solo admin lee
drop policy if exists "subscribers_insert_any" on public.subscribers;
create policy "subscribers_insert_any" on public.subscribers for insert to anon, authenticated
  with check (char_length(email) between 5 and 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
drop policy if exists "subscribers_select_admin" on public.subscribers;
create policy "subscribers_select_admin" on public.subscribers for select to authenticated
  using (public.is_admin());

-- contact_messages: cualquiera puede escribir; solo admin lee y cambia estado
drop policy if exists "contact_insert_any" on public.contact_messages;
create policy "contact_insert_any" on public.contact_messages for insert to anon, authenticated
  with check (
    char_length(message) between 5 and 5000
    and char_length(email) between 5 and 254
    and (user_id is null or user_id = (select auth.uid()))
  );
drop policy if exists "contact_select_admin" on public.contact_messages;
create policy "contact_select_admin" on public.contact_messages for select to authenticated
  using (public.is_admin());
drop policy if exists "contact_update_admin" on public.contact_messages;
create policy "contact_update_admin" on public.contact_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- scenarios: cada usuario solo los suyos
drop policy if exists "scenarios_own" on public.scenarios;
create policy "scenarios_own" on public.scenarios for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------- permisos de la API ----------
grant usage on schema public to anon, authenticated;
grant insert on public.subscribers, public.contact_messages to anon, authenticated;
grant select on public.subscribers, public.contact_messages to authenticated;
grant update on public.contact_messages to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.scenarios to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- TU CORREO DE ADMIN (cámbialo y vuelve a ejecutar esta línea) ----------
insert into public.admins (email) values ('TU_CORREO@ejemplo.com') on conflict do nothing;
