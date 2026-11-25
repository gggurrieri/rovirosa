-- =============================================================================
-- Rovirosa · Sprint 4a: resultados del mes, comienzo y fin de viaje con un toque,
-- y comprobantes de transferencia.
--   1. resultados_mes(): facturado, cobrado, recuperado y viajes, calculado en la base.
--   2. cambiar_estado_viaje(): suma Programado ↔ En viaje (botón "Empezó el viaje").
--   3. Storage: espacio privado "comprobantes", una carpeta por empresa.
--   4. registrar_pago() guarda el comprobante; adjuntar_comprobante() lo agrega después.
-- Se puede volver a correr sin error. Todo corre con los permisos del usuario.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Resultados del mes
-- -----------------------------------------------------------------------------
-- Facturado: autos de viajes que salieron en el mes (sin cancelados).
-- Cobrado:   pagos del mes (sin anulados).
-- Recuperado: lo aplicado en el mes a autos que YA estaban vencidos el día del pago
--             (la plata que sin el sistema probablemente se perdía).
-- Viajes:    viajes que salieron en el mes (sin cancelados).
create or replace function public.resultados_mes(p_anio int, p_mes int)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with rango as (
    select make_date(p_anio, p_mes, 1) as desde,
           (make_date(p_anio, p_mes, 1) + interval '1 month')::date as hasta
  ),
  facturado as (
    select i.moneda, sum(i.precio_centavos) as total
    from items_viaje i
    join viajes v on v.id = i.viaje_id, rango r
    where not i.cancelado and v.estado <> 'cancelado'
      and v.fecha_salida >= r.desde and v.fecha_salida < r.hasta
    group by i.moneda
  ),
  cobrado as (
    select p.moneda, sum(p.monto_centavos) as total
    from pagos p, rango r
    where p.anulado_en is null and p.fecha >= r.desde and p.fecha < r.hasta
    group by p.moneda
  ),
  recuperado as (
    select p.moneda, sum(a.monto_centavos) as total
    from aplicaciones_pago a
    join pagos p       on p.id = a.pago_id and p.anulado_en is null
    join items_viaje i on i.id = a.item_id
    join empresas e    on e.id = i.empresa_id, rango r
    where p.fecha >= r.desde and p.fecha < r.hasta
      and i.fecha_entrega is not null
      and p.fecha > i.fecha_entrega + e.dias_vencimiento
    group by p.moneda
  ),
  monedas as (
    select moneda from facturado union select moneda from cobrado union select moneda from recuperado
  )
  select jsonb_build_object(
    'viajes', (select count(*) from viajes v, rango r
               where v.estado <> 'cancelado' and v.fecha_salida >= r.desde and v.fecha_salida < r.hasta),
    'montos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'moneda', m.moneda,
               'facturado', coalesce(f.total, 0),
               'cobrado', coalesce(c.total, 0),
               'recuperado', coalesce(r.total, 0)) order by m.moneda)
      from monedas m
      left join facturado f using (moneda)
      left join cobrado c using (moneda)
      left join recuperado r using (moneda)
    ), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- 2. Estados: "Empezó el viaje" pasa directo de Programado a En viaje
