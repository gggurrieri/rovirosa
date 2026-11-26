-- =============================================================================
-- Rovirosa · Sprint 6: clientes y recordatorios de cobro por WhatsApp
--   1. Datos para cobrar de cada empresa (alias, CBU, titular) y su mensaje.
--   2. Clientes activos o inactivos (nada se borra).
--   3. Recordatorios: cada "Recordar por WhatsApp" queda registrado con lo que se debía.
--   4. v_clientes: saldo, vencido, a favor y último recordatorio de cada cliente.
--   5. buscar_viajes() devuelve también cuántos autos ya se entregaron.
-- Se puede volver a correr sin error.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Datos para cobrar (los carga el dueño en Más → Datos para cobrar)
-- -----------------------------------------------------------------------------
alter table public.empresas add column if not exists datos_cobro text;
alter table public.empresas add column if not exists mensaje_recordatorio text;
alter table public.empresas drop constraint if exists empresas_datos_cobro_largo;
alter table public.empresas add constraint empresas_datos_cobro_largo
  check (length(coalesce(datos_cobro, '')) <= 500 and length(coalesce(mensaje_recordatorio, '')) <= 1000);

-- -----------------------------------------------------------------------------
-- 2. Clientes: activos o inactivos
-- -----------------------------------------------------------------------------
alter table public.clientes add column if not exists activo boolean not null default true;
alter table public.clientes drop constraint if exists clientes_nombre_largo;
alter table public.clientes add constraint clientes_nombre_largo
  check (length(trim(nombre)) between 1 and 120 and length(coalesce(whatsapp, '')) <= 20);

-- -----------------------------------------------------------------------------
-- 3. Recordatorios de cobro
-- -----------------------------------------------------------------------------
create table if not exists public.recordatorios (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null default public.mi_empresa() references public.empresas (id),
  cliente_id   uuid not null references public.clientes (id),
  enviado_por  uuid default auth.uid(),
  enviado_en   timestamptz not null default now(),
  -- Lo que se debía al mandarlo (foto del momento, para el historial)
  saldo_ars    bigint not null default 0,
  saldo_usd    bigint not null default 0,
  autos        int not null default 0
);
create index if not exists recordatorios_cliente on public.recordatorios (cliente_id, enviado_en desc);

alter table public.recordatorios enable row level security;
drop policy if exists recordatorios_select on public.recordatorios;
create policy recordatorios_select on public.recordatorios for select to authenticated
  using (empresa_id = public.mi_empresa() and public.puedo_editar());
drop policy if exists recordatorios_insert on public.recordatorios;
create policy recordatorios_insert on public.recordatorios for insert to authenticated
  with check (empresa_id = public.mi_empresa() and public.puedo_editar());

create or replace function public.blindar_recordatorio()
returns trigger
language plpgsql
as $$
begin
  perform public.verificar_misma_empresa('public.clientes', new.cliente_id, new.empresa_id, 'El cliente');
  return new;
end;
$$;
drop trigger if exists trg_blindar_recordatorio on public.recordatorios;
create trigger trg_blindar_recordatorio
before insert on public.recordatorios
for each row execute function public.blindar_recordatorio();

drop trigger if exists trg_aud_recordatorios on public.recordatorios;
create trigger trg_aud_recordatorios
after insert on public.recordatorios
for each row execute function public.registrar_auditoria();

