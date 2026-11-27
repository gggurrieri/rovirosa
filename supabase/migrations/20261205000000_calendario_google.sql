-- =============================================================================
-- Rovirosa · Calendario en Google (suscripción iCal)
--   Cada usuario tiene un link secreto que Google Calendar, el iPhone u Outlook
--   leen solos. El link trae viajes y bloqueos de su empresa, SIN precios, montos
--   ni datos de clientes. Se puede regenerar: el anterior deja de funcionar.
-- Se puede volver a correr sin error.
-- =============================================================================

create table if not exists public.calendario_tokens (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null default public.mi_empresa() references public.empresas (id),
  user_id      uuid not null default auth.uid(),
  token        text not null unique,
  creado_en    timestamptz not null default now(),
  revocado_en  timestamptz
);
create unique index if not exists calendario_tokens_uno_vigente
  on public.calendario_tokens (user_id) where revocado_en is null;

alter table public.calendario_tokens enable row level security;
drop policy if exists calendario_tokens_select on public.calendario_tokens;
create policy calendario_tokens_select on public.calendario_tokens for select to authenticated
  using (user_id = auth.uid() and empresa_id = public.mi_empresa());

drop trigger if exists trg_aud_calendario_tokens on public.calendario_tokens;
create trigger trg_aud_calendario_tokens
after insert or update on public.calendario_tokens
for each row execute function public.registrar_auditoria();

-- Link vigente del usuario (lo crea la primera vez). Con p_nuevo = true, anula el
-- anterior y crea otro. Solo dueño y administrativo (los que ven viajes).
create or replace function public.token_calendario(p_nuevo boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para el calendario' using errcode = '42501';
  end if;
  if p_nuevo then
    update public.calendario_tokens set revocado_en = now() where user_id = auth.uid() and revocado_en is null;
  end if;
  select token into v_token from public.calendario_tokens where user_id = auth.uid() and revocado_en is null;
  if v_token is null then
    -- 2 UUID v4 = 244 bits al azar: imposible de adivinar.
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.calendario_tokens (empresa_id, user_id, token) values (public.mi_empresa(), auth.uid(), v_token);
  end if;
  return v_token;
end;
$$;

-- Lo que lee Google: sin sesión, solo con el link. Devuelve null si el link no
-- existe, fue anulado, o su usuario ya no tiene acceso (desactivado o chofer).
-- Rango: del último mes a los próximos 6 meses. Sin precios ni clientes.
create or replace function public.calendario_ics(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
begin
  select t.empresa_id into v_empresa
  from public.calendario_tokens t
  join public.perfiles p on p.user_id = t.user_id and p.empresa_id = t.empresa_id
  where t.token = p_token and t.revocado_en is null and p.activo and p.rol in ('dueno', 'administrativo');
  if v_empresa is null then
    return null;
  end if;

  return jsonb_build_object(
    'empresa', (select nombre from public.empresas where id = v_empresa),
    'viajes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'numero', v.numero, 'fecha_salida', v.fecha_salida, 'fecha_llegada', v.fecha_llegada_estimada,
               'origen', v.origen, 'destino', v.destino, 'estado', v.estado,
               'unidad', (select nombre from public.unidades where id = v.unidad_id),
               'chofer', (select nombre from public.choferes where id = v.chofer_id),
               'autos', (select count(*) from public.items_viaje i where i.viaje_id = v.id and not i.cancelado))
             order by v.fecha_salida)
      from public.viajes v
      where v.empresa_id = v_empresa and v.estado <> 'cancelado'
        and coalesce(v.fecha_llegada_estimada, v.fecha_salida) >= public.hoy_ar() - 31
        and v.fecha_salida <= public.hoy_ar() + 183
    ), '[]'::jsonb),
    'bloqueos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'desde', b.desde, 'hasta', b.hasta, 'motivo', b.motivo,
               'quien', coalesce((select nombre from public.unidades where id = b.unidad_id), (select nombre from public.choferes where id = b.chofer_id)))
             order by b.desde)
      from public.bloqueos_disponibilidad b
      where b.empresa_id = v_empresa and b.anulado_en is null
        and b.hasta >= public.hoy_ar() - 31 and b.desde <= public.hoy_ar() + 183
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.token_calendario(boolean) from public, anon;
grant  execute on function public.token_calendario(boolean) to authenticated;
-- calendario_ics la llama Google sin sesión: el link secreto es la llave.
revoke execute on function public.calendario_ics(text) from public;
grant  execute on function public.calendario_ics(text) to anon, authenticated;
