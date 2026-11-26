-- =============================================================================
-- Rovirosa · Sprint 5b: entrega por auto y cancelar con anticipo
--   1. Desaplicar pagos: una aplicación deja de cubrir un auto (con motivo, sin
--      borrarse) y la plata vuelve a quedar a favor del cliente. Todas las cuentas
--      ignoran lo desaplicado.
--   2. Cancelar un auto o un viaje con pagos: "se lo queda como seña" o "queda a
--      favor del cliente", con motivo.
--   3. Usar el saldo a favor de un pago en otros autos.
--   4. Entrega por auto: cada auto con su fecha; el viaje pasa a Entregado solo
--      cuando se entrega el último.
-- Se puede volver a correr sin error.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Desaplicar
-- -----------------------------------------------------------------------------
alter table public.aplicaciones_pago add column if not exists desaplicado_en     timestamptz;
alter table public.aplicaciones_pago add column if not exists desaplicado_motivo text;
alter table public.aplicaciones_pago add column if not exists desaplicado_por    uuid;

-- Un mismo pago puede volver a aplicarse al mismo auto (por ejemplo, si el precio
-- subió después de editar el viaje y se usa el saldo a favor de ese pago).
alter table public.aplicaciones_pago drop constraint if exists aplicaciones_pago_pago_id_item_id_key;

