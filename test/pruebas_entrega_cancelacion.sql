-- Pruebas del sprint 5b: entrega por auto, cancelar con anticipo y usar saldo a favor.
-- Base con: stub_supabase.sql → stub_storage.sql → migraciones → seed.sql → reloj fijo (hoy = 25/11/2026)
-- Cada bloque muestra "OK: ..." o corta con "FALLA: ...".
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

create temp table r as
select (select id from public.unidades where nombre = 'Mosquito 1')     as mosquito1,
       (select id from public.clientes where nombre like 'Juan Pérez%') as juan;
grant select on r to authenticated;

create function pg_temp.espera_error(p_sql text, p_mensaje text, p_caso text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALLA %: no dio error (esperaba "%")', p_caso, p_mensaje;
exception when others then
  if sqlerrm like 'FALLA%' then raise; end if;
  if sqlerrm not like p_mensaje || '%' then
    raise exception 'FALLA %: rechazó por otro motivo: "%" (esperaba "%")', p_caso, sqlerrm, p_mensaje;
  end if;
end $$;
-- Viaje programado de Juan en Mosquito 1 con autos de $ 1.000.000 (marcas A1, A2, ...).
create function pg_temp.viaje(p_id uuid, p_autos int, p_salida date) returns void language sql as $$
  select public.crear_viaje(p_id, p_salida, null, 'Buenos Aires', 'Rosario', null, 'ARS', (select mosquito1 from r), null, null,
    (select jsonb_agg(jsonb_build_object('cliente_id', (select juan from r),
       'vehiculo', jsonb_build_object('marca', 'A' || n, 'modelo', left(p_id::text, 8)), 'precio_centavos', 100000000))
     from generate_series(1, p_autos) n)) $$;
create function pg_temp.auto(p_viaje uuid, p_n int) returns uuid language sql as $$
  select i.id from public.items_viaje i join public.vehiculos v on v.id = i.vehiculo_id
  where i.viaje_id = p_viaje and v.marca = 'A' || p_n $$;
create function pg_temp.pagar(p_pago uuid, p_monto bigint, p_item uuid, p_aplicado bigint) returns void language sql as $$
  select public.registrar_pago(p_pago, (select juan from r), public.hoy_ar(), p_monto, 'ARS',
    p_aplicaciones => jsonb_build_array(jsonb_build_object('item_id', p_item, 'monto_centavos', p_aplicado))) $$;
create function pg_temp.a_favor(p_pago uuid) returns bigint language sql as $$
  select a_favor_centavos from public.v_pagos where id = p_pago $$;
create function pg_temp.facturado() returns bigint language sql as $$
  select (m ->> 'facturado')::bigint from jsonb_array_elements(public.resultados_mes(2026, 11) -> 'montos') m where m ->> 'moneda' = 'ARS' $$;
create function pg_temp.por_cobrar() returns bigint language sql as
$$ select coalesce(sum(saldo_centavos) filter (where estado_cobro <> 'cancelado'), 0) from public.v_items_saldo $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Entrega por auto
-- ---------------------------------------------------------------------------
select pg_temp.viaje('66666666-0000-4000-8000-000000000001', 3, public.hoy_ar() - 10);

do $$ declare v uuid := '66666666-0000-4000-8000-000000000001'; begin
  perform pg_temp.espera_error(format('select public.entregar_auto(%L)', pg_temp.auto(v, 1)), 'Marcá el viaje "En viaje"', '1');
  perform public.cambiar_estado_viaje(v, 'programado', 'en_viaje');
  perform public.entregar_auto(pg_temp.auto(v, 1), public.hoy_ar() - 9);
  if (select estado from public.viajes where id = v) <> 'en_viaje' then raise exception 'FALLA 1: el viaje cambió'; end if;
  if not (select vencido from public.v_items_saldo where id = pg_temp.auto(v, 1)) or (select vencido from public.v_items_saldo where id = pg_temp.auto(v, 2)) then
    raise exception 'FALLA 1: vencido por auto';
  end if;
  raise notice 'OK 1: entregar un auto deja el viaje En viaje; ese auto vence por su fecha (hace 9 días) y los otros no';
end $$;

do $$ declare v uuid := '66666666-0000-4000-8000-000000000001'; begin
  perform pg_temp.espera_error(format('select public.entregar_auto(%L, public.hoy_ar() + 1)', pg_temp.auto(v, 2)), 'La fecha de entrega no puede ser posterior a hoy', '2');
  perform pg_temp.espera_error(format('select public.entregar_auto(%L, public.hoy_ar() - 11)', pg_temp.auto(v, 2)), 'La fecha de entrega no puede ser antes de la salida', '2b');
  perform pg_temp.espera_error(format('select public.entregar_auto(%L)', pg_temp.auto(v, 1)), 'El auto ya estaba entregado', '2c');
  raise notice 'OK 2: rechaza fechas futuras, anteriores a la salida y entregar dos veces';
end $$;

do $$ declare v uuid := '66666666-0000-4000-8000-000000000001'; begin
  perform public.cambiar_estado_viaje(v, 'en_viaje', 'entregado');
  if (select fecha_entrega from public.items_viaje where id = pg_temp.auto(v, 1)) <> public.hoy_ar() - 9
     or (select fecha_entrega from public.items_viaje where id = pg_temp.auto(v, 2)) <> public.hoy_ar() then
    raise exception 'FALLA 3: "Terminó" pisó la fecha de un auto ya entregado';
  end if;
  -- Cada llamada va sola: dentro de un mismo "if" Postgres no garantiza el orden.
  perform public.deshacer_entrega(pg_temp.auto(v, 2));
  if (select estado from public.viajes where id = v) <> 'en_viaje'
     or (select fecha_entrega from public.items_viaje where id = pg_temp.auto(v, 1)) is null
     or (select fecha_entrega from public.items_viaje where id = pg_temp.auto(v, 2)) is not null then
    raise exception 'FALLA 3: deshacer';
  end if;
  perform public.entregar_auto(pg_temp.auto(v, 2));
  if (select estado from public.viajes where id = v) <> 'entregado' then
    raise exception 'FALLA 3: con el último auto el viaje no pasó a Entregado';
  end if;
  raise notice 'OK 3: "Terminó" respeta las fechas ya cargadas; deshacer un auto vuelve el viaje a En viaje; con el último, Entregado solo';
end $$;

-- ---------------------------------------------------------------------------
-- Cancelar con anticipo
-- ---------------------------------------------------------------------------
select pg_temp.viaje('66666666-0000-4000-8000-000000000002', 2, public.hoy_ar() + 3);
select pg_temp.pagar('77777777-0000-4000-8000-000000000002', 50000000, pg_temp.auto('66666666-0000-4000-8000-000000000002', 1), 30000000);

do $$ declare v uuid := '66666666-0000-4000-8000-000000000002'; begin
  perform pg_temp.espera_error(format($q$select public.cambiar_estado_viaje(%L, 'programado', 'cancelado')$q$, v), 'El viaje tiene pagos', '4');
  perform pg_temp.espera_error(format($q$select public.cancelar_viaje(%L, 'programado')$q$, v), 'El auto tiene pagos: elegí si lo cobrado queda como seña', '4b');
  perform pg_temp.espera_error(format($q$select public.cancelar_viaje(%L, 'programado', 'sena', '  ')$q$, v), 'Escribí el motivo de la cancelación', '4c');
  perform pg_temp.espera_error(format($q$select public.cancelar_viaje(%L, 'programado', 'regalo', 'x')$q$, v), 'El auto tiene pagos: elegí', '4d');
  if (select estado from public.viajes where id = v) <> 'programado' then raise exception 'FALLA 4: quedó a medias'; end if;
  raise notice 'OK 4: con pagos no se cancela sin elegir seña o a favor y sin motivo (y no queda nada a medias)';
end $$;

do $$ declare
  v uuid := '66666666-0000-4000-8000-000000000002';
  fact bigint := pg_temp.facturado();
  cobrar bigint := pg_temp.por_cobrar();
  s public.v_items_saldo%rowtype;
begin
  perform public.cancelar_viaje(v, 'programado', 'sena', 'El cliente desistió');
  select * into s from public.v_items_saldo where id = pg_temp.auto(v, 1);
  if s.estado_cobro <> 'cancelado' or s.precio_centavos <> 30000000 or s.cobrado_centavos <> 30000000 or s.saldo_centavos <> 0 then
    raise exception 'FALLA 5: auto con seña %', row_to_json(s);
  end if;
  if (select estado from public.viajes where id = v) <> 'cancelado' then raise exception 'FALLA 5: viaje'; end if;
  if pg_temp.por_cobrar() <> cobrar - 170000000 then raise exception 'FALLA 5: por cobrar % (antes %)', pg_temp.por_cobrar(), cobrar; end if;
  if pg_temp.facturado() <> fact - 170000000 then raise exception 'FALLA 5: facturado % (antes %)', pg_temp.facturado(), fact; end if;
  if pg_temp.a_favor('77777777-0000-4000-8000-000000000002') <> 20000000 then raise exception 'FALLA 5: a favor'; end if;
  if not exists (select 1 from public.auditoria where tabla = 'viajes' and registro_id = v and motivo = 'El cliente desistió') then
    raise exception 'FALLA 5: auditoría';
  end if;
  raise notice 'OK 5: seña → el auto se queda con $ 300.000 (facturado y cobrado), sale $ 1.700.000 de por cobrar; motivo en auditoría';
end $$;

select pg_temp.viaje('66666666-0000-4000-8000-000000000003', 2, public.hoy_ar() + 3);
select pg_temp.pagar('77777777-0000-4000-8000-000000000003', 50000000, pg_temp.auto('66666666-0000-4000-8000-000000000003', 1), 30000000);

do $$ declare
  v uuid := '66666666-0000-4000-8000-000000000003';
  fact bigint := pg_temp.facturado();
  ap public.aplicaciones_pago%rowtype;
begin
  perform public.cancelar_viaje(v, 'programado', 'a_favor', 'Se reprograma para enero');
  select * into ap from public.aplicaciones_pago where pago_id = '77777777-0000-4000-8000-000000000003';
  if ap.desaplicado_en is null or ap.desaplicado_motivo <> 'Se reprograma para enero' or ap.desaplicado_por <> 'aaaaaaaa-0000-4000-8000-000000000001' then
    raise exception 'FALLA 6: desaplicación %', row_to_json(ap);
  end if;
  if pg_temp.a_favor('77777777-0000-4000-8000-000000000003') <> 50000000 then raise exception 'FALLA 6: a favor'; end if;
  if (select cobrado_centavos from public.v_items_saldo where id = pg_temp.auto(v, 1)) <> 0 then raise exception 'FALLA 6: cobrado'; end if;
  if pg_temp.facturado() <> fact - 200000000 then raise exception 'FALLA 6: facturado'; end if;
  perform pg_temp.espera_error(format('update public.aplicaciones_pago set monto_centavos = 1 where id = %L', ap.id), 'Una aplicación de pago no se edita', '6b');
  perform pg_temp.espera_error(format($q$update public.aplicaciones_pago set desaplicado_motivo = 'otra' where id = %L$q$, ap.id), 'La aplicación ya estaba desaplicada', '6c');
  raise notice 'OK 6: a favor → la aplicación queda desaplicada (quién, cuándo, motivo) y el cliente tiene los $ 500.000 a favor; no se edita ni se repite';
end $$;

-- Usar el saldo a favor en otro viaje del cliente
select pg_temp.viaje('66666666-0000-4000-8000-000000000004', 1, public.hoy_ar() + 7);

do $$ declare
  p uuid := '77777777-0000-4000-8000-000000000003';
  nuevo uuid := pg_temp.auto('66666666-0000-4000-8000-000000000004', 1);
begin
  perform public.editar_viaje('66666666-0000-4000-8000-000000000004', public.version_viaje('66666666-0000-4000-8000-000000000004'),
    jsonb_build_object('precios', jsonb_build_array(jsonb_build_object('item_id', nuevo, 'precio_centavos', 40000000))));
  perform public.usar_saldo_a_favor(p, jsonb_build_array(jsonb_build_object('item_id', nuevo, 'monto_centavos', 40000000)));
  if (select estado_cobro from public.v_items_saldo where id = nuevo) <> 'pagado' or pg_temp.a_favor(p) <> 10000000 then
    raise exception 'FALLA 7: aplicar';
  end if;
  perform pg_temp.espera_error(format($q$select public.usar_saldo_a_favor(%L, jsonb_build_array(jsonb_build_object('item_id', %L, 'monto_centavos', 20000000)))$q$,
    p, pg_temp.auto('66666666-0000-4000-8000-000000000001', 1)), 'Se aplicaría más que el monto del pago', '7b');
  perform pg_temp.espera_error(format($q$select public.usar_saldo_a_favor(%L, jsonb_build_array(jsonb_build_object('item_id', %L, 'monto_centavos', 100)))$q$,
    p, pg_temp.auto('66666666-0000-4000-8000-000000000003', 2)), 'El auto está cancelado', '7c');
  -- Sube el precio y se vuelve a usar el mismo pago en el mismo auto
  perform public.editar_viaje('66666666-0000-4000-8000-000000000004', public.version_viaje('66666666-0000-4000-8000-000000000004'),
    jsonb_build_object('precios', jsonb_build_array(jsonb_build_object('item_id', nuevo, 'precio_centavos', 45000000))));
  perform public.usar_saldo_a_favor(p, jsonb_build_array(jsonb_build_object('item_id', nuevo, 'monto_centavos', 5000000)));
  if pg_temp.a_favor(p) <> 5000000 or (select saldo_centavos from public.v_items_saldo where id = nuevo) <> 0 then raise exception 'FALLA 7d'; end if;
  raise notice 'OK 7: el saldo a favor se usa en otro viaje (también dos veces en el mismo auto si subió el precio); no más que lo disponible ni en autos cancelados';
end $$;

-- Editar viaje: quitar un auto con pagos
select pg_temp.viaje('66666666-0000-4000-8000-000000000005', 2, public.hoy_ar() + 3);
select pg_temp.pagar('77777777-0000-4000-8000-000000000005', 10000000, pg_temp.auto('66666666-0000-4000-8000-000000000005', 1), 10000000);

do $$ declare v uuid := '66666666-0000-4000-8000-000000000005'; a uuid := pg_temp.auto('66666666-0000-4000-8000-000000000005', 1); begin
  perform pg_temp.espera_error(format($q$select public.editar_viaje(%L, public.version_viaje(%L), jsonb_build_object('quitar', jsonb_build_array(jsonb_build_object('item_id', %L::text, 'anticipo', 'a_favor'))))$q$, v, v, a),
    'Escribí el motivo de la cancelación', '8');
  perform public.editar_viaje(v, public.version_viaje(v),
    jsonb_build_object('quitar', jsonb_build_array(jsonb_build_object('item_id', a, 'anticipo', 'a_favor'))), 'Ese auto no viaja');
  if not (select cancelado from public.items_viaje where id = a) or pg_temp.a_favor('77777777-0000-4000-8000-000000000005') <> 10000000 then
    raise exception 'FALLA 8: quitar con pagos';
  end if;
  raise notice 'OK 8: Editar viaje quita un auto con pagos (a favor, con motivo)';
end $$;

-- Anular un pago que sostenía una seña: no se cuenta dos veces
do $$ declare fact bigint := pg_temp.facturado(); begin
  perform public.anular_pago('77777777-0000-4000-8000-000000000002', 'Transferencia rebotada');
  if pg_temp.facturado() <> fact - 30000000 or pg_temp.a_favor('77777777-0000-4000-8000-000000000002') <> 0 then
    raise exception 'FALLA 9: facturado % (antes %)', pg_temp.facturado(), fact;
  end if;
  raise notice 'OK 9: anular el pago de una seña la saca de lo facturado sin dejar saldo a favor';
end $$;

do $$ begin
  perform pg_temp.espera_error($q$select public.cancelar_viaje('66666666-0000-4000-8000-000000000001', 'entregado', 'sena', 'x')$q$,
    'Solo se cancela un viaje que todavía no salió', '10');
  raise notice 'OK 10: un viaje que ya salió no se cancela';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
do $$ declare n int; begin
  perform pg_temp.espera_error($q$select public.cancelar_viaje('66666666-0000-4000-8000-000000000004', 'programado', 'a_favor', 'x')$q$, 'No se encontró el viaje', '11');
  perform pg_temp.espera_error($q$select public.usar_saldo_a_favor('77777777-0000-4000-8000-000000000003', '[{"item_id":"00000000-0000-4000-8000-000000000000","monto_centavos":1}]')$q$, 'No se encontró el pago', '11b');
  perform pg_temp.espera_error(format('select public.entregar_auto(%L)', pg_temp.auto('66666666-0000-4000-8000-000000000004', 1)), 'No se encontró el auto', '11c');
  update public.aplicaciones_pago set desaplicado_en = now(), desaplicado_motivo = 'x';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLA 11: desaplicó pagos ajenos'; end if;
  raise notice 'OK 11: otra empresa no cancela, no usa saldos, no entrega ni desaplica nada de Rovirosa';
end $$;
