-- =============================================================================
-- Rovirosa · Sprint 8: Calendario por unidad
--   1. Bloqueos (service, VTV, taller, franco, vacaciones) que se anulan con
--      motivo en vez de borrarse.
--   2. crear_bloqueo(): guarda y avisa con qué viajes choca (no lo impide).
--   3. agenda(desde, hasta): unidades, viajes y bloqueos del rango, en una sola
--      ida a la base, para el calendario y "¿Quién está libre?".
-- Se puede volver a correr sin error.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bloqueos: anular en vez de borrar
-- -----------------------------------------------------------------------------
alter table public.bloqueos_disponibilidad add column if not exists anulado_en     timestamptz;
alter table public.bloqueos_disponibilidad add column if not exists anulado_motivo text;
alter table public.bloqueos_disponibilidad add column if not exists anulado_por    uuid;
alter table public.bloqueos_disponibilidad add column if not exists creado_por     uuid default auth.uid();

-- Un bloqueo no se edita: se anula (una vez, con motivo) y se carga otro.
create or replace function public.proteger_bloqueo()
returns trigger
language plpgsql
as $$
begin
  if old.anulado_en is not null then
    raise exception 'El bloqueo ya estaba anulado' using errcode = '22023';
  end if;
  if (new.unidad_id, new.chofer_id, new.desde, new.hasta, new.motivo, new.empresa_id)
     is distinct from (old.unidad_id, old.chofer_id, old.desde, old.hasta, old.motivo, old.empresa_id) then
    raise exception 'Un bloqueo no se edita: anulalo y cargá otro' using errcode = '22023';
  end if;
  if new.anulado_en is not null then
    if nullif(trim(coalesce(new.anulado_motivo, '')), '') is null then
      raise exception 'Escribí el motivo' using errcode = '22023';
    end if;
    new.anulado_por := coalesce(new.anulado_por, auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_proteger_bloqueo on public.bloqueos_disponibilidad;
create trigger trg_proteger_bloqueo
before update on public.bloqueos_disponibilidad
for each row execute function public.proteger_bloqueo();

drop trigger if exists trg_aud_bloqueos on public.bloqueos_disponibilidad;
create trigger trg_aud_bloqueos
after insert or update on public.bloqueos_disponibilidad
for each row execute function public.registrar_auditoria();

-- -----------------------------------------------------------------------------
-- 2. Crear y anular bloqueos (dueño y administrativo)
-- -----------------------------------------------------------------------------
-- Devuelve { id, choques: [{ numero, fecha_salida }] }: los viajes de esa unidad o
-- chofer que caen en esos días. Avisa, no impide (igual que al cargar un viaje).
create or replace function public.crear_bloqueo(
  p_unidad_id uuid, p_chofer_id uuid, p_desde date, p_hasta date, p_motivo text, p_notas text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para cargar bloqueos' using errcode = '42501';
  end if;
  if (p_unidad_id is null) = (p_chofer_id is null) then
    raise exception 'Elegí una unidad o un chofer' using errcode = '22023';
  end if;
  if p_desde is null or p_hasta is null then
    raise exception 'Elegí las fechas' using errcode = '22023';
  end if;
  if p_hasta < p_desde then
    raise exception 'La fecha "hasta" no puede ser antes de "desde"' using errcode = '22023';
  end if;
  if p_hasta - p_desde > 365 then
    raise exception 'Un bloqueo dura hasta un año' using errcode = '22023';
  end if;
  if coalesce(p_motivo, '') not in ('service', 'vtv', 'taller', 'franco', 'vacaciones', 'otro') then
    raise exception 'Elegí el motivo' using errcode = '22023';
  end if;
  if p_unidad_id is not null and not exists (select 1 from public.unidades where id = p_unidad_id) then
    raise exception 'La unidad no existe' using errcode = '22023';
  end if;
  if p_chofer_id is not null and not exists (select 1 from public.choferes where id = p_chofer_id) then
    raise exception 'El chofer no existe' using errcode = '22023';
  end if;

  insert into public.bloqueos_disponibilidad (unidad_id, chofer_id, desde, hasta, motivo, notas)
  values (p_unidad_id, p_chofer_id, p_desde, p_hasta, p_motivo, nullif(trim(coalesce(p_notas, '')), ''))
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'choques', coalesce((
      select jsonb_agg(jsonb_build_object('numero', v.numero, 'fecha_salida', v.fecha_salida) order by v.fecha_salida, v.numero)
      from public.viajes v
      where v.estado <> 'cancelado'
        and ((p_unidad_id is not null and v.unidad_id = p_unidad_id) or (p_chofer_id is not null and v.chofer_id = p_chofer_id))
        and v.fecha_salida <= p_hasta
        and coalesce(v.fecha_llegada_estimada, v.fecha_salida) >= p_desde
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.anular_bloqueo(p_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para anular bloqueos' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribí el motivo' using errcode = '22023';
  end if;
  update public.bloqueos_disponibilidad
  set anulado_en = now(), anulado_motivo = trim(p_motivo)
  where id = p_id and anulado_en is null;
  if not found then
    raise exception 'No se encontró el bloqueo (o ya estaba anulado)' using errcode = 'P0002';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Agenda de un rango de días (hasta 62)
-- -----------------------------------------------------------------------------
-- Devuelve { unidades: [...], choferes: [...], viajes: [...], bloqueos: [...] }.
-- Viajes: los que pisan el rango (sin llegada estimada, ocupan el día de salida).
create or replace function public.agenda(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'Elegí un rango de hasta dos meses' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'unidades', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre, 'capacidad_autos', u.capacidad_autos,
                                          'chofer_habitual_id', u.chofer_habitual_id) order by u.nombre)
      from public.unidades u where u.activa
    ), '[]'::jsonb),
    'choferes', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre) order by c.nombre)
      from public.choferes c where c.activo
    ), '[]'::jsonb),
    'viajes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'numero', v.numero, 'unidad_id', v.unidad_id, 'chofer_id', v.chofer_id,
               'fecha_salida', v.fecha_salida, 'fecha_llegada', v.fecha_llegada_estimada,
               'origen', v.origen, 'destino', v.destino, 'estado', v.estado,
               'autos', (select count(*) from public.items_viaje i where i.viaje_id = v.id and not i.cancelado))
             order by v.fecha_salida, v.numero)
      from public.viajes v
      where v.estado <> 'cancelado'
        and v.fecha_salida <= p_hasta
        and coalesce(v.fecha_llegada_estimada, v.fecha_salida) >= p_desde
    ), '[]'::jsonb),
    'bloqueos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'unidad_id', b.unidad_id, 'chofer_id', b.chofer_id, 'desde', b.desde, 'hasta', b.hasta,
               'motivo', b.motivo, 'notas', b.notas)
             order by b.desde)
      from public.bloqueos_disponibilidad b
      where b.anulado_en is null and b.desde <= p_hasta and b.hasta >= p_desde
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.crear_bloqueo(uuid, uuid, date, date, text, text) from public, anon;
revoke execute on function public.anular_bloqueo(uuid, text) from public, anon;
revoke execute on function public.agenda(date, date) from public, anon;
grant  execute on function public.crear_bloqueo(uuid, uuid, date, date, text, text) to authenticated;
grant  execute on function public.anular_bloqueo(uuid, text) to authenticated;
grant  execute on function public.agenda(date, date) to authenticated;