-- Una aplicación no se edita: solo se desaplica, una vez y con motivo.
create or replace function public.proteger_aplicacion()
returns trigger
language plpgsql
as $$
begin
  if new.pago_id <> old.pago_id or new.item_id <> old.item_id
     or new.monto_centavos <> old.monto_centavos or new.empresa_id <> old.empresa_id then
    raise exception 'Una aplicación de pago no se edita: se desaplica' using errcode = '22023';
  end if;
  if old.desaplicado_en is not null then
    raise exception 'La aplicación ya estaba desaplicada' using errcode = '22023';
  end if;
  if new.desaplicado_en is not null then
    if nullif(trim(coalesce(new.desaplicado_motivo, '')), '') is null then
      raise exception 'Escribí el motivo' using errcode = '22023';
    end if;
    new.desaplicado_por := coalesce(new.desaplicado_por, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_aplicacion on public.aplicaciones_pago;
create trigger trg_proteger_aplicacion
before update on public.aplicaciones_pago
for each row execute function public.proteger_aplicacion();

-- Reglas de cobro, ahora sin contar lo desaplicado. Una desaplicación (update) ya
-- la controla proteger_aplicacion(). Tampoco se cobra un auto cancelado.
create or replace function public.validar_aplicacion()
returns trigger
language plpgsql
as $$
declare
  v_pago  public.pagos%rowtype;
  v_item  public.items_viaje%rowtype;
  v_aplicado_pago  bigint;
  v_cobrado_item   bigint;
begin
  if tg_op = 'UPDATE' then
    return new;
  end if;

  select * into v_pago from public.pagos where id = new.pago_id for update;
  select * into v_item from public.items_viaje where id = new.item_id for update;

  if v_pago.id is null then
    raise exception 'El pago no existe';
  end if;
  if v_item.id is null then
    raise exception 'El auto no existe';
  end if;
  if v_pago.anulado_en is not null then
    raise exception 'El pago está anulado';
  end if;
  if v_item.cancelado then
    raise exception 'El auto está cancelado: no se le aplican pagos' using errcode = '22023';
  end if;
  if v_pago.empresa_id is distinct from v_item.empresa_id
     or new.empresa_id is distinct from v_pago.empresa_id then
    raise exception 'El pago y el ítem son de empresas distintas';
  end if;
  if v_pago.moneda <> v_item.moneda then
    raise exception 'El pago está en % y el ítem en %', v_pago.moneda, v_item.moneda;
  end if;

  select coalesce(sum(a.monto_centavos), 0) into v_aplicado_pago
  from public.aplicaciones_pago a
  where a.pago_id = new.pago_id and a.id <> new.id and a.desaplicado_en is null;

  if v_aplicado_pago + new.monto_centavos > v_pago.monto_centavos then
    raise exception 'Se aplicaría más que el monto del pago';
  end if;

  select coalesce(sum(a.monto_centavos), 0) into v_cobrado_item
  from public.aplicaciones_pago a
  join public.pagos p on p.id = a.pago_id and p.anulado_en is null
  where a.item_id = new.item_id and a.id <> new.id and a.desaplicado_en is null;

  if v_cobrado_item + new.monto_centavos > v_item.precio_centavos then
    raise exception 'Se cobraría más que el precio del ítem';
  end if;

  return new;
end;
$$;

-- Lo cobrado de un auto: pagos vigentes, sin lo desaplicado.
create or replace function public.cobrado_item(p_item_id uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(a.monto_centavos), 0)::bigint
  from public.aplicaciones_pago a
  join public.pagos p on p.id = a.pago_id and p.anulado_en is null
  where a.item_id = p_item_id and a.desaplicado_en is null
$$;

-- Vistas: mismas columnas que antes (y al final, las nuevas), sin lo desaplicado.
create or replace view public.v_items_saldo
with (security_invoker = true)
as
select
  i.id,
  i.empresa_id,
  i.viaje_id,
  v.numero          as viaje_numero,
  v.fecha_salida,
  v.origen,
  v.destino,
  v.estado          as estado_viaje,
  i.cliente_id,
  c.nombre          as cliente_nombre,
  i.vehiculo_id,
  i.moneda,
  i.precio_centavos,
  coalesce(cob.cobrado, 0)                       as cobrado_centavos,
  i.precio_centavos - coalesce(cob.cobrado, 0)   as saldo_centavos,
  case
    when i.cancelado then 'cancelado'
    when coalesce(cob.cobrado, 0) >= i.precio_centavos then 'pagado'
    when coalesce(cob.cobrado, 0) > 0 then 'parcial'
    else 'pendiente'
  end                                            as estado_cobro,
  i.fecha_entrega,
  (
    not i.cancelado
    and i.fecha_entrega is not null
    and i.precio_centavos - coalesce(cob.cobrado, 0) > 0
    and public.hoy_ar() > i.fecha_entrega + e.dias_vencimiento
  )                                              as vencido,
  nullif(trim(concat_ws(' ', ve.marca, ve.modelo)), '') as vehiculo
from public.items_viaje i
join public.viajes   v on v.id = i.viaje_id
join public.clientes c on c.id = i.cliente_id
join public.empresas e on e.id = i.empresa_id
left join public.vehiculos ve on ve.id = i.vehiculo_id
left join (
  select a.item_id, sum(a.monto_centavos) as cobrado
  from public.aplicaciones_pago a
  join public.pagos p on p.id = a.pago_id and p.anulado_en is null
  where a.desaplicado_en is null
  group by a.item_id
) cob on cob.item_id = i.id;

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
  where desaplicado_en is null
  group by pago_id
) a on a.pago_id = p.id;

create or replace view public.v_aplicaciones
with (security_invoker = true)
as
select
  a.id,
  a.empresa_id,
  a.pago_id,
  a.item_id,
  a.monto_centavos,
  v.numero    as viaje_numero,
  i.cliente_id,
  c.nombre    as cliente_nombre,
  a.desaplicado_en,
  a.desaplicado_motivo
from public.aplicaciones_pago a
join public.items_viaje i on i.id = a.item_id
join public.viajes      v on v.id = i.viaje_id
join public.clientes    c on c.id = i.cliente_id;

-- Resultados del mes: lo desaplicado no cuenta como recuperado, y una seña
-- retenida (auto cancelado que se quedó con lo cobrado) cuenta como facturado.
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
    select s.moneda,
           sum(case when s.estado_cobro = 'cancelado' then s.cobrado_centavos else s.precio_centavos end) as total
    from v_items_saldo s, rango r
    where (s.estado_cobro <> 'cancelado' and s.estado_viaje <> 'cancelado' or s.estado_cobro = 'cancelado' and s.cobrado_centavos > 0)
      and s.fecha_salida >= r.desde and s.fecha_salida < r.hasta
    group by s.moneda
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
    where a.desaplicado_en is null
      and p.fecha >= r.desde and p.fecha < r.hasta
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
-- 2. Cancelar autos con pagos
-- -----------------------------------------------------------------------------
-- Un auto cancelado con pagos solo puede quedarse con exactamente lo cobrado (seña).
create or replace function public.proteger_item()
returns trigger
language plpgsql
as $$
declare
  v_cobrado bigint := public.cobrado_item(new.id);
  v_estado  text;