-- -----------------------------------------------------------------------------
create or replace function public.cambiar_estado_viaje(
  p_viaje_id       uuid,
  p_desde          text,
  p_hacia          text,
  p_fecha_entrega  date default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado  text;
  v_salida  date;
  v_fecha   date;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para cambiar viajes' using errcode = '42501';
  end if;

  select estado, fecha_salida into v_estado, v_salida
  from public.viajes where id = p_viaje_id for update;
  if not found then
    raise exception 'No se encontró el viaje' using errcode = 'P0002';
  end if;
  if v_estado <> p_desde then
    raise exception 'El viaje cambió mientras lo mirabas. Recargá la página';
  end if;

  if (p_desde, p_hacia) not in (
    ('programado', 'en_retiro'), ('reprogramado', 'en_retiro'), ('en_retiro', 'en_viaje'),
    ('en_viaje', 'entregado'), ('entregado', 'cerrado'),
    ('programado', 'en_viaje'), ('reprogramado', 'en_viaje'),                 -- "Empezó el viaje"
    ('en_retiro', 'programado'), ('en_viaje', 'en_retiro'), ('en_viaje', 'programado'),
    ('entregado', 'en_viaje'), ('cerrado', 'entregado'),
    ('programado', 'cancelado'), ('reprogramado', 'cancelado'), ('en_retiro', 'cancelado')
  ) then
    raise exception 'No se puede pasar de % a %', p_desde, p_hacia using errcode = '22023';
  end if;

  if p_hacia = 'cancelado' and exists (
    select 1
    from public.aplicaciones_pago a
    join public.pagos p on p.id = a.pago_id and p.anulado_en is null
    join public.items_viaje i on i.id = a.item_id
    where i.viaje_id = p_viaje_id
  ) then
    raise exception 'El viaje ya tiene pagos aplicados y todavía no se puede cancelar' using errcode = '22023';
  end if;

  if p_desde = 'en_viaje' and p_hacia = 'entregado' then
    v_fecha := coalesce(p_fecha_entrega, public.hoy_ar());
    if v_fecha > public.hoy_ar() then
      raise exception 'La fecha de entrega no puede ser posterior a hoy' using errcode = '22023';
    end if;
    if v_fecha < v_salida then
      raise exception 'La fecha de entrega no puede ser antes de la salida' using errcode = '22023';
    end if;
    update public.items_viaje set fecha_entrega = v_fecha
    where viaje_id = p_viaje_id and not cancelado;
  elsif p_desde = 'entregado' and p_hacia = 'en_viaje' then
    update public.items_viaje set fecha_entrega = null where viaje_id = p_viaje_id;
  elsif p_hacia = 'cancelado' then
    update public.items_viaje set cancelado = true where viaje_id = p_viaje_id;
  end if;

  update public.viajes set estado = p_hacia where id = p_viaje_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Storage: comprobantes privados, una carpeta por empresa
-- -----------------------------------------------------------------------------
-- Ruta: {empresa_id}/{pago_id}/comprobante.{ext}. Solo se lee y se sube en la
-- carpeta de la propia empresa. No hay políticas de borrar ni de reemplazar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists comprobantes_select on storage.objects;
create policy comprobantes_select on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes'
         and (storage.foldername(name))[1] = public.mi_empresa()::text
         and public.puedo_editar());

drop policy if exists comprobantes_insert on storage.objects;
create policy comprobantes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes'
              and (storage.foldername(name))[1] = public.mi_empresa()::text
              and public.puedo_editar());

