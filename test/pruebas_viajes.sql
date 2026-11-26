-- Pruebas de la migración de viajes (sprint 3). Correr sobre una base con:
--   stub_supabase.sql → esquema_fase1 → seed.sql → cobros → viajes
-- Cada bloque muestra "OK: ..." o corta con "FALLA: ...".
\set ON_ERROR_STOP 1

insert into auth.users values ('aaaaaaaa-0000-4000-8000-000000000001', 'dueno@demo'),
                              ('aaaaaaaa-0000-4000-8000-000000000003', 'otra@empresa')
on conflict do nothing;
insert into public.empresas (id, nombre) values ('00000000-0000-4000-8000-000000000002', 'Otra transportista')
on conflict do nothing;
insert into public.perfiles values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Dueño demo', 'dueno', now()),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Otra', 'dueno', now())
on conflict do nothing;
-- La otra empresa tiene su propia unidad y su propio cliente.
insert into public.unidades (id, empresa_id, nombre, tipo, capacidad_autos)
values ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Camión de la otra', 'mosquito', 3)
on conflict do nothing;
insert into public.clientes (id, empresa_id, nombre)
values ('cccccccc-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Cliente de la otra')
on conflict do nothing;

-- Ids reales de Rovirosa leídos SIN RLS: los ataques usan datos que existen.
create temp table r as
select
  (select id from public.unidades where nombre = 'Mosquito 1')            as mosquito1,
  (select id from public.unidades where nombre = 'Camioneta')             as camioneta,
  (select id from public.choferes where nombre = 'Chofer A')              as chofer_a,
  (select id from public.tarifas  where destino = 'Córdoba' and origen = 'Buenos Aires') as tarifa_cba,
  (select id from public.clientes where nombre like 'Juan Pérez%')        as juan,
  (select id from public.clientes where nombre like 'Colección Ruiz%')    as ruiz,
  (select id from public.vehiculos where cliente_id = (select id from public.clientes where nombre like 'Colección Ruiz%') limit 1) as auto_ruiz,
  (select id from public.viajes where numero = 1)                         as viaje1;
grant select on r to authenticated;

create function pg_temp.por_cobrar() returns bigint language sql as
$$ select coalesce(sum(saldo_centavos) filter (where estado_cobro <> 'cancelado'), 0) from public.v_items_saldo $$;
create function pg_temp.vencido() returns bigint language sql as
$$ select coalesce(sum(saldo_centavos) filter (where vencido), 0) from public.v_items_saldo $$;
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
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

do $$ declare res jsonb; begin
  res := public.crear_viaje('22222222-0000-4000-8000-000000000001', public.hoy_ar() + 2, null,
    'Buenos Aires', 'Córdoba', (select tarifa_cba from r), 'ARS', (select mosquito1 from r), (select chofer_a from r), null,
    jsonb_build_array(
      jsonb_build_object('cliente_id', (select juan from r), 'vehiculo', jsonb_build_object('marca', 'Ford', 'modelo', 'Mustang'), 'precio_centavos', 95000000),
      jsonb_build_object('cliente_id', (select ruiz from r), 'vehiculo_id', (select auto_ruiz from r), 'precio_centavos', 95000000)));
  if (res ->> 'numero')::int <> 13 or res ->> 'duplicado' <> 'false' then raise exception 'FALLA 1: %', res; end if;
  if pg_temp.por_cobrar() <> 1060000000 then raise exception 'FALLA 1: por cobrar %', pg_temp.por_cobrar(); end if;
  if (select count(*) from public.v_items_saldo where viaje_numero = 13) <> 2 then raise exception 'FALLA 1: faltan autos'; end if;
  raise notice 'OK 1: viaje #13 con 2 autos (uno existente, uno nuevo) → $ 10.600.000 por cobrar';
end $$;

do $$ declare res jsonb; begin
  res := public.crear_viaje('22222222-0000-4000-8000-000000000001', public.hoy_ar(), null, 'A', 'B', null, 'ARS',
    (select mosquito1 from r), null, null, '[]'::jsonb);
  if res ->> 'duplicado' <> 'true' or (res ->> 'numero')::int <> 13 or (select count(*) from public.viajes) <> 13 then
    raise exception 'FALLA 2: %', res;
  end if;
  raise notice 'OK 2: el mismo viaje enviado dos veces se guarda una sola vez';
end $$;