begin
  if new.precio_centavos <> old.precio_centavos then
    select estado into v_estado from public.viajes where id = new.viaje_id;
    if old.cancelado or v_estado = 'cancelado' then
      raise exception 'Un auto cancelado no cambia de precio' using errcode = '22023';
    end if;
    if new.precio_centavos < v_cobrado then
      raise exception 'Ya se cobraron % de este auto: el precio no puede ser menor', public.plata_ar(v_cobrado, new.moneda)
        using errcode = '22023';
    end if;
  end if;

  if new.cancelado and not old.cancelado and v_cobrado > 0 and new.precio_centavos <> v_cobrado then
    raise exception 'El auto tiene pagos: elegí si lo cobrado queda como seña o a favor del cliente' using errcode = '22023';
  end if;
  if old.cancelado and not new.cancelado then
    raise exception 'Un auto cancelado no se reactiva: agregalo de nuevo' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- p_anticipo: "sena" (se queda con lo cobrado) o "a_favor" (se desaplica y queda
-- a favor del cliente). Solo hace falta si el auto tiene pagos.
create or replace function public.cancelar_item(p_item_id uuid, p_anticipo text, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cobrado bigint := public.cobrado_item(p_item_id);
  v_motivo  text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if v_cobrado = 0 then
    update public.items_viaje set cancelado = true where id = p_item_id and not cancelado;
    return;
  end if;
  if coalesce(p_anticipo, '') not in ('sena', 'a_favor') then
    raise exception 'El auto tiene pagos: elegí si lo cobrado queda como seña o a favor del cliente' using errcode = '22023';
  end if;
  if v_motivo is null then
    raise exception 'Escribí el motivo de la cancelación' using errcode = '22023';
  end if;

  if p_anticipo = 'sena' then
    update public.items_viaje set precio_centavos = v_cobrado, cancelado = true where id = p_item_id;
  else
    update public.aplicaciones_pago
    set desaplicado_en = now(), desaplicado_motivo = v_motivo
    where item_id = p_item_id and desaplicado_en is null;
    update public.items_viaje set cancelado = true where id = p_item_id;
  end if;
end;
$$;

-- Cancelar un viaje que todavía no salió, con o sin pagos.
create or replace function public.cancelar_viaje(
  p_viaje_id  uuid,
  p_desde     text,
  p_anticipo  text default null,
  p_motivo    text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado text;
  v_item   uuid;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para cancelar viajes' using errcode = '42501';
  end if;
  select estado into v_estado from public.viajes where id = p_viaje_id for update;
  if not found then
    raise exception 'No se encontró el viaje' using errcode = 'P0002';
  end if;
  if v_estado <> p_desde then
    raise exception 'El viaje cambió mientras lo mirabas. Recargá la página';
  end if;
  if v_estado not in ('programado', 'reprogramado', 'en_retiro') then
    raise exception 'Solo se cancela un viaje que todavía no salió' using errcode = '22023';
  end if;

  perform set_config('rovirosa.motivo', coalesce(trim(p_motivo), ''), true);
  for v_item in select id from public.items_viaje where viaje_id = p_viaje_id and not cancelado
  loop
    perform public.cancelar_item(v_item, p_anticipo, p_motivo);
  end loop;
  update public.viajes set estado = 'cancelado' where id = p_viaje_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Usar el saldo a favor de un pago
-- -----------------------------------------------------------------------------
-- p_aplicaciones: [{ "item_id": ..., "monto_centavos": ... }]. Las reglas de
-- siempre (no más que el pago, no más que el precio, misma moneda) las controla
-- validar_aplicacion().
create or replace function public.usar_saldo_a_favor(p_pago_id uuid, p_aplicaciones jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_aplicacion jsonb;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para aplicar pagos' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pagos where id = p_pago_id and anulado_en is null) then
    raise exception 'No se encontró el pago' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_aplicaciones) is distinct from 'array' or jsonb_array_length(p_aplicaciones) = 0 then
    raise exception 'Elegí al menos un auto' using errcode = '22023';
  end if;
  for v_aplicacion in select * from jsonb_array_elements(p_aplicaciones)
  loop
    insert into public.aplicaciones_pago (pago_id, item_id, monto_centavos)
    values (p_pago_id, (v_aplicacion ->> 'item_id')::uuid, (v_aplicacion ->> 'monto_centavos')::bigint);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Entrega por auto
-- -----------------------------------------------------------------------------
create or replace function public.entregar_auto(p_item_id uuid, p_fecha date default null)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item   public.items_viaje%rowtype;
  v_viaje  public.viajes%rowtype;
  v_fecha  date := coalesce(p_fecha, public.hoy_ar());
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para cambiar viajes' using errcode = '42501';
  end if;
  select * into v_item from public.items_viaje where id = p_item_id;
  if not found then
    raise exception 'No se encontró el auto' using errcode = 'P0002';
  end if;
  select * into v_viaje from public.viajes where id = v_item.viaje_id for update;
  if v_item.cancelado then
    raise exception 'El auto está cancelado' using errcode = '22023';
  end if;
  if v_viaje.estado <> 'en_viaje' then
    raise exception 'Marcá el viaje "En viaje" antes de entregar autos' using errcode = '22023';
  end if;
  if v_item.fecha_entrega is not null then
    raise exception 'El auto ya estaba entregado' using errcode = '22023';
  end if;
  if v_fecha > public.hoy_ar() then
    raise exception 'La fecha de entrega no puede ser posterior a hoy' using errcode = '22023';
  end if;
  if v_fecha < v_viaje.fecha_salida then
    raise exception 'La fecha de entrega no puede ser antes de la salida' using errcode = '22023';
  end if;

  update public.items_viaje set fecha_entrega = v_fecha where id = p_item_id;
  if not exists (select 1 from public.items_viaje
                 where viaje_id = v_viaje.id and not cancelado and fecha_entrega is null) then
    update public.viajes set estado = 'entregado' where id = v_viaje.id;
    return 'entregado';
  end if;
  return 'en_viaje';
end;
$$;

create or replace function public.deshacer_entrega(p_item_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item   public.items_viaje%rowtype;
  v_estado text;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para cambiar viajes' using errcode = '42501';
  end if;
  select * into v_item from public.items_viaje where id = p_item_id;
  if not found then
    raise exception 'No se encontró el auto' using errcode = 'P0002';
  end if;
  select estado into v_estado from public.viajes where id = v_item.viaje_id for update;
  if v_item.fecha_entrega is null then
    raise exception 'El auto no estaba entregado' using errcode = '22023';
  end if;
  if v_estado not in ('en_viaje', 'entregado') then
    raise exception 'El viaje está cerrado: reabrilo para cambiar entregas' using errcode = '22023';
  end if;

  update public.items_viaje set fecha_entrega = null where id = p_item_id;
  if v_estado = 'entregado' then
    update public.viajes set estado = 'en_viaje' where id = v_item.viaje_id;
  end if;
  return 'en_viaje';
end;
$$;

-- Igual que antes, salvo: "Entregado" respeta las fechas de los autos que ya se
-- entregaron, y cancelar con pagos va por cancelar_viaje().
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
    ('en_retiro', 'programado'), ('en_viaje', 'en_retiro'),
    ('en_viaje', 'programado'), ('en_viaje', 'reprogramado'),                 -- deshacer "Empezó"
    ('entregado', 'en_viaje'), ('cerrado', 'entregado'),
    ('programado', 'cancelado'), ('reprogramado', 'cancelado'), ('en_retiro', 'cancelado')
  ) then
    raise exception 'No se puede pasar de % a %', p_desde, p_hacia using errcode = '22023';
  end if;

  if p_hacia = 'cancelado' and exists (
    select 1 from public.items_viaje i where i.viaje_id = p_viaje_id and public.cobrado_item(i.id) > 0
  ) then
    raise exception 'El viaje tiene pagos: elegí si lo cobrado queda como seña o a favor del cliente' using errcode = '22023';
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
    where viaje_id = p_viaje_id and not cancelado and fecha_entrega is null;
  elsif p_desde = 'entregado' and p_hacia = 'en_viaje' then
    update public.items_viaje set fecha_entrega = null where viaje_id = p_viaje_id;
  elsif p_hacia = 'cancelado' then
    update public.items_viaje set cancelado = true where viaje_id = p_viaje_id;
  end if;

  update public.viajes set estado = p_hacia where id = p_viaje_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Editar viaje: quitar un auto con pagos (seña o a favor, con motivo)
-- -----------------------------------------------------------------------------
create or replace function public.editar_viaje(
  p_viaje_id  uuid,
  p_version   text,
  p_cambios   jsonb,
  p_motivo    text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v          public.viajes%rowtype;
  d          jsonb := coalesce(p_cambios -> 'viaje', '{}'::jsonb);
  v_precios  jsonb := coalesce(p_cambios -> 'precios', '[]'::jsonb);
  v_quitar   jsonb := coalesce(p_cambios -> 'quitar', '[]'::jsonb);
  v_agregar  jsonb := coalesce(p_cambios -> 'agregar', '[]'::jsonb);
  v_motivo   text := nullif(trim(coalesce(p_motivo, '')), '');
  v_campo    text;
  v_cambios  int := 0;
  v_elem     jsonb;
  v_salida   date;
  v_llegada  date;
  v_origen   text;
  v_destino  text;
  v_unidad   uuid;
  v_capacidad int;
  v_activos  int;
  v_moneda   text;
  v_nuevos   jsonb := '{}'::jsonb;
  v_clave    text;
  v_cliente  uuid;
  v_vehiculo uuid;
  v_item     uuid;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para editar viajes' using errcode = '42501';
  end if;
  if jsonb_typeof(d) <> 'object' or jsonb_typeof(v_precios) <> 'array'
     or jsonb_typeof(v_quitar) <> 'array' or jsonb_typeof(v_agregar) <> 'array' then
    raise exception 'No pudimos leer los cambios' using errcode = '22023';
  end if;

  select * into v from public.viajes where id = p_viaje_id for update;
  if not found then
    raise exception 'No se encontró el viaje' using errcode = 'P0002';
  end if;
  if public.version_viaje(p_viaje_id) is distinct from p_version then
    raise exception 'El viaje cambió mientras lo editabas. Recargá la página para ver los cambios' using errcode = 'P0001';
  end if;

  perform set_config('rovirosa.motivo', coalesce(v_motivo, ''), true);

  -- Qué se puede tocar en este estado
  for v_campo in select jsonb_object_keys(d)
  loop
    if not v_campo = any (public.campos_editables_viaje('programado')) then
      raise exception 'No pudimos leer los cambios' using errcode = '22023';
    end if;
    if not v_campo = any (public.campos_editables_viaje(v.estado)) then
      raise exception '%', public.mensaje_edicion_viaje(v.estado) using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(v_precios) > 0 then
    if v.estado = 'cancelado' then
      raise exception '%', public.mensaje_edicion_viaje(v.estado) using errcode = '22023';
    end if;
    if v.estado in ('entregado', 'cerrado') and v_motivo is null then
      raise exception 'Escribí el motivo del cambio de precio' using errcode = '22023';
    end if;
  end if;
  if (jsonb_array_length(v_quitar) > 0 or jsonb_array_length(v_agregar) > 0)
     and v.estado not in ('programado', 'reprogramado') then
    raise exception 'Solo se agregan o quitan autos antes de que salga el viaje' using errcode = '22023';
  end if;

  -- Datos del viaje: se calculan los valores finales y se validan antes de guardar
  if d <> '{}'::jsonb then
    v_salida  := case when d ? 'fecha_salida'  then (d ->> 'fecha_salida')::date  else v.fecha_salida end;
    v_llegada := case when d ? 'fecha_llegada' then (d ->> 'fecha_llegada')::date else v.fecha_llegada_estimada end;
    v_origen  := case when d ? 'origen'  then trim(d ->> 'origen')  else v.origen end;
    v_destino := case when d ? 'destino' then trim(d ->> 'destino') else v.destino end;
    v_unidad  := case when d ? 'unidad_id' then (d ->> 'unidad_id')::uuid else v.unidad_id end;

    if v_salida is null then
      raise exception 'Revisá la fecha de salida' using errcode = '22023';
    end if;
    if v_llegada is not null and v_llegada < v_salida then
      raise exception 'La llegada no puede ser antes de la salida' using errcode = '22023';
    end if;
    if coalesce(v_origen, '') = '' or coalesce(v_destino, '') = '' then
      raise exception 'Escribí origen y destino' using errcode = '22023';
    end if;
    if lower(v_origen) = lower(v_destino) then
      raise exception 'El origen y el destino son iguales' using errcode = '22023';
    end if;
    if d ? 'unidad_id' and not exists (select 1 from public.unidades where id = v_unidad and activa) then
      raise exception 'Elegí la unidad' using errcode = '22023';
    end if;

    update public.viajes
    set fecha_salida           = v_salida,
        fecha_llegada_estimada = v_llegada,
        origen                 = v_origen,
        destino                = v_destino,
        tarifa_id              = case when v_origen = v.origen and v_destino = v.destino then tarifa_id end,
        unidad_id              = v_unidad,
        chofer_id              = case when d ? 'chofer_id' then (d ->> 'chofer_id')::uuid else chofer_id end,
        notas                  = case when d ? 'notas' then nullif(trim(d ->> 'notas'), '') else notas end
    where id = p_viaje_id;
    v_cambios := v_cambios + (select count(*) from jsonb_object_keys(d));
  end if;

  -- Precios
  for v_elem in select * from jsonb_array_elements(v_precios)
  loop
    if (v_elem ->> 'precio_centavos') is null or (v_elem ->> 'precio_centavos')::bigint < 0 then
      raise exception 'Revisá el precio' using errcode = '22023';
    end if;
    update public.items_viaje
    set precio_centavos = (v_elem ->> 'precio_centavos')::bigint
    where id = (v_elem ->> 'item_id')::uuid and viaje_id = p_viaje_id and not cancelado;
    if not found then
      raise exception 'El auto no es de este viaje' using errcode = '22023';
    end if;
    v_cambios := v_cambios + 1;
  end loop;

  -- Quitar autos (cancelados, no borrados). Cada elemento es el id del auto, o
  -- { "item_id": ..., "anticipo": "sena" | "a_favor" } si el auto tiene pagos.
  for v_elem in select * from jsonb_array_elements(v_quitar)
  loop
    v_item := case when jsonb_typeof(v_elem) = 'object' then (v_elem ->> 'item_id')::uuid else (v_elem #>> '{}')::uuid end;
    if not exists (select 1 from public.items_viaje where id = v_item and viaje_id = p_viaje_id and not cancelado) then
      raise exception 'El auto no es de este viaje' using errcode = '22023';
    end if;
    perform public.cancelar_item(v_item, case when jsonb_typeof(v_elem) = 'object' then v_elem ->> 'anticipo' end, v_motivo);
    v_cambios := v_cambios + 1;
  end loop;

  -- Agregar autos (igual que en crear_viaje)
  select moneda into v_moneda from public.items_viaje where viaje_id = p_viaje_id order by creado_en limit 1;
  for v_elem in select * from jsonb_array_elements(v_agregar)
  loop
    if v_elem ? 'cliente_id' then
      v_cliente := (v_elem ->> 'cliente_id')::uuid;
    else
      v_clave := lower(trim(v_elem -> 'cliente_nuevo' ->> 'nombre'));
      if v_clave is null or v_clave = '' then
        raise exception 'Falta el nombre del cliente nuevo' using errcode = '22023';
      end if;
      if v_nuevos ? v_clave then
        v_cliente := (v_nuevos ->> v_clave)::uuid;
      else
        insert into public.clientes (nombre, whatsapp)
        values (trim(v_elem -> 'cliente_nuevo' ->> 'nombre'), nullif(trim(v_elem -> 'cliente_nuevo' ->> 'whatsapp'), ''))
        returning id into v_cliente;
        v_nuevos := v_nuevos || jsonb_build_object(v_clave, v_cliente);
      end if;
    end if;

    if v_elem ? 'vehiculo_id' then
      v_vehiculo := (v_elem ->> 'vehiculo_id')::uuid;
      if not exists (select 1 from public.vehiculos where id = v_vehiculo and cliente_id = v_cliente) then
        raise exception 'El vehículo no es de ese cliente' using errcode = '22023';
      end if;
    else
      if nullif(trim(v_elem -> 'vehiculo' ->> 'marca'), '') is null or nullif(trim(v_elem -> 'vehiculo' ->> 'modelo'), '') is null then
        raise exception 'Falta la marca o el modelo de un auto' using errcode = '22023';
      end if;
      insert into public.vehiculos (cliente_id, marca, modelo)
      values (v_cliente, trim(v_elem -> 'vehiculo' ->> 'marca'), trim(v_elem -> 'vehiculo' ->> 'modelo'))
      returning id into v_vehiculo;
    end if;

    if (v_elem ->> 'precio_centavos') is null or (v_elem ->> 'precio_centavos')::bigint < 0 then
      raise exception 'Revisá el precio' using errcode = '22023';
    end if;
    insert into public.items_viaje (viaje_id, cliente_id, vehiculo_id, precio_centavos, moneda)
    values (p_viaje_id, v_cliente, v_vehiculo, (v_elem ->> 'precio_centavos')::bigint, coalesce(v_moneda, 'ARS'));
    v_cambios := v_cambios + 1;
  end loop;

  -- Capacidad de la unidad y al menos un auto
  if d ? 'unidad_id' or jsonb_array_length(v_quitar) > 0 or jsonb_array_length(v_agregar) > 0 then
    select u.capacidad_autos, u.nombre into v_capacidad, v_clave
    from public.unidades u join public.viajes vi on vi.unidad_id = u.id where vi.id = p_viaje_id;
    select count(*) into v_activos from public.items_viaje where viaje_id = p_viaje_id and not cancelado;
    if v_activos = 0 then
      raise exception 'El viaje tiene que tener al menos un auto' using errcode = '22023';
    end if;
    if v_capacidad is not null and v_activos > v_capacidad then
      raise exception '% lleva hasta % autos', v_clave, v_capacidad using errcode = '22023';
    end if;
  end if;

  return jsonb_build_object('cambios', v_cambios);
end;
$$;
-- -----------------------------------------------------------------------------
-- Permisos: solo usuarios logueados
-- -----------------------------------------------------------------------------
revoke execute on function public.cobrado_item(uuid) from public, anon;
revoke execute on function public.cancelar_item(uuid, text, text) from public, anon;
revoke execute on function public.cancelar_viaje(uuid, text, text, text) from public, anon;
revoke execute on function public.usar_saldo_a_favor(uuid, jsonb) from public, anon;
revoke execute on function public.entregar_auto(uuid, date) from public, anon;
revoke execute on function public.deshacer_entrega(uuid) from public, anon;
grant  execute on function public.cobrado_item(uuid) to authenticated;
grant  execute on function public.cancelar_item(uuid, text, text) to authenticated;
grant  execute on function public.cancelar_viaje(uuid, text, text, text) to authenticated;
grant  execute on function public.usar_saldo_a_favor(uuid, jsonb) to authenticated;
grant  execute on function public.entregar_auto(uuid, date) to authenticated;
grant  execute on function public.deshacer_entrega(uuid) to authenticated;
