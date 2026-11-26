-- Pruebas de metricas(). Base con: stub_supabase.sql → stub_storage.sql → migraciones →
-- seed.sql → reloj fijo (hoy = 25/11/2026). Cada bloque muestra "OK: ..." o corta con "FALLA: ...".
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'dueno@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'otra@empresa.com')
on conflict do nothing;
insert into public.empresas (id, nombre) values ('00000000-0000-4000-8000-000000000002', 'Otra transportista')
on conflict do nothing;
insert into public.perfiles (user_id, empresa_id, nombre, rol) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Dueño demo', 'dueno'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Otra', 'dueno')
on conflict do nothing;

create function pg_temp.m(p int default 6) returns jsonb language sql as $$ select public.metricas(p) $$;
create function pg_temp.mes(p text) returns jsonb language sql as $$
  select x from jsonb_array_elements(public.metricas(6) -> 'meses') x where x ->> 'mes' = p $$;
create function pg_temp.tramo(p text) returns bigint language sql as $$
  select coalesce((x -> 'montos' ->> 'ARS')::bigint, 0) from jsonb_array_elements(public.metricas(6) -> 'antiguedad') x where x ->> 'tramo' = p $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

do $$ declare n jsonb := pg_temp.mes('2026-11'); begin
  if jsonb_array_length(pg_temp.m() -> 'meses') <> 6 or pg_temp.m() -> 'meses' -> 0 ->> 'mes' <> '2026-06' or pg_temp.m() -> 'meses' -> 5 ->> 'mes' <> '2026-11' then
    raise exception 'FALLA 1: meses %', pg_temp.m() -> 'meses';
  end if;
  if (n -> 'facturado' ->> 'ARS')::bigint <> 2225000000 or (n -> 'cobrado' ->> 'ARS')::bigint <> 1355000000 or n -> 'recuperado' <> '{}'::jsonb then
    raise exception 'FALLA 1: noviembre %', n;
  end if;
  if pg_temp.mes('2026-10') -> 'facturado' <> '{}'::jsonb then raise exception 'FALLA 1: octubre no está vacío'; end if;
  raise notice 'OK 1: 6 meses (jun → nov); noviembre del seed: $ 22.250.000 facturado, $ 13.550.000 cobrado, $ 0 recuperado';
end $$;

do $$ declare suma bigint; esperado bigint; begin
  select sum(coalesce((x -> 'montos' ->> 'ARS')::bigint, 0)) into suma from jsonb_array_elements(pg_temp.m() -> 'antiguedad') x;
  if suma <> 870000000 or (pg_temp.m() -> 'por_cobrar' ->> 'ARS')::bigint <> 870000000 then raise exception 'FALLA 2: suma %', suma; end if;
  -- Cada tramo contra una cuenta hecha a mano
  select coalesce(sum(saldo_centavos), 0) into esperado from public.v_items_saldo
  where estado_cobro <> 'cancelado' and saldo_centavos > 0 and fecha_entrega is not null and public.hoy_ar() - fecha_entrega between 8 and 30;
  if pg_temp.tramo('8_30') <> esperado then raise exception 'FALLA 2: 8 a 30 días % (esperado %)', pg_temp.tramo('8_30'), esperado; end if;
  select coalesce(sum(saldo_centavos), 0) into esperado from public.v_items_saldo
  where estado_cobro <> 'cancelado' and saldo_centavos > 0 and fecha_entrega is null;
  if pg_temp.tramo('sin_entregar') <> esperado then raise exception 'FALLA 2: sin entregar'; end if;
  if jsonb_array_length(pg_temp.m() -> 'antiguedad') <> 5 then raise exception 'FALLA 2: tramos'; end if;
  raise notice 'OK 2: antigüedad de la deuda en 5 tramos; suman los $ 8.700.000 por cobrar y cada tramo coincide con la cuenta a mano';
end $$;

