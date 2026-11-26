-- =============================================================================
-- Rovirosa · Sprint 4b: búsqueda de viajes para la grilla del administrativo
--   buscar_viajes(filtros): filtra, ordena, pagina y suma en la base (con RLS).
--   La misma función alimenta la pantalla y la exportación a Excel, así lo que se
--   exporta es exactamente lo que se ve.
-- Se puede volver a correr sin error.
-- =============================================================================

-- p_filtros (todas las claves son opcionales):
--   estados    ["programado", "entregado", ...]   estados del viaje (cualquiera de)
--   cobro      "con_saldo" | "vencidos" | "pagados"
--   desde      "2026-11-01"   hasta "2026-11-30"   (fecha de salida, inclusive)
--   unidad     id de unidad
--   cliente    id de cliente: el viaje tiene autos de ese cliente, y facturado y
--              saldo cuentan SOLO sus autos ("¿qué le facturé a este cliente?")
--   texto      busca en número, origen, destino, clientes, unidad y chofer
--   orden      numero | fecha_salida | ruta | unidad | autos | estado | facturado | saldo
--   dir        asc | desc
--   pagina     1, 2, ...      por_pagina  1 a 5000 (por defecto 50)
-- Devuelve: { total, totales: {facturado_ars, saldo_ars, facturado_usd, saldo_usd}, filas: [...] }
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
             s.cobrado_centavos, s.saldo_centavos, s.estado_cobro, s.vencido
      from public.v_items_saldo s
      where $6 is null or s.cliente_id = $6
    ),
    viajes_con_totales as (
      select
        v.id, v.numero, v.fecha_salida, v.origen, v.destino, v.estado,
        u.nombre as unidad, ch.nombre as chofer,
        count(a.viaje_id) filter (where a.estado_cobro <> 'cancelado')::int as autos,
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
                   'chofer', chofer, 'autos', autos, 'clientes', clientes,
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

revoke execute on function public.buscar_viajes(jsonb) from public, anon;
grant  execute on function public.buscar_viajes(jsonb) to authenticated;
