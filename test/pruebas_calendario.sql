-- Pruebas del sprint 8: agenda y bloqueos. Base con migraciones + seed + reloj fijo (hoy = 25/11/2026).
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'dueno@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'chofer@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'otra@empresa.com')
on conflict do nothing;
insert into public.empresas (id, nombre) values ('00000000-0000-4000-8000-000000000002', 'Otra transportista') on conflict do nothing;
insert into public.perfiles (user_id, empresa_id, nombre, rol) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Dueño demo', 'dueno'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Chofer', 'chofer'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Otra', 'dueno')
on conflict do nothing;

create temp table r as
select (select id from public.unidades where nombre = 'Mosquito 1') as mosquito1,
       (select id from public.unidades where nombre = 'Mosquito 2') as mosquito2,
       (select id from public.choferes where nombre = 'Chofer A')   as chofer_a,
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
create function pg_temp.viaje(p_id uuid, p_salida date, p_llegada date) returns void language sql as $$
  select public.crear_viaje(p_id, p_salida, p_llegada, 'Buenos Aires', 'Rosario', null, 'ARS', (select mosquito1 from r), (select chofer_a from r), null,
    jsonb_build_array(jsonb_build_object('cliente_id', (select juan from r), 'vehiculo', jsonb_build_object('marca', 'X', 'modelo', 'Y'), 'precio_centavos', 1))) $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

select pg_temp.viaje('99999999-1111-4000-8000-000000000001', public.hoy_ar() + 3, public.hoy_ar() + 5);  -- 3 días
select pg_temp.viaje('99999999-1111-4000-8000-000000000002', public.hoy_ar() + 10, null);               -- sin llegada
select pg_temp.viaje('99999999-1111-4000-8000-000000000003', public.hoy_ar() + 4, null);                -- se cancela
select public.cambiar_estado_viaje('99999999-1111-4000-8000-000000000003', 'programado', 'cancelado');

do $$ declare a jsonb := public.agenda(public.hoy_ar(), public.hoy_ar() + 13); ids text; begin
  select string_agg(v ->> 'id', ',' order by v ->> 'fecha_salida') into ids from jsonb_array_elements(a -> 'viajes') v
  where v ->> 'id' like '99999999-1111%';
  if ids <> '99999999-1111-4000-8000-000000000001,99999999-1111-4000-8000-000000000002' then raise exception 'FALLA 1: %', ids; end if;
  if jsonb_array_length(a -> 'unidades') <> 3 then raise exception 'FALLA 1: unidades'; end if;
  if (select (v ->> 'autos')::int from jsonb_array_elements(a -> 'viajes') v where v ->> 'id' = '99999999-1111-4000-8000-000000000001') <> 1 then raise exception 'FALLA 1: autos'; end if;
  -- Un viaje que terminó antes del rango no aparece; uno sin llegada ocupa solo su día
  if exists (select 1 from jsonb_array_elements(public.agenda(public.hoy_ar() + 11, public.hoy_ar() + 13) -> 'viajes') v where v ->> 'id' = '99999999-1111-4000-8000-000000000002') then
    raise exception 'FALLA 1: el viaje sin llegada ocupa más de un día';
  end if;
  perform pg_temp.espera_error($q$select public.agenda(public.hoy_ar(), public.hoy_ar() + 70)$q$, 'Elegí un rango de hasta dos meses', '1b');
  raise notice 'OK 1: la agenda trae los viajes que pisan el rango (sin los cancelados; sin llegada, solo el día de salida)';
end $$;

do $$ declare b jsonb; begin
  b := public.crear_bloqueo((select mosquito1 from r), null, public.hoy_ar() + 4, public.hoy_ar() + 6, 'service', 'Cambio de aceite');
  if jsonb_array_length(b -> 'choques') <> 1 or (b -> 'choques' -> 0 ->> 'numero')::int <> (select numero from public.viajes where id = '99999999-1111-4000-8000-000000000001') then
    raise exception 'FALLA 2: choques %', b;
  end if;
  if not exists (select 1 from jsonb_array_elements(public.agenda(public.hoy_ar(), public.hoy_ar() + 13) -> 'bloqueos') x where x ->> 'id' = b ->> 'id') then
    raise exception 'FALLA 2: no aparece en la agenda';
  end if;
  b := public.crear_bloqueo(null, (select chofer_a from r), public.hoy_ar() + 10, public.hoy_ar() + 10, 'franco', null);
  if jsonb_array_length(b -> 'choques') <> 1 then raise exception 'FALLA 2: choque de chofer %', b; end if;
  raise notice 'OK 2: un bloqueo de unidad o de chofer avisa con qué viajes choca y aparece en la agenda';