-- Registra el recordatorio con lo que el cliente debe AHORA. Devuelve lo necesario
-- para armar el mensaje (la app no confía en montos que vengan del navegador).
create or replace function public.registrar_recordatorio(p_cliente_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cliente public.clientes%rowtype;
  v_ars     bigint;
  v_usd     bigint;
  v_autos   int;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para mandar recordatorios' using errcode = '42501';
  end if;
  select * into v_cliente from public.clientes where id = p_cliente_id;
  if not found then
    raise exception 'No se encontró el cliente' using errcode = 'P0002';
  end if;
  if nullif(trim(coalesce(v_cliente.whatsapp, '')), '') is null then
    raise exception 'Cargá el WhatsApp del cliente' using errcode = '22023';
  end if;
  select coalesce(sum(saldo_centavos) filter (where moneda = 'ARS'), 0),
         coalesce(sum(saldo_centavos) filter (where moneda = 'USD'), 0),
         count(*)
  into v_ars, v_usd, v_autos
  from public.v_items_saldo
  where cliente_id = p_cliente_id and estado_cobro <> 'cancelado' and saldo_centavos > 0;
  if v_autos = 0 then
    raise exception 'El cliente no debe nada' using errcode = '22023';
  end if;

  insert into public.recordatorios (cliente_id, saldo_ars, saldo_usd, autos)
  values (p_cliente_id, v_ars, v_usd, v_autos);

  return jsonb_build_object(
    'cliente', v_cliente.nombre,
    'whatsapp', v_cliente.whatsapp,
    'empresa', (select nombre from public.empresas where id = v_cliente.empresa_id),
    'datos_cobro', (select datos_cobro from public.empresas where id = v_cliente.empresa_id),
    'mensaje', (select mensaje_recordatorio from public.empresas where id = v_cliente.empresa_id),
    'autos', (select jsonb_agg(jsonb_build_object(
                'vehiculo', vehiculo, 'origen', origen, 'destino', destino,
                'fecha_entrega', fecha_entrega, 'moneda', moneda, 'saldo', saldo_centavos)
                order by fecha_salida, viaje_numero)
              from public.v_items_saldo
              where cliente_id = p_cliente_id and estado_cobro <> 'cancelado' and saldo_centavos > 0)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Clientes con sus saldos
-- -----------------------------------------------------------------------------
create or replace view public.v_clientes
with (security_invoker = true)
as
select
  c.id,
  c.empresa_id,
  c.nombre,
  c.tipo,
  c.whatsapp,
  c.email,
  c.ciudad,
  c.notas,
  c.activo,
  c.creado_en,
  coalesce(s.saldo_ars, 0)    as saldo_ars,
  coalesce(s.saldo_usd, 0)    as saldo_usd,
  coalesce(s.vencido_ars, 0)  as vencido_ars,
  coalesce(s.vencido_usd, 0)  as vencido_usd,
  coalesce(s.autos_debe, 0)   as autos_debe,
  coalesce(f.a_favor_ars, 0)  as a_favor_ars,
  coalesce(f.a_favor_usd, 0)  as a_favor_usd,
  coalesce(s.viajes, 0)       as viajes,
  s.ultimo_viaje,
  r.ultimo_recordatorio
from public.clientes c
left join (
  select cliente_id,
         sum(saldo_centavos) filter (where moneda = 'ARS' and estado_cobro <> 'cancelado' and saldo_centavos > 0) as saldo_ars,
         sum(saldo_centavos) filter (where moneda = 'USD' and estado_cobro <> 'cancelado' and saldo_centavos > 0) as saldo_usd,
         sum(saldo_centavos) filter (where moneda = 'ARS' and vencido) as vencido_ars,
         sum(saldo_centavos) filter (where moneda = 'USD' and vencido) as vencido_usd,
         count(*) filter (where estado_cobro <> 'cancelado' and saldo_centavos > 0) as autos_debe,
         count(distinct viaje_id) filter (where estado_viaje <> 'cancelado') as viajes,
         max(fecha_salida) filter (where estado_viaje <> 'cancelado') as ultimo_viaje
  from public.v_items_saldo
  group by cliente_id
) s on s.cliente_id = c.id
left join (
  select cliente_id,
         sum(a_favor_centavos) filter (where moneda = 'ARS') as a_favor_ars,
         sum(a_favor_centavos) filter (where moneda = 'USD') as a_favor_usd
  from public.v_pagos
  group by cliente_id
) f on f.cliente_id = c.id
left join (
  select cliente_id, max(enviado_en) as ultimo_recordatorio
  from public.recordatorios
  group by cliente_id
) r on r.cliente_id = c.id;

-- -----------------------------------------------------------------------------
-- 5. Grilla de viajes: cuántos autos se entregaron
-- -----------------------------------------------------------------------------
create or replace function public.buscar_viajes(p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_filtros    jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_estados    text[] := array(select jsonb_array_elements_text(coalesce(v_filtros -> 'estados', '[]'::jsonb)));
  v_cobro      text := nullif(v_filtros ->> 'cobro', '');
  v_desde      date := nullif(v_filtros ->> 'desde', '')::date;
  v_hasta      date := nullif(v_filtros ->> 'hasta', '')::date;
  v_unidad     uuid := nullif(v_filtros ->> 'unidad', '')::uuid;
  v_cliente    uuid := nullif(v_filtros ->> 'cliente', '')::uuid;
  v_texto      text := nullif(trim(v_filtros ->> 'texto'), '');
  v_por_pagina int := least(greatest(coalesce(nullif(v_filtros ->> 'por_pagina', '')::int, 50), 1), 5000);
  v_pagina     int := greatest(coalesce(nullif(v_filtros ->> 'pagina', '')::int, 1), 1);
  v_dir        text := case when lower(coalesce(v_filtros ->> 'dir', 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_orden      text;
  v_resultado  jsonb;
begin
  -- Solo columnas conocidas: el orden nunca arma SQL con texto del usuario.
  v_orden := case coalesce(v_filtros ->> 'orden', 'fecha_salida')
    when 'numero'    then 'numero'
    when 'ruta'      then 'origen %1$s, destino'
    when 'unidad'    then 'unidad'
    when 'autos'     then 'autos'
    when 'estado'    then 'estado'
    when 'facturado' then 'facturado_ars'
    when 'saldo'     then 'saldo_ars'
    else 'fecha_salida'
  end;
  v_orden := format(v_orden || ' %1$s nulls last, numero %1$s', v_dir);

  if v_desde is not null and v_hasta is not null and v_desde > v_hasta then
    select v_hasta, v_desde into v_desde, v_hasta;
  end if;
  if v_texto is not null then
    v_texto := '%' || replace(replace(replace(v_texto, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  execute format($q$
    with autos as (
      select s.viaje_id, s.cliente_id, s.cliente_nombre, s.moneda, s.precio_centavos,
             s.cobrado_centavos, s.saldo_centavos, s.estado_cobro, s.vencido, s.fecha_entrega
      from public.v_items_saldo s
      where $6 is null or s.cliente_id = $6
    ),
    viajes_con_totales as (
      select
        v.id, v.numero, v.fecha_salida, v.origen, v.destino, v.estado,
        u.nombre as unidad, ch.nombre as chofer,
        count(a.viaje_id) filter (where a.estado_cobro <> 'cancelado')::int as autos,
        count(a.viaje_id) filter (where a.estado_cobro <> 'cancelado' and a.fecha_entrega is not null)::int as entregados,
        string_agg(distinct a.cliente_nombre, ', ') as clientes,
        coalesce(sum(a.precio_centavos) filter (where a.estado_cobro <> 'cancelado' and a.moneda = 'ARS'), 0) as facturado_ars,
        coalesce(sum(greatest(a.saldo_centavos, 0)) filter (where a.estado_cobro <> 'cancelado' and a.moneda = 'ARS'), 0) as saldo_ars,
        coalesce(sum(a.precio_centavos) filter (where a.estado_cobro <> 'cancelado' and a.moneda = 'USD'), 0) as facturado_usd,
        coalesce(sum(greatest(a.saldo_centavos, 0)) filter (where a.estado_cobro <> 'cancelado' and a.moneda = 'USD'), 0) as saldo_usd,
        coalesce(bool_or(a.vencido), false) as vencido,
        coalesce(sum(a.cobrado_centavos) filter (where a.estado_cobro <> 'cancelado'), 0) as cobrado
      from public.viajes v
      left join public.unidades u  on u.id = v.unidad_id
      left join public.choferes ch on ch.id = v.chofer_id
      left join autos a on a.viaje_id = v.id
      where (cardinality($1::text[]) = 0 or v.estado = any($1))
        and ($3::date is null or v.fecha_salida >= $3)
        and ($4::date is null or v.fecha_salida <= $4)
        and ($5::uuid is null or v.unidad_id = $5)
      group by v.id, u.nombre, ch.nombre
      having $6::uuid is null or count(a.viaje_id) > 0
    ),
    con_cobro as (
      select *,
        case
          when estado = 'cancelado' then 'cancelado'
          when autos = 0 then 'sin_autos'
          when saldo_ars + saldo_usd = 0 then 'pagado'
          when vencido then 'vencido'
          when cobrado > 0 then 'parcial'
          else 'pendiente'
        end as cobro
      from viajes_con_totales
    ),
    filtradas as (
      select * from con_cobro
      where ($2::text is null
             or ($2 = 'con_saldo' and saldo_ars + saldo_usd > 0)
             or ($2 = 'vencidos'  and vencido and saldo_ars + saldo_usd > 0)
             or ($2 = 'pagados'   and cobro = 'pagado'))
        and ($7::text is null
             or numero::text ilike $7 or origen ilike $7 or destino ilike $7
             or clientes ilike $7 or unidad ilike $7 or chofer ilike $7)
    ),
    pagina as (
      select row_number() over (order by %s) as fila, *
      from filtradas
    )
    select jsonb_build_object(
      'total', (select count(*) from filtradas),
      'totales', (select jsonb_build_object(
          'facturado_ars', coalesce(sum(facturado_ars) filter (where estado <> 'cancelado'), 0),
          'saldo_ars',     coalesce(sum(saldo_ars)     filter (where estado <> 'cancelado'), 0),
          'facturado_usd', coalesce(sum(facturado_usd) filter (where estado <> 'cancelado'), 0),
          'saldo_usd',     coalesce(sum(saldo_usd)     filter (where estado <> 'cancelado'), 0))
        from filtradas),
      'filas', coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id', id, 'numero', numero, 'fecha_salida', fecha_salida, 'origen', origen,
                   'destino', destino, 'estado', estado, 'cobro', cobro, 'unidad', unidad,
                   'chofer', chofer, 'autos', autos, 'entregados', entregados, 'clientes', clientes,
                   'facturado_ars', facturado_ars, 'saldo_ars', saldo_ars,
                   'facturado_usd', facturado_usd, 'saldo_usd', saldo_usd)
                 order by fila)
        from pagina
        where fila > $8 and fila <= $8 + $9
      ), '[]'::jsonb)
    )
  $q$, v_orden)
  into v_resultado
  using v_estados, v_cobro, v_desde, v_hasta, v_unidad, v_cliente, v_texto,
        (v_pagina - 1) * v_por_pagina, v_por_pagina;

  return v_resultado;
end;
$$;

revoke execute on function public.registrar_recordatorio(uuid) from public, anon;
grant  execute on function public.registrar_recordatorio(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Guardar ficha de cliente y datos para cobrar (con los permisos del usuario)
-- -----------------------------------------------------------------------------
create or replace function public.guardar_cliente(
  p_id uuid, p_nombre text, p_tipo text, p_whatsapp text, p_email text, p_ciudad text, p_notas text, p_activo boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para editar clientes' using errcode = '42501';
  end if;
  update public.clientes
  set nombre = trim(p_nombre), tipo = p_tipo, whatsapp = nullif(trim(p_whatsapp), ''), email = nullif(trim(p_email), ''),
      ciudad = nullif(trim(p_ciudad), ''), notas = nullif(trim(p_notas), ''), activo = coalesce(p_activo, true)
  where id = p_id;
  if not found then
    raise exception 'No se encontró el cliente' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.guardar_datos_cobro(p_datos text, p_mensaje text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(public.mi_rol(), '') <> 'dueno' then
    raise exception 'Solo el dueño puede cambiar los datos para cobrar' using errcode = '42501';
  end if;
  update public.empresas
  set datos_cobro = nullif(trim(p_datos), ''), mensaje_recordatorio = nullif(trim(p_mensaje), '')
  where id = public.mi_empresa();
end;
$$;

revoke execute on function public.guardar_cliente(uuid, text, text, text, text, text, text, boolean) from public, anon;
revoke execute on function public.guardar_datos_cobro(text, text) from public, anon;
grant  execute on function public.guardar_cliente(uuid, text, text, text, text, text, text, boolean) to authenticated;
grant  execute on function public.guardar_datos_cobro(text, text) to authenticated;
