-- =============================================================================
-- Rovirosa · Métricas de cobranza
--   metricas(meses): todo lo que necesita la pantalla Métricas en una sola ida a
--   la base, calculado con los permisos del usuario (RLS: cada empresa, lo suyo).
--   No hay tablas nuevas: sale de viajes, autos, pagos y aplicaciones.
-- Se puede volver a correr sin error.
-- =============================================================================

-- Devuelve:
-- {
--   hoy, dias_vencimiento,
--   meses: [{ mes: "2026-06", facturado: {ARS, USD}, cobrado: {...}, recuperado: {...},
--             dias_cobro: 12 | null, autos_cobrados: 5 }]          (del más viejo al más nuevo)
--   antiguedad: [{ tramo: "sin_entregar" | "0_7" | "8_30" | "31_60" | "mas_60", montos: {ARS, USD}, autos }]
--   top_clientes: [{ cliente_id, nombre, saldo: {ARS, USD}, vencido: {ARS, USD} }]   (hasta 5)
--   por_cobrar: {ARS, USD}, vencido: {ARS, USD}, dias_cobro_90: 12 | null
-- }
-- "Días de cobro" de un auto: desde su entrega hasta el pago que lo completó (0 si se
-- pagó antes de entregarlo). Se cuenta en el mes en que se completó el pago.
create or replace function public.metricas(p_meses int default 6)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with
  params as (
    select least(greatest(coalesce(p_meses, 6), 1), 24) as n,
           public.hoy_ar() as hoy,
           date_trunc('month', public.hoy_ar())::date as mes_actual
  ),
  meses as (
    select (p.mes_actual - make_interval(months => g))::date as desde,
           (p.mes_actual - make_interval(months => g - 1))::date as hasta
    from params p, generate_series(0, (select n - 1 from params)) g
  ),
  items as (select * from v_items_saldo),
  facturado as (
    select m.desde, s.moneda,
           sum(case when s.estado_cobro = 'cancelado' then s.cobrado_centavos else s.precio_centavos end) as total
    from meses m
    join items s on s.fecha_salida >= m.desde and s.fecha_salida < m.hasta
    where (s.estado_cobro <> 'cancelado' and s.estado_viaje <> 'cancelado')
       or (s.estado_cobro = 'cancelado' and s.cobrado_centavos > 0)       -- seña retenida
    group by m.desde, s.moneda
  ),
  cobrado as (
    select m.desde, p.moneda, sum(p.monto_centavos) as total
    from meses m
    join pagos p on p.fecha >= m.desde and p.fecha < m.hasta
    where p.anulado_en is null
    group by m.desde, p.moneda
  ),
  recuperado as (
    select m.desde, p.moneda, sum(a.monto_centavos) as total
    from meses m
    join pagos p on p.fecha >= m.desde and p.fecha < m.hasta and p.anulado_en is null
    join aplicaciones_pago a on a.pago_id = p.id and a.desaplicado_en is null
    join items_viaje i on i.id = a.item_id
    join empresas e on e.id = i.empresa_id
    where i.fecha_entrega is not null and p.fecha > i.fecha_entrega + e.dias_vencimiento
    group by m.desde, p.moneda
  ),
  completos as (
    select s.id, s.fecha_entrega, max(p.fecha) as fecha_pago
    from items s
    join aplicaciones_pago a on a.item_id = s.id and a.desaplicado_en is null
    join pagos p on p.id = a.pago_id and p.anulado_en is null
    where s.estado_cobro = 'pagado' and s.fecha_entrega is not null and s.precio_centavos > 0
    group by s.id, s.fecha_entrega
  ),
  dias as (
    select m.desde,
           round(avg(greatest(0, c.fecha_pago - c.fecha_entrega)))::int as promedio,
           count(*)::int as autos
    from meses m
    join completos c on c.fecha_pago >= m.desde and c.fecha_pago < m.hasta
    group by m.desde
  ),
  pendientes as (
    select s.*,
           case
             when s.fecha_entrega is null then 'sin_entregar'
             when (select hoy from params) - s.fecha_entrega <= 7  then '0_7'
             when (select hoy from params) - s.fecha_entrega <= 30 then '8_30'
             when (select hoy from params) - s.fecha_entrega <= 60 then '31_60'
             else 'mas_60'
           end as tramo
    from items s
    where s.estado_cobro <> 'cancelado' and s.saldo_centavos > 0
  ),
  tramos as (
    select t.tramo, t.orden from (values ('sin_entregar', 1), ('0_7', 2), ('8_30', 3), ('31_60', 4), ('mas_60', 5)) t(tramo, orden)
  ),
  clientes as (
    select cliente_id, cliente_nombre,
           coalesce(sum(saldo_centavos) filter (where moneda = 'ARS'), 0) as ars,
           coalesce(sum(saldo_centavos) filter (where moneda = 'USD'), 0) as usd
    from pendientes
    group by cliente_id, cliente_nombre
    order by ars desc, usd desc, cliente_nombre
    limit 5
  )
  select jsonb_build_object(
    'hoy', (select hoy from params),
    'dias_vencimiento', (select dias_vencimiento from empresas where id = public.mi_empresa()),
    'meses', (
      select jsonb_agg(jsonb_build_object(
               'mes', to_char(m.desde, 'YYYY-MM'),
               'facturado', coalesce((select jsonb_object_agg(f.moneda, f.total) from facturado f where f.desde = m.desde), '{}'::jsonb),
               'cobrado', coalesce((select jsonb_object_agg(c.moneda, c.total) from cobrado c where c.desde = m.desde), '{}'::jsonb),
               'recuperado', coalesce((select jsonb_object_agg(r.moneda, r.total) from recuperado r where r.desde = m.desde), '{}'::jsonb),
               'dias_cobro', (select d.promedio from dias d where d.desde = m.desde),
               'autos_cobrados', coalesce((select d.autos from dias d where d.desde = m.desde), 0)
             ) order by m.desde)
      from meses m
    ),
    'antiguedad', (
      select jsonb_agg(jsonb_build_object(
               'tramo', t.tramo,
               'montos', coalesce((select jsonb_object_agg(x.moneda, x.total)
                                   from (select moneda, sum(saldo_centavos) as total from pendientes p
                                         where p.tramo = t.tramo group by moneda) x), '{}'::jsonb),
               'autos', (select count(*) from pendientes p where p.tramo = t.tramo)
             ) order by t.orden)
      from tramos t
    ),
    'top_clientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cliente_id', c.cliente_id,
               'nombre', c.cliente_nombre,
               'saldo', jsonb_strip_nulls(jsonb_build_object('ARS', nullif(c.ars, 0), 'USD', nullif(c.usd, 0))),
               'vencido', coalesce((select jsonb_object_agg(x.moneda, x.total)
                                    from (select moneda, sum(saldo_centavos) as total from pendientes p
                                          where p.cliente_id = c.cliente_id and p.vencido group by moneda) x), '{}'::jsonb)
             ) order by c.ars desc, c.usd desc, c.cliente_nombre)
      from clientes c
    ), '[]'::jsonb),
    'por_cobrar', coalesce((select jsonb_object_agg(moneda, total)
                            from (select moneda, sum(saldo_centavos) as total from pendientes group by moneda) x), '{}'::jsonb),
    'vencido', coalesce((select jsonb_object_agg(moneda, total)
                         from (select moneda, sum(saldo_centavos) as total from pendientes where vencido group by moneda) x), '{}'::jsonb),
    'dias_cobro_90', (select round(avg(greatest(0, c.fecha_pago - c.fecha_entrega)))::int
                      from completos c, params p where c.fecha_pago > p.hoy - 90)
  );
$$;

revoke execute on function public.metricas(int) from public, anon;
grant  execute on function public.metricas(int) to authenticated;