end $$;

do $$ begin
  perform pg_temp.espera_error($q$select public.crear_bloqueo(null, null, public.hoy_ar(), public.hoy_ar(), 'service', null)$q$, 'Elegí una unidad o un chofer', '3');
  perform pg_temp.espera_error(format($q$select public.crear_bloqueo(%L, %L, public.hoy_ar(), public.hoy_ar(), 'service', null)$q$, (select mosquito1 from r), (select chofer_a from r)), 'Elegí una unidad o un chofer', '3b');
  perform pg_temp.espera_error(format($q$select public.crear_bloqueo(%L, null, public.hoy_ar(), public.hoy_ar() - 1, 'service', null)$q$, (select mosquito1 from r)), 'La fecha "hasta" no puede ser antes de "desde"', '3c');
  perform pg_temp.espera_error(format($q$select public.crear_bloqueo(%L, null, public.hoy_ar(), public.hoy_ar(), 'paseo', null)$q$, (select mosquito1 from r)), 'Elegí el motivo', '3d');
  raise notice 'OK 3: rechaza bloqueos sin unidad ni chofer, con las dos, con fechas al revés o sin motivo válido';
end $$;

do $$ declare b uuid := (select id from public.bloqueos_disponibilidad where motivo = 'service' and notas = 'Cambio de aceite'); begin
  perform pg_temp.espera_error(format($q$select public.anular_bloqueo(%L, ' ')$q$, b), 'Escribí el motivo', '4');
  perform pg_temp.espera_error(format($q$update public.bloqueos_disponibilidad set hasta = hasta + 1 where id = %L$q$, b), 'Un bloqueo no se edita', '4b');
  perform public.anular_bloqueo(b, 'El service se pasó a enero');
  if exists (select 1 from jsonb_array_elements(public.agenda(public.hoy_ar(), public.hoy_ar() + 13) -> 'bloqueos') x where (x ->> 'id')::uuid = b) then
    raise exception 'FALLA 4: sigue en la agenda';
  end if;
  if not exists (select 1 from public.bloqueos_disponibilidad where id = b) then raise exception 'FALLA 4: se borró'; end if;
  perform pg_temp.espera_error(format($q$select public.anular_bloqueo(%L, 'otra vez')$q$, b), 'No se encontró el bloqueo (o ya estaba anulado)', '4c');
  raise notice 'OK 4: un bloqueo no se edita; se anula con motivo, sale de la agenda y no se borra';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';
do $$ begin
  perform pg_temp.espera_error(format($q$select public.crear_bloqueo(%L, null, public.hoy_ar(), public.hoy_ar(), 'service', null)$q$, (select mosquito1 from r)), 'No tenés permiso', '5');
  raise notice 'OK 5: el chofer no carga bloqueos';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
do $$ declare a jsonb := public.agenda(public.hoy_ar(), public.hoy_ar() + 13); begin
  if jsonb_array_length(a -> 'viajes') <> 0 or jsonb_array_length(a -> 'bloqueos') <> 0 or jsonb_array_length(a -> 'unidades') <> 0 then raise exception 'FALLA 6: %', a; end if;
  perform pg_temp.espera_error(format($q$select public.crear_bloqueo(%L, null, public.hoy_ar(), public.hoy_ar(), 'service', null)$q$, (select mosquito2 from r)), 'La unidad no existe', '6b');
  perform pg_temp.espera_error(format($q$select public.anular_bloqueo(%L, 'x')$q$, '00000000-0000-4000-8000-0000000000bb'), 'No se encontró el bloqueo', '6c');
  raise notice 'OK 6: otra empresa no ve la agenda de Rovirosa ni carga o anula bloqueos en sus unidades';
end $$;

reset role;
do $$ begin
  if (select count(*) from public.auditoria where tabla = 'bloqueos_disponibilidad') < 3 then raise exception 'FALLA 7: auditoría'; end if;
  raise notice 'OK 7: altas y anulaciones de bloqueos quedan en la auditoría';
end $$;
