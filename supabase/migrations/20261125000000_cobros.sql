-- =============================================================================
-- Rovirosa · Sprint 2: registrar y anular cobros
--   1. "Hoy" en hora de Argentina para calcular vencidos (antes usaba UTC).
--   2. v_items_saldo suma la descripción del vehículo (al final, sin romper columnas).
--   3. Vistas de pagos y de sus aplicaciones, para la pantalla Cobros.
--   4. registrar_pago(): pago + aplicaciones en UNA transacción, sin duplicados.
--   5. anular_pago(): anula con motivo (nada se borra).
-- Todo corre con los permisos del usuario (security invoker): RLS y los triggers
-- de la fase 1 siguen protegiendo igual.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fecha de hoy en Argentina
-- -----------------------------------------------------------------------------
create or replace function public.hoy_ar()
returns date
language sql stable
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- -----------------------------------------------------------------------------
-- 2. Saldos por ítem: vencido con fecha argentina + descripción del vehículo
-- -----------------------------------------------------------------------------
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
  group by a.item_id
) cob on cob.item_id = i.id;

-- -----------------------------------------------------------------------------
-- 3. Vistas de pagos
-- -----------------------------------------------------------------------------
-- Un pago con lo aplicado y lo que queda a favor del cliente (0 si está anulado).
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
       else 0 end                            as a_favor_centavos
from public.pagos p
join public.clientes c on c.id = p.cliente_id
left join (
  select pago_id, sum(monto_centavos) as aplicado
  from public.aplicaciones_pago
  group by pago_id
) a on a.pago_id = p.id;

-- A qué viaje y cliente fue cada parte de un pago.
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
  c.nombre    as cliente_nombre
from public.aplicaciones_pago a
join public.items_viaje i on i.id = a.item_id
join public.viajes      v on v.id = i.viaje_id
join public.clientes    c on c.id = i.cliente_id;

-- -----------------------------------------------------------------------------
-- 3b. Blindaje entre empresas (corrige la fase 1)
-- -----------------------------------------------------------------------------
-- En la fase 1, si el pago o el ítem no eran visibles para el usuario (son de otra
-- empresa), las comparaciones daban NULL y la aplicación pasaba igual. Ahora se
-- rechaza: un pago solo se aplica a ítems de la misma empresa que el usuario ve.
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
  if v_pago.empresa_id is distinct from v_item.empresa_id
     or new.empresa_id is distinct from v_pago.empresa_id then
    raise exception 'El pago y el ítem son de empresas distintas';
  end if;
  if v_pago.moneda <> v_item.moneda then
    raise exception 'El pago está en % y el ítem en %', v_pago.moneda, v_item.moneda;
  end if;

  select coalesce(sum(a.monto_centavos), 0) into v_aplicado_pago
  from public.aplicaciones_pago a
  where a.pago_id = new.pago_id and a.id <> new.id;

  if v_aplicado_pago + new.monto_centavos > v_pago.monto_centavos then
    raise exception 'Se aplicaría más que el monto del pago';
  end if;

  select coalesce(sum(a.monto_centavos), 0) into v_cobrado_item
  from public.aplicaciones_pago a
  join public.pagos p on p.id = a.pago_id and p.anulado_en is null
  where a.item_id = new.item_id and a.id <> new.id;

  if v_cobrado_item + new.monto_centavos > v_item.precio_centavos then
    raise exception 'Se cobraría más que el precio del ítem';
  end if;

  return new;
end;
$$;

-- El cliente de un pago tiene que ser de la misma empresa que el pago.
create or replace function public.validar_cliente_pago()
returns trigger
language plpgsql
as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.clientes where id = new.cliente_id;
  if v_empresa is distinct from new.empresa_id then
    raise exception 'El cliente no existe';
  end if;
  return new;
end;
$$;

-- "drop if exists" hace que la migración se pueda volver a correr sin error.
drop trigger if exists trg_validar_cliente_pago on public.pagos;
create trigger trg_validar_cliente_pago
before insert on public.pagos
for each row execute function public.validar_cliente_pago();

-- -----------------------------------------------------------------------------
-- 4. Registrar un pago con sus aplicaciones, todo o nada
-- -----------------------------------------------------------------------------
-- p_id lo genera la app al abrir el formulario: si el mismo pago llega dos veces
-- (doble toque, reintento por mala señal), la segunda vez no crea otro.
-- p_aplicaciones: [{"item_id": "...", "monto_centavos": 140000000}, ...]
create or replace function public.registrar_pago(
  p_id              uuid,
  p_cliente_id      uuid,
  p_fecha           date,
  p_monto_centavos  bigint,
  p_moneda          text,
  p_medio           text  default 'transferencia',
  p_titular         text  default null,
  p_notas           text  default null,
  p_aplicaciones    jsonb default '[]'::jsonb
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

  begin
    insert into public.pagos (id, cliente_id, fecha, monto_centavos, moneda, medio, titular, notas)
    values (p_id, p_cliente_id, p_fecha, p_monto_centavos, p_moneda, p_medio,
            nullif(trim(p_titular), ''), nullif(trim(p_notas), ''));
  exception when unique_violation then
    -- Dos envíos simultáneos del mismo formulario: el otro ya lo guardó.
    return jsonb_build_object('pago_id', p_id, 'duplicado', true);
  end;

  -- Los triggers de aplicaciones_pago rechazan cobrar de más o aplicar de más;
  -- si alguno falla, se deshace también el pago.
  for v_aplicacion in select * from jsonb_array_elements(coalesce(p_aplicaciones, '[]'::jsonb))
  loop
    insert into public.aplicaciones_pago (pago_id, item_id, monto_centavos)
    values (p_id, (v_aplicacion ->> 'item_id')::uuid, (v_aplicacion ->> 'monto_centavos')::bigint);
  end loop;

  return jsonb_build_object('pago_id', p_id, 'duplicado', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Anular un pago con motivo
-- -----------------------------------------------------------------------------
create or replace function public.anular_pago(p_pago_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para anular pagos' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribí el motivo de la anulación' using errcode = '22023';
  end if;

  update public.pagos
  set anulado_en = now(), anulado_motivo = trim(p_motivo)
  where id = p_pago_id;

  if not found then
    raise exception 'No se encontró el pago' using errcode = 'P0002';
  end if;
end;
$$;

-- Solo usuarios logueados (RLS decide además de qué empresa).
revoke execute on function public.registrar_pago(uuid, uuid, date, bigint, text, text, text, text, jsonb) from public, anon;
revoke execute on function public.anular_pago(uuid, text) from public, anon;
grant  execute on function public.registrar_pago(uuid, uuid, date, bigint, text, text, text, text, jsonb) to authenticated;
grant  execute on function public.anular_pago(uuid, text) to authenticated;