do $$ declare n int; begin
  perform public.crear_viaje('22222222-0000-4000-8000-000000000002', public.hoy_ar(), null,
    'Rosario', 'Tandil', null, 'ARS', (select mosquito1 from r), null, null,
    jsonb_build_array(
      jsonb_build_object('cliente_nuevo', jsonb_build_object('nombre', 'Ana Nueva', 'whatsapp', '+5491100000000'), 'vehiculo', jsonb_build_object('marca', 'BMW', 'modelo', 'M3'), 'precio_centavos', 0),
      jsonb_build_object('cliente_nuevo', jsonb_build_object('nombre', 'ana nueva ', 'whatsapp', ''), 'vehiculo', jsonb_build_object('marca', 'BMW', 'modelo', 'M5'), 'precio_centavos', 50000000)));
  select count(*) into n from public.clientes where nombre = 'Ana Nueva';
  if n <> 1 then raise exception 'FALLA 3: se crearon % clientes "Ana Nueva"', n; end if;
  if (select count(distinct cliente_id) from public.items_viaje i join public.viajes v on v.id = i.viaje_id where v.numero = 14) <> 1 then
    raise exception 'FALLA 3: los dos autos no quedaron con el mismo cliente';
  end if;
  raise notice 'OK 3: ruta sin tarifa, cliente nuevo repetido en dos autos → un solo cliente, precio $ 0 aceptado';
end $$;

do $$ begin
  perform pg_temp.espera_error(format($q$select public.crear_viaje(gen_random_uuid(), public.hoy_ar(), null, 'A', 'B', null, 'ARS', %L, null, null,
    jsonb_build_array(
      jsonb_build_object('cliente_nuevo', jsonb_build_object('nombre', 'No debe existir'), 'vehiculo', jsonb_build_object('marca', 'X', 'modelo', 'Y'), 'precio_centavos', 1),
      jsonb_build_object('cliente_id', %L, 'vehiculo', jsonb_build_object('marca', 'X', 'modelo', 'Z'), 'precio_centavos', 1)))$q$,
    (select camioneta from r), (select juan from r)), 'La unidad lleva hasta 1 autos', '4');
  if exists (select 1 from public.clientes where nombre = 'No debe existir') then raise exception 'FALLA 4: quedó un cliente a medias'; end if;
  perform pg_temp.espera_error(format($q$select public.crear_viaje(gen_random_uuid(), public.hoy_ar(), null, 'A', 'B', null, 'ARS', %L, null, null,
    jsonb_build_array(jsonb_build_object('cliente_id', %L, 'vehiculo_id', %L, 'precio_centavos', 1)))$q$,
    (select mosquito1 from r), (select juan from r), (select auto_ruiz from r)), 'El vehículo no es de ese cliente', '4b');
  perform pg_temp.espera_error(format($q$select public.crear_viaje(gen_random_uuid(), public.hoy_ar(), null, 'A', 'B', null, 'ARS', %L, null, null,
    jsonb_build_array(jsonb_build_object('cliente_id', %L, 'vehiculo', jsonb_build_object('marca', ' ', 'modelo', 'Y'), 'precio_centavos', 1)))$q$,
    (select mosquito1 from r), (select juan from r)), 'Falta la marca o el modelo', '4c');
  raise notice 'OK 4: rechaza pasarse de la capacidad (sin dejar nada a medias), autos ajenos y autos sin marca';
end $$;

do $$ declare v uuid := '22222222-0000-4000-8000-000000000001'; begin
  -- La salida se corre hacia atrás antes de que salga (después, la base ya no deja cambiarla).
  update public.viajes set fecha_salida = public.hoy_ar() - 12 where id = v;
  perform public.cambiar_estado_viaje(v, 'programado', 'en_retiro');
  perform public.cambiar_estado_viaje(v, 'en_retiro', 'en_viaje');
  perform pg_temp.espera_error(format($q$select public.cambiar_estado_viaje(%L, 'en_viaje', 'entregado', public.hoy_ar() - 13)$q$, v),
    'La fecha de entrega no puede ser antes de la salida', '5a');
  perform public.cambiar_estado_viaje(v, 'en_viaje', 'entregado', public.hoy_ar() - 10);
  if pg_temp.vencido() <> 460000000 then raise exception 'FALLA 5: vencido %', pg_temp.vencido(); end if;
  raise notice 'OK 5: entregado hace 10 días → sus autos impagos aparecen vencidos ($ 4.600.000)';
  perform public.cambiar_estado_viaje(v, 'entregado', 'en_viaje');
  if pg_temp.vencido() <> 270000000 or exists (select 1 from public.items_viaje where viaje_id = v and fecha_entrega is not null) then
    raise exception 'FALLA 6: deshacer no limpió la entrega';
  end if;
  raise notice 'OK 6: deshacer Entregado borra la fecha de entrega y deja de estar vencido';
end $$;

do $$ declare v uuid := '22222222-0000-4000-8000-000000000001'; begin
  perform pg_temp.espera_error(format($q$select public.cambiar_estado_viaje(%L, 'en_viaje', 'cerrado')$q$, v), 'No se puede pasar de en_viaje a cerrado', '7a');
  perform pg_temp.espera_error(format($q$select public.cambiar_estado_viaje(%L, 'programado', 'en_retiro')$q$, v), 'El viaje cambió mientras lo mirabas', '7b');
  perform pg_temp.espera_error(format($q$select public.cambiar_estado_viaje(%L, 'en_viaje', 'entregado', public.hoy_ar() + 1)$q$, v), 'La fecha de entrega no puede ser posterior a hoy', '7c');
  raise notice 'OK 7: rechaza saltos de estado, cambios sobre una pantalla vieja y entregas a futuro';
