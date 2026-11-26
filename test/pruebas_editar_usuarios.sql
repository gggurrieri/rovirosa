-- Pruebas del sprint 5a: editar viajes y alta de usuarios por invitación. Base con:
--   stub_supabase.sql → stub_storage.sql → migraciones → seed.sql
-- Cada bloque muestra "OK: ..." o corta con "FALLA: ...".
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'dueno@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'chofer@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'otra@empresa.com'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'admin@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000007', 'colado@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000008', 'doble@demo.com')
on conflict do nothing;
-- Se registró pero todavía no confirmó su email.
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-0000-4000-8000-000000000006', 'sinconfirmar@demo.com', null)
on conflict do nothing;
insert into public.empresas (id, nombre) values ('00000000-0000-4000-8000-000000000002', 'Otra transportista')
on conflict do nothing;
insert into public.perfiles (user_id, empresa_id, nombre, rol) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Dueño demo', 'dueno'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Chofer demo', 'chofer'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Otra', 'dueno')
on conflict do nothing;

-- Ids reales de Rovirosa leídos SIN RLS: los ataques usan datos que existen.
create temp table r as
select
  (select id from public.unidades where nombre = 'Mosquito 1')       as mosquito1,
  (select id from public.unidades where nombre = 'Mosquito 2')       as mosquito2,
  (select id from public.choferes where nombre = 'Chofer B')         as chofer_b,
  (select id from public.clientes where nombre like 'Juan Pérez%')   as juan,
  (select id from public.clientes where nombre like 'María Gómez%')  as maria,
  (select id from public.viajes where estado = 'entregado' order by numero limit 1) as entregado;
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
create function pg_temp.ed(p_cambios jsonb, p_motivo text default null) returns jsonb language sql as $$
  select public.editar_viaje('55555555-0000-4000-8000-000000000001',
    public.version_viaje('55555555-0000-4000-8000-000000000001'), p_cambios, p_motivo) $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

-- Viaje programado con dos autos de Juan; $ 600.000 cobrados del primero.
select public.crear_viaje('55555555-0000-4000-8000-000000000001', public.hoy_ar() + 5, null, 'Buenos Aires', 'Rosario',
  null, 'ARS', (select mosquito1 from r), null, null,
  jsonb_build_array(
    jsonb_build_object('cliente_id', (select juan from r), 'vehiculo', jsonb_build_object('marca', 'Audi', 'modelo', 'R8'), 'precio_centavos', 100000000),
    jsonb_build_object('cliente_id', (select juan from r), 'vehiculo', jsonb_build_object('marca', 'BMW', 'modelo', 'M3'), 'precio_centavos', 90000000)));
create temp table it as
select (select i.id from public.items_viaje i join public.vehiculos v on v.id = i.vehiculo_id
        where i.viaje_id = '55555555-0000-4000-8000-000000000001' and v.marca = 'Audi') as audi,
       (select i.id from public.items_viaje i join public.vehiculos v on v.id = i.vehiculo_id
        where i.viaje_id = '55555555-0000-4000-8000-000000000001' and v.marca = 'BMW') as bmw;
select public.registrar_pago(gen_random_uuid(), (select juan from r), public.hoy_ar(), 60000000, 'ARS',
  p_aplicaciones => jsonb_build_array(jsonb_build_object('item_id', (select audi from it), 'monto_centavos', 60000000)));

do $$ declare v1 text; v2 text; begin
  v1 := public.version_viaje('55555555-0000-4000-8000-000000000001');
  v2 := public.version_viaje('55555555-0000-4000-8000-000000000001');
  if v1 is null or v1 <> v2 then raise exception 'FALLA 1: versión inestable'; end if;
  perform pg_temp.ed(jsonb_build_object('viaje', jsonb_build_object('fecha_salida', public.hoy_ar() + 6, 'unidad_id', (select mosquito2 from r),
    'chofer_id', (select chofer_b from r), 'notas', 'Retirar 9 hs')));
  if not exists (select 1 from public.viajes where id = '55555555-0000-4000-8000-000000000001'
                 and fecha_salida = public.hoy_ar() + 6 and unidad_id = (select mosquito2 from r) and notas = 'Retirar 9 hs') then
    raise exception 'FALLA 1: no guardó los cambios';
  end if;
  if public.version_viaje('55555555-0000-4000-8000-000000000001') = v1 then raise exception 'FALLA 1: la versión no cambió'; end if;
  raise notice 'OK 1: programado → cambia fecha, unidad, chofer y notas; la versión cambia';
end $$;

