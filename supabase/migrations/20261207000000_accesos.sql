-- =============================================================================
-- Tracker · Adopción: qué días usa la app cada persona
--   La adopción es el riesgo número uno: hay que poder medirla. Se guarda UN
--   registro por persona y por día en que entró (no cada pantalla ni cada clic).
--   Solo el dueño lo ve (Más → Usuarios); cada uno puede ver los suyos.
-- Se puede volver a correr sin error.
-- =============================================================================

create table if not exists public.accesos (
  empresa_id uuid not null default public.mi_empresa() references public.empresas (id),
  user_id    uuid not null default auth.uid(),
  dia        date not null default public.hoy_ar(),
  primera    timestamptz not null default now(),
  primary key (user_id, dia)
);
create index if not exists accesos_empresa_dia on public.accesos (empresa_id, dia);

alter table public.accesos enable row level security;
drop policy if exists accesos_ver on public.accesos;
create policy accesos_ver on public.accesos
  for select to authenticated
  using (empresa_id = public.mi_empresa() and (user_id = auth.uid() or public.mi_rol() = 'dueno'));
-- Sin políticas de alta, cambio ni baja: solo se registra con registrar_acceso().

-- Anota que la persona usó la app hoy (una vez por día; repetir no hace nada).
create or replace function public.registrar_acceso()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.mi_empresa() is null then
    return; -- sin sesión o sin perfil activo: nada que anotar
  end if;
  insert into public.accesos (empresa_id, user_id, dia)
  values (public.mi_empresa(), auth.uid(), public.hoy_ar())
  on conflict (user_id, dia) do nothing;
end;
$$;

revoke all on public.accesos from anon;
revoke execute on function public.registrar_acceso() from public, anon;
grant  execute on function public.registrar_acceso() to authenticated;