end $$;

do $$ declare antes bigint := pg_temp.por_cobrar(); begin
  perform public.cambiar_estado_viaje('22222222-0000-4000-8000-000000000002', 'programado', 'cancelado');
  if pg_temp.por_cobrar() <> antes - 50000000 then raise exception 'FALLA 8: por cobrar % (antes %)', pg_temp.por_cobrar(), antes; end if;
  perform pg_temp.espera_error(format($q$select public.cambiar_estado_viaje(%L, 'entregado', 'cancelado')$q$, (select viaje1 from r)),
    'No se puede pasar de entregado a cancelado', '8b');
  raise notice 'OK 8: cancelar un viaje sin pagos saca sus autos de lo por cobrar';
end $$;

-- Otra empresa intenta usar datos de Rovirosa con ids reales.
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';

do $$
declare
  propia uuid := 'dddddddd-0000-4000-8000-000000000002';
  cliente_propio uuid := 'cccccccc-0000-4000-8000-000000000002';
  item_ok jsonb := jsonb_build_array(jsonb_build_object('cliente_id', 'cccccccc-0000-4000-8000-000000000002',
                     'vehiculo', jsonb_build_object('marca', 'X', 'modelo', 'Y'), 'precio_centavos', 1));
begin
  if (select count(*) from public.viajes) <> 0 then raise exception 'FALLA 9: ve viajes de Rovirosa'; end if;
  perform pg_temp.espera_error(format($q$select public.crear_viaje(gen_random_uuid(), public.hoy_ar(), null, 'A', 'B', null, 'ARS', %L, null, null, %L)$q$,
    (select mosquito1 from r), item_ok), 'La unidad no existe', '9a');
  perform pg_temp.espera_error(format($q$select public.crear_viaje(gen_random_uuid(), public.hoy_ar(), null, 'A', 'B', null, 'ARS', %L, %L, null, %L)$q$,
    propia, (select chofer_a from r), item_ok), 'El chofer no existe', '9b');
  perform pg_temp.espera_error(format($q$select public.crear_viaje(gen_random_uuid(), public.hoy_ar(), null, 'A', 'B', %L, 'ARS', %L, null, null, %L)$q$,
    (select tarifa_cba from r), propia, item_ok), 'La tarifa no existe', '9c');
  perform pg_temp.espera_error(format($q$select public.crear_viaje(gen_random_uuid(), public.hoy_ar(), null, 'A', 'B', null, 'ARS', %L, null, null,
    jsonb_build_array(jsonb_build_object('cliente_id', %L, 'vehiculo', jsonb_build_object('marca', 'X', 'modelo', 'Y'), 'precio_centavos', 1)))$q$,
    propia, (select juan from r)), 'El cliente no existe', '9d');
  perform pg_temp.espera_error(format($q$select public.cambiar_estado_viaje(%L, 'entregado', 'cerrado')$q$, (select viaje1 from r)),
    'No se encontró el viaje', '9e');
  perform pg_temp.espera_error(format($q$insert into public.items_viaje (viaje_id, cliente_id, precio_centavos) values (%L, %L, 1)$q$,
    (select viaje1 from r), cliente_propio), 'El viaje no existe', '9f');
  perform pg_temp.espera_error(format($q$insert into public.vehiculos (cliente_id, marca, modelo) values (%L, 'X', 'Y')$q$,
    (select juan from r)), 'El cliente no existe', '9g');
  -- Y con sus propios datos, sí puede.
  perform public.crear_viaje(gen_random_uuid(), public.hoy_ar(), null, 'A', 'B', null, 'ARS', propia, null, null, item_ok);
  raise notice 'OK 9: otra empresa no ve viajes ni usa unidades, choferes, tarifas, clientes o viajes de Rovirosa; con los suyos sí';
end $$;

reset role;
do $$ declare n int; begin
  select count(*) into n from (
    select 1 from public.viajes v join public.unidades u on u.id = v.unidad_id where u.empresa_id <> v.empresa_id
    union all
    select 1 from public.items_viaje i join public.viajes v on v.id = i.viaje_id where v.empresa_id <> i.empresa_id
    union all
    select 1 from public.items_viaje i join public.clientes c on c.id = i.cliente_id where c.empresa_id <> i.empresa_id
    union all
    select 1 from public.vehiculos ve join public.clientes c on c.id = ve.cliente_id where c.empresa_id <> ve.empresa_id
  ) x;
  if n <> 0 then raise exception 'FALLA 10: hay % filas que cruzan empresas', n; end if;
  raise notice 'OK 10: ninguna fila de viajes, autos o vehículos cruza empresas';
end $$;