do $$ declare v_vieja text := md5('otra versión'); begin
  perform pg_temp.espera_error(format($q$select public.editar_viaje('55555555-0000-4000-8000-000000000001', %L, '{"viaje":{"notas":"pisar"}}')$q$, v_vieja),
    'El viaje cambió mientras lo editabas', '2');
  if exists (select 1 from public.viajes where notas = 'pisar') then raise exception 'FALLA 2: pisó el cambio'; end if;
  raise notice 'OK 2: con una versión vieja no pisa nada ("El viaje cambió mientras lo editabas")';
end $$;

do $$ begin
  perform pg_temp.espera_error(format($q$select pg_temp.ed('{"precios":[{"item_id":"%s","precio_centavos":50000000}]}')$q$, (select audi from it)),
    'Ya se cobraron $ 600.000 de este auto', '3');
  perform pg_temp.ed(jsonb_build_object('precios', jsonb_build_array(jsonb_build_object('item_id', (select audi from it), 'precio_centavos', 80000000))));
  if (select saldo_centavos from public.v_items_saldo where id = (select audi from it)) <> 20000000 then raise exception 'FALLA 3: saldo'; end if;
  raise notice 'OK 3: el precio no baja de lo cobrado ($ 600.000); a $ 800.000 queda saldo $ 200.000';
end $$;

do $$ begin
  perform pg_temp.espera_error(format($q$select pg_temp.ed('{"quitar":["%s"]}')$q$, (select audi from it)),
    'El auto tiene pagos: elegí si lo cobrado queda como seña o a favor del cliente', '4');
  perform pg_temp.ed(jsonb_build_object('quitar', jsonb_build_array((select bmw from it)),
    'agregar', jsonb_build_array(jsonb_build_object('cliente_id', (select maria from r),
      'vehiculo', jsonb_build_object('marca', 'Ferrari', 'modelo', 'Roma'), 'precio_centavos', 120000000))));
  if not (select cancelado from public.items_viaje where id = (select bmw from it)) then raise exception 'FALLA 4: no quitó el BMW'; end if;
  if not exists (select 1 from public.items_viaje where id = (select bmw from it)) then raise exception 'FALLA 4: borró el BMW'; end if;
  if (select count(*) from public.items_viaje where viaje_id = '55555555-0000-4000-8000-000000000001' and not cancelado) <> 2 then
    raise exception 'FALLA 4: autos activos';
  end if;
  perform pg_temp.espera_error($q$select pg_temp.ed(jsonb_build_object('agregar', jsonb_build_array(
      jsonb_build_object('cliente_nuevo', jsonb_build_object('nombre', 'No debe existir'), 'vehiculo', jsonb_build_object('marca', 'A', 'modelo', 'B'), 'precio_centavos', 1),
      jsonb_build_object('cliente_nuevo', jsonb_build_object('nombre', 'No debe existir'), 'vehiculo', jsonb_build_object('marca', 'C', 'modelo', 'D'), 'precio_centavos', 1))))$q$,
    'Mosquito 2 lleva hasta 3 autos', '4b');
  if exists (select 1 from public.clientes where nombre = 'No debe existir') then raise exception 'FALLA 4b: quedó a medias'; end if;
  raise notice 'OK 4: no quita un auto con pagos; quitar = cancelar (no borra); agregar respeta la capacidad, todo o nada';
end $$;

do $$ begin
  perform public.cambiar_estado_viaje('55555555-0000-4000-8000-000000000001', 'programado', 'en_viaje');
  perform pg_temp.espera_error($q$select pg_temp.ed(jsonb_build_object('viaje', jsonb_build_object('fecha_salida', public.hoy_ar())))$q$,
    'El viaje ya está en viaje', '5');
  perform pg_temp.espera_error($q$select pg_temp.ed(jsonb_build_object('agregar', jsonb_build_array(jsonb_build_object('cliente_id', (select maria from r), 'vehiculo', jsonb_build_object('marca', 'A', 'modelo', 'B'), 'precio_centavos', 1))))$q$,
    'Solo se agregan o quitan autos antes de que salga el viaje', '5b');
  perform pg_temp.ed(jsonb_build_object('viaje', jsonb_build_object('chofer_id', null, 'notas', 'Llamar al llegar'),
    'precios', jsonb_build_array(jsonb_build_object('item_id', (select audi from it), 'precio_centavos', 85000000))));
  if (select chofer_id from public.viajes where id = '55555555-0000-4000-8000-000000000001') is not null then raise exception 'FALLA 5: chofer'; end if;
  raise notice 'OK 5: en viaje → no cambia fecha ni autos; sí chofer, notas y precio';
end $$;