do $$ declare t jsonb := pg_temp.m() -> 'top_clientes'; begin
  if jsonb_array_length(t) > 5 or t -> 0 ->> 'nombre' <> 'Autos del Sur SA (ficticia)' or (t -> 0 -> 'saldo' ->> 'ARS')::bigint <> 320000000 then
    raise exception 'FALLA 3: %', t;
  end if;
  if (t -> 1 -> 'saldo' ->> 'ARS')::bigint > (t -> 0 -> 'saldo' ->> 'ARS')::bigint then raise exception 'FALLA 3: orden'; end if;
  if (t -> 1 ->> 'nombre') <> 'Concesionaria Norte (ficticia)' or (t -> 1 -> 'vencido' ->> 'ARS')::bigint <> 270000000 then
    raise exception 'FALLA 3: vencido de Norte %', t -> 1;
  end if;
  raise notice 'OK 3: top 5 de deuda: primero Autos del Sur ($ 3.200.000); Concesionaria Norte con $ 2.700.000 vencido';
end $$;

-- Un pago a un auto vencido suma recuperado y días de cobro
do $$ declare
  item uuid := (select id from public.v_items_saldo where vencido order by fecha_entrega limit 1);
  saldo bigint := (select saldo_centavos from public.v_items_saldo where vencido order by fecha_entrega limit 1);
  esperado int;
begin
  perform public.registrar_pago(gen_random_uuid(), (select cliente_id from public.items_viaje where id = item), public.hoy_ar(), saldo, 'ARS',
    p_aplicaciones => jsonb_build_array(jsonb_build_object('item_id', item, 'monto_centavos', saldo)));
  if (pg_temp.mes('2026-11') -> 'recuperado' ->> 'ARS')::bigint <> saldo then raise exception 'FALLA 4: recuperado %', pg_temp.mes('2026-11'); end if;
  -- Días de cobro: promedio de (último pago − entrega), contado a mano
  select round(avg(greatest(0, f - fecha_entrega)))::int into esperado
  from (select s.id, s.fecha_entrega, max(p.fecha) as f from public.v_items_saldo s
        join public.aplicaciones_pago a on a.item_id = s.id and a.desaplicado_en is null
        join public.pagos p on p.id = a.pago_id and p.anulado_en is null
        where s.estado_cobro = 'pagado' and s.fecha_entrega is not null and s.precio_centavos > 0
        group by s.id, s.fecha_entrega having max(p.fecha) >= date '2026-11-01') x;
  if (pg_temp.mes('2026-11') ->> 'dias_cobro')::int is distinct from esperado or (pg_temp.m() ->> 'dias_cobro_90')::int is distinct from esperado then
    raise exception 'FALLA 4: días de cobro % (esperado %)', pg_temp.mes('2026-11') ->> 'dias_cobro', esperado;
  end if;
  if pg_temp.tramo('8_30') <> 270000000 - saldo then raise exception 'FALLA 4: la antigüedad no bajó'; end if;
  raise notice 'OK 4: pagar un auto vencido suma recuperado (%), baja la antigüedad y recalcula los días de cobro (% días)', saldo, esperado;
end $$;

do $$ begin
  if jsonb_array_length(pg_temp.m(0) -> 'meses') <> 1 or jsonb_array_length(pg_temp.m(100) -> 'meses') <> 24 then raise exception 'FALLA 5'; end if;
  raise notice 'OK 5: la cantidad de meses queda entre 1 y 24';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
do $$ begin
  if pg_temp.mes('2026-11') -> 'facturado' <> '{}'::jsonb or pg_temp.m() -> 'por_cobrar' <> '{}'::jsonb
     or pg_temp.m() -> 'top_clientes' <> '[]'::jsonb or pg_temp.tramo('8_30') <> 0 then
    raise exception 'FALLA 6: otra empresa ve datos de Rovirosa';
  end if;
  raise notice 'OK 6: otra empresa no ve métricas de Rovirosa';
end $$;