-- Un comprobante es válido para un pago si está en la carpeta de la empresa y del
-- pago, y el archivo existe (subido por un usuario de esa empresa).
create or replace function public.comprobante_valido(p_pago_id uuid, p_path text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select p_path like public.mi_empresa()::text || '/' || p_pago_id::text || '/%'
     and exists (select 1 from storage.objects where bucket_id = 'comprobantes' and name = p_path)
$$;

-- -----------------------------------------------------------------------------
-- 4. Pagos con comprobante
-- -----------------------------------------------------------------------------
alter table public.pagos add column if not exists comprobante_subido_en timestamptz;

-- Se reemplaza registrar_pago para sumar el comprobante (cambia la firma).
drop function if exists public.registrar_pago(uuid, uuid, date, bigint, text, text, text, text, jsonb);

create or replace function public.registrar_pago(
  p_id               uuid,
  p_cliente_id       uuid,
  p_fecha            date,
  p_monto_centavos   bigint,
  p_moneda           text,
  p_medio            text  default 'transferencia',
  p_titular          text  default null,
  p_notas            text  default null,
  p_aplicaciones     jsonb default '[]'::jsonb,
  p_comprobante_path text  default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_aplicacion jsonb;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para registrar pagos' using errcode = '42501';
  end if;
  if p_fecha > public.hoy_ar() then
    raise exception 'La fecha del pago no puede ser posterior a hoy' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_aplicaciones, '[]'::jsonb)) <> 'array' then
    raise exception 'Las aplicaciones tienen que ser una lista' using errcode = '22023';
  end if;

  if exists (select 1 from public.pagos where id = p_id) then
    return jsonb_build_object('pago_id', p_id, 'duplicado', true);
  end if;

  if p_comprobante_path is not null and not public.comprobante_valido(p_id, p_comprobante_path) then
    raise exception 'El comprobante no es válido. Volvé a adjuntarlo' using errcode = '22023';
  end if;

  begin
    insert into public.pagos (id, cliente_id, fecha, monto_centavos, moneda, medio, titular, notas,
                              comprobante_path, comprobante_subido_en)
    values (p_id, p_cliente_id, p_fecha, p_monto_centavos, p_moneda, p_medio,
            nullif(trim(p_titular), ''), nullif(trim(p_notas), ''),
            p_comprobante_path, case when p_comprobante_path is not null then now() end);
  exception when unique_violation then
    return jsonb_build_object('pago_id', p_id, 'duplicado', true);
  end;

  for v_aplicacion in select * from jsonb_array_elements(coalesce(p_aplicaciones, '[]'::jsonb))
  loop
    insert into public.aplicaciones_pago (pago_id, item_id, monto_centavos)
    values (p_id, (v_aplicacion ->> 'item_id')::uuid, (v_aplicacion ->> 'monto_centavos')::bigint);
  end loop;

  return jsonb_build_object('pago_id', p_id, 'duplicado', false);
end;
$$;

-- Agregar el comprobante a un pago que se cargó sin él (no se reemplaza uno existente).
create or replace function public.adjuntar_comprobante(p_pago_id uuid, p_path text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actual text;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para modificar pagos' using errcode = '42501';
  end if;
  select comprobante_path into v_actual from public.pagos where id = p_pago_id for update;
  if not found then
    raise exception 'No se encontró el pago' using errcode = 'P0002';
  end if;
  if v_actual is not null then
    raise exception 'El pago ya tiene un comprobante' using errcode = '22023';
  end if;
  if not public.comprobante_valido(p_pago_id, p_path) then
    raise exception 'El comprobante no es válido. Volvé a adjuntarlo' using errcode = '22023';
  end if;
  update public.pagos set comprobante_path = p_path, comprobante_subido_en = now() where id = p_pago_id;
end;
$$;

-- v_pagos suma el comprobante (al final, sin romper columnas).
create or replace view public.v_pagos
with (security_invoker = true)
as
select
  p.id,
  p.empresa_id,
  p.cliente_id,
  c.nombre                                   as cliente_nombre,
  p.fecha,
  p.monto_centavos,
  p.moneda,
  p.medio,
  p.titular,
  p.notas,
  p.anulado_en,
  p.anulado_motivo,
  p.creado_en,
  coalesce(a.aplicado, 0)                    as aplicado_centavos,
  case when p.anulado_en is null
       then p.monto_centavos - coalesce(a.aplicado, 0)
       else 0 end                            as a_favor_centavos,
  p.comprobante_path
from public.pagos p
join public.clientes c on c.id = p.cliente_id
left join (
  select pago_id, sum(monto_centavos) as aplicado
  from public.aplicaciones_pago
  group by pago_id
) a on a.pago_id = p.id;

revoke execute on function public.resultados_mes(int, int) from public, anon;
revoke execute on function public.registrar_pago(uuid, uuid, date, bigint, text, text, text, text, jsonb, text) from public, anon;
revoke execute on function public.adjuntar_comprobante(uuid, text) from public, anon;
revoke execute on function public.comprobante_valido(uuid, text) from public, anon;
grant  execute on function public.resultados_mes(int, int) to authenticated;
grant  execute on function public.registrar_pago(uuid, uuid, date, bigint, text, text, text, text, jsonb, text) to authenticated;
grant  execute on function public.adjuntar_comprobante(uuid, text) to authenticated;
grant  execute on function public.comprobante_valido(uuid, text) to authenticated;