do $$ declare v_aud public.auditoria%rowtype; begin
  perform pg_temp.espera_error(format($q$select public.editar_viaje(%L, public.version_viaje(%L), '{"precios":[{"item_id":"%s","precio_centavos":1}]}')$q$,
    (select entregado from r), (select entregado from r),
    (select id from public.items_viaje where viaje_id = (select entregado from r) limit 1)), 'Escribí el motivo del cambio de precio', '6');
  perform public.editar_viaje((select entregado from r), public.version_viaje((select entregado from r)),
    jsonb_build_object('precios', jsonb_build_array(jsonb_build_object('item_id',
      (select i.id from public.v_items_saldo i where i.viaje_id = (select entregado from r) order by i.id limit 1),
      'precio_centavos', (select i.precio_centavos + 5000000 from public.v_items_saldo i where i.viaje_id = (select entregado from r) order by i.id limit 1)))),
    'Se sumó un peaje');
  select * into v_aud from public.auditoria where tabla = 'items_viaje' and accion = 'UPDATE' order by id desc limit 1;
  if v_aud.motivo is distinct from 'Se sumó un peaje'
     or (v_aud.despues ->> 'precio_centavos')::bigint - (v_aud.antes ->> 'precio_centavos')::bigint <> 5000000
     or v_aud.usuario <> 'aaaaaaaa-0000-4000-8000-000000000001' then
    raise exception 'FALLA 6: auditoría %', row_to_json(v_aud);
  end if;
  perform pg_temp.espera_error(format($q$update public.viajes set fecha_salida = fecha_salida + 1 where id = %L$q$, (select entregado from r)),
    'El viaje ya está entregado', '6b');
  raise notice 'OK 6: entregado → precio solo con motivo; auditoría con antes, después, quién y motivo; la base frena cambios directos';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';
do $$ begin
  perform pg_temp.espera_error($q$select public.editar_viaje('55555555-0000-4000-8000-000000000001', 'x', '{"viaje":{"notas":"chofer"}}')$q$,
    'No tenés permiso para editar viajes', '7');
  raise notice 'OK 7: el chofer no edita viajes';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
do $$ declare n int; begin
  perform pg_temp.espera_error($q$select public.editar_viaje('55555555-0000-4000-8000-000000000001', 'x', '{"viaje":{"notas":"ajena"}}')$q$,
    'No se encontró el viaje', '8');
  update public.items_viaje set precio_centavos = 1 where id = (select audi from it);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLA 8: cambió un precio ajeno'; end if;
  raise notice 'OK 8: otra empresa no edita un viaje de Rovirosa (ni por la función ni directo)';
end $$;

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ begin
  perform public.invitar_usuario('  Admin@Demo.com ', 'Admin demo', 'administrativo');
  perform public.invitar_usuario('sinconfirmar@demo.com', 'Sin confirmar', 'administrativo');
  perform pg_temp.espera_error($q$select public.invitar_usuario('admin@demo.com', 'Otra vez', 'administrativo')$q$, 'Ya hay una invitación pendiente', '9');
  perform pg_temp.espera_error($q$select public.invitar_usuario('no-es-un-email', 'X', 'administrativo')$q$, 'Revisá el email', '9b');
  perform pg_temp.espera_error($q$select public.invitar_usuario('dueno@demo.com', 'Yo', 'dueno')$q$, 'Ya hay un usuario con ese email', '9c');
  perform pg_temp.espera_error($q$select public.invitar_usuario('x@demo.com', 'X', 'chofer')$q$, 'Elegí el rol', '9d');
  if not exists (select 1 from public.invitaciones where email = 'admin@demo.com' and rol = 'administrativo') then raise exception 'FALLA 9: email'; end if;
  raise notice 'OK 9: el dueño invita (email normalizado); rechaza duplicadas, emails inválidos, usuarios existentes y roles no permitidos';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000005';
do $$ begin
  if public.aceptar_invitacion() <> 'aceptada' then raise exception 'FALLA 10: no aceptó'; end if;
  if public.aceptar_invitacion() <> 'activo' then raise exception 'FALLA 10: segunda vez'; end if;
  if public.mi_rol() <> 'administrativo' or public.mi_empresa() <> '00000000-0000-4000-8000-000000000001' then raise exception 'FALLA 10: rol'; end if;
  if (select count(*) from public.viajes) < 12 then raise exception 'FALLA 10: no ve los viajes'; end if;
  perform pg_temp.espera_error($q$select public.invitar_usuario('y@demo.com', 'Y', 'administrativo')$q$, 'Solo el dueño puede invitar', '10b');
  if (select count(*) from public.invitaciones) <> 0 then raise exception 'FALLA 10: el administrativo ve invitaciones'; end if;
  perform pg_temp.espera_error($q$select public.cambiar_activo_usuario('aaaaaaaa-0000-4000-8000-000000000001', false)$q$, 'Solo el dueño puede cambiar usuarios', '10c');
  raise notice 'OK 10: el invitado entra como administrativo de Rovirosa; no invita, no ve invitaciones ni desactiva';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000006';
do $$ begin
  if public.aceptar_invitacion() <> 'sin_confirmar' or public.mi_empresa() is not null then raise exception 'FALLA 11: sin confirmar'; end if;
  raise notice 'OK 11: con el email sin confirmar no toma la invitación';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000007';
do $$ begin
  if public.aceptar_invitacion() <> 'sin_invitacion' or (select count(*) from public.viajes) <> 0 then raise exception 'FALLA 12: colado'; end if;
  raise notice 'OK 12: sin invitación no tiene empresa ni ve viajes';
end $$;

-- Vencida y anulada no sirven; la de otra empresa da acceso a esa empresa, no a Rovirosa.
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select public.invitar_usuario('colado@demo.com', 'Colado', 'administrativo');
reset role;
update public.invitaciones set vence_en = now() - interval '1 minute' where email = 'colado@demo.com';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000007';
do $$ begin
  if public.aceptar_invitacion() <> 'sin_invitacion' then raise exception 'FALLA 13: aceptó una vencida'; end if;
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select public.invitar_usuario('colado@demo.com', 'Colado', 'administrativo');  -- la vencida se anula sola
select public.anular_invitacion((select id from public.invitaciones where email = 'colado@demo.com' and anulada_en is null));
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000007';
do $$ begin
  if public.aceptar_invitacion() <> 'sin_invitacion' then raise exception 'FALLA 13: aceptó una anulada'; end if;
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
select public.invitar_usuario('doble@demo.com', 'De la otra', 'administrativo');
reset role;
create temp table inv_otra as select id from public.invitaciones where email = 'doble@demo.com';
grant select on inv_otra to authenticated;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ begin
  if exists (select 1 from public.invitaciones where email = 'doble@demo.com') then raise exception 'FALLA 13: ve invitaciones ajenas'; end if;
  perform pg_temp.espera_error(format('select public.anular_invitacion(%L)',
    (select id from inv_otra)), 'La invitación ya no está pendiente', '13b');
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000008';
do $$ begin
  if public.aceptar_invitacion() <> 'aceptada' or public.mi_empresa() <> '00000000-0000-4000-8000-000000000002' then raise exception 'FALLA 13: empresa'; end if;
  if exists (select 1 from public.viajes where id = '55555555-0000-4000-8000-000000000001') then raise exception 'FALLA 13: ve Rovirosa'; end if;
  raise notice 'OK 13: vencidas y anuladas no dan acceso; la invitación de otra empresa da acceso solo a esa empresa';
end $$;

-- Desactivar y reactivar
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ begin
  perform pg_temp.espera_error($q$select public.cambiar_activo_usuario('aaaaaaaa-0000-4000-8000-000000000001', false)$q$, 'No podés desactivarte a vos mismo', '14');
  perform public.cambiar_activo_usuario('aaaaaaaa-0000-4000-8000-000000000005', false);
  if (select activo from public.perfiles where user_id = 'aaaaaaaa-0000-4000-8000-000000000005') then raise exception 'FALLA 14: sigue activo'; end if;
  perform pg_temp.espera_error($q$select public.cambiar_activo_usuario('aaaaaaaa-0000-4000-8000-000000000008', false)$q$, 'No se encontró el usuario', '14b');
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000005';
do $$ begin
  if public.aceptar_invitacion() <> 'desactivado' or public.mi_empresa() is not null or (select count(*) from public.viajes) <> 0 then
    raise exception 'FALLA 14: desactivado sigue viendo';
  end if;
  perform pg_temp.espera_error($q$select public.editar_viaje('55555555-0000-4000-8000-000000000001', 'x', '{}')$q$, 'No tenés permiso', '14c');
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select public.cambiar_activo_usuario('aaaaaaaa-0000-4000-8000-000000000005', true);
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000005';
do $$ begin
  if (select count(*) from public.viajes) < 12 then raise exception 'FALLA 14: reactivado no ve'; end if;
  raise notice 'OK 14: el dueño no se desactiva a sí mismo ni toca usuarios ajenos; desactivado no ve nada; reactivado vuelve a ver';
end $$;

reset role;
do $$ begin
  perform pg_temp.espera_error($q$update public.perfiles set rol = 'administrativo' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'$q$,
    'La empresa tiene que tener al menos un dueño activo', '15');
  if (select count(*) from public.auditoria where tabla = 'perfiles' and registro_id = 'aaaaaaaa-0000-4000-8000-000000000005' and accion = 'UPDATE') <> 2 then
    raise exception 'FALLA 15: auditoría de perfiles';
  end if;
  if (select count(*) from public.auditoria where tabla = 'invitaciones') < 5 then raise exception 'FALLA 15: auditoría de invitaciones'; end if;
  raise notice 'OK 15: siempre queda un dueño activo; desactivar, reactivar e invitaciones quedan en auditoría';
end $$;
