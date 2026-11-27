-- Pruebas del sprint 7: configuración (tarifas, unidades, choferes, empresa, importar) y
-- mover un usuario a otra empresa. Base con migraciones + seed + reloj fijo (hoy = 25/11/2026).
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'dueno@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'chofer@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'otra@empresa.com'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'admin@demo.com')
on conflict do nothing;
insert into public.empresas (id, nombre) values ('00000000-0000-4000-8000-000000000002', 'Otra transportista') on conflict do nothing;
insert into public.perfiles (user_id, empresa_id, nombre, rol) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Dueño demo', 'dueno'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Chofer', 'chofer'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Otra', 'dueno'),
  ('aaaaaaaa-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'Admin', 'administrativo')
on conflict do nothing;

create temp table r as
select (select id from public.unidades where nombre = 'Mosquito 1') as mosquito1,
       (select id from public.choferes where nombre = 'Chofer A')   as chofer_a,
       (select id from public.tarifas where destino = 'Córdoba' and origen = 'Buenos Aires') as tarifa_cba,
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
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000005';   -- el administrativo también configura

do $$ declare t uuid; antes bigint; begin
  t := public.guardar_tarifa(null, 'Buenos Aires', 'Bahía Blanca', 650, 120000000, 'ARS', true);
  perform pg_temp.espera_error($q$select public.guardar_tarifa(null, ' buenos aires ', 'BAHIA  BLANCA', 650, 1, 'ARS', true)$q$, 'Ya hay una tarifa de', '1');
  perform pg_temp.espera_error($q$select public.guardar_tarifa(null, 'Rosario', 'rosario', 1, 1, 'ARS', true)$q$, 'El origen y el destino son iguales', '1b');
  perform pg_temp.espera_error($q$select public.guardar_tarifa(null, 'A', 'B', 0, 1, 'ARS', true)$q$, 'Los km tienen que ser más que cero', '1c');
  select sum(precio_centavos) into antes from public.items_viaje where viaje_id in (select id from public.viajes where tarifa_id = (select tarifa_cba from r));
  perform public.guardar_tarifa((select tarifa_cba from r), 'Buenos Aires', 'Córdoba', 700, 99000000, 'ARS', true);
  if (select sum(precio_centavos) from public.items_viaje where viaje_id in (select id from public.viajes where tarifa_id = (select tarifa_cba from r))) <> antes then
    raise exception 'FALLA 1d: el cambio de tarifa tocó viajes ya cargados';
  end if;
  raise notice 'OK 1: tarifas: crear, rechazar rutas duplicadas (sin importar tildes ni mayúsculas) y datos inválidos; el precio nuevo no toca viajes cargados y queda en la auditoría';
end $$;

do $$ declare n bigint; begin
  perform public.crear_viaje('44444444-0000-4000-8000-000000000001', public.hoy_ar() + 5, null, 'Buenos Aires', 'Rosario', null, 'ARS', (select mosquito1 from r), null, null,
    (select jsonb_agg(jsonb_build_object('cliente_id', (select juan from r), 'vehiculo', jsonb_build_object('marca', 'M' || g, 'modelo', 'X'), 'precio_centavos', 1)) from generate_series(1, 3) g));
  select numero into n from public.viajes where id = '44444444-0000-4000-8000-000000000001';
  perform pg_temp.espera_error(format($q$select public.guardar_unidad(%L, 'Mosquito 1', 'aa000aa', 'mosquito', 2, null, true)$q$, (select mosquito1 from r)),
    format('El viaje #%s lleva 3 autos: la capacidad no puede ser menor', n), '2');
  perform public.guardar_unidad((select mosquito1 from r), 'Mosquito 1', 'aa000aa', 'mosquito', 4, (select chofer_a from r), true);
  if (select patente from public.unidades where id = (select mosquito1 from r)) <> 'AA000AA' then raise exception 'FALLA 2: patente'; end if;
  perform pg_temp.espera_error($q$select public.guardar_unidad(null, 'mosquito 1', null, 'mosquito', 3, null, true)$q$, 'Ya hay una unidad que se llama', '2b');
  raise notice 'OK 2: unidades: no se achican por debajo de un viaje programado (#%); patente en mayúsculas; nombres únicos', n;
end $$;

do $$ begin
  perform public.guardar_chofer((select chofer_a from r), 'Chofer A', null, false);
  if (select chofer_habitual_id from public.unidades where id = (select mosquito1 from r)) is not null then raise exception 'FALLA 3: sigue de habitual'; end if;
  perform pg_temp.espera_error(format($q$select public.guardar_unidad(%L, 'Mosquito 1', null, 'mosquito', 4, %L, true)$q$, (select mosquito1 from r), (select chofer_a from r)),
    'El chofer habitual no existe o está desactivado', '3b');
  perform public.guardar_chofer((select chofer_a from r), 'Chofer A', '11 0000-0001', true);
  raise notice 'OK 3: choferes: al desactivarlo deja de ser habitual y no se puede volver a asignar hasta reactivarlo';
end $$;

do $$ declare p jsonb; esperado int; begin
  select count(*) into esperado from public.v_items_saldo where vencido;
  p := public.vista_previa_vencimiento(30);
  if (p -> 'actual' ->> 'autos')::int <> esperado or (p -> 'nuevo' ->> 'autos')::int >= esperado then raise exception 'FALLA 4: %', p; end if;
  perform pg_temp.espera_error($q$select public.guardar_empresa('Rovirosa (demo)', null, 500)$q$, 'Los días para vencer van de 0 a 180', '4b');
  perform public.guardar_empresa('Rovirosa (demo)', '20-12345678-9', 30);
  if (select count(*) from public.v_items_saldo where vencido) <> (p -> 'nuevo' ->> 'autos')::int then raise exception 'FALLA 4: no recalculó'; end if;
  perform public.guardar_empresa('Rovirosa (demo)', '20-12345678-9', 7);
  raise notice 'OK 4: la vista previa de los días para vencer coincide con lo que pasa al guardarlos (el administrativo también puede)';
end $$;

do $$ declare r1 jsonb; begin
  r1 := public.importar_tarifas('[{"origen":"buenos aires","destino":"CORDOBA","km":710,"precio_centavos":100000000,"moneda":"ARS"},
                                  {"origen":"Rosario","destino":"Santa Fe","km":170,"precio_centavos":40000000,"moneda":"ARS"}]');
  if (r1 ->> 'creadas')::int <> 1 or (r1 ->> 'actualizadas')::int <> 1
     or (select precio_base_centavos from public.tarifas where id = (select tarifa_cba from r)) <> 100000000 then
    raise exception 'FALLA 5: %', r1;
  end if;
  perform pg_temp.espera_error($q$select public.importar_tarifas('[{"origen":"Salta","destino":"Jujuy","km":100,"precio_centavos":1,"moneda":"ARS"},{"origen":"A","destino":"B","km":0,"precio_centavos":1,"moneda":"ARS"}]')$q$,
    'Fila 2: Los km tienen que ser más que cero', '5b');
  if exists (select 1 from public.tarifas where destino = 'Jujuy') then raise exception 'FALLA 5c: quedó a medias'; end if;
  raise notice 'OK 5: importar tarifas actualiza la ruta existente (sin importar tildes), crea la nueva y, si una fila está mal, no guarda ninguna';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';
do $$ begin
  perform pg_temp.espera_error($q$select public.guardar_chofer(null, 'Nuevo', null, true)$q$, 'No tenés permiso', '6');
  perform pg_temp.espera_error($q$select public.guardar_empresa('X', null, 7)$q$, 'No tenés permiso', '6b');
  raise notice 'OK 6: el chofer no cambia la configuración';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
do $$ begin
  perform pg_temp.espera_error(format($q$select public.guardar_tarifa(%L, 'X', 'Y', 1, 1, 'ARS', true)$q$, (select tarifa_cba from r)), 'No se encontró la tarifa', '7');
  perform pg_temp.espera_error(format($q$select public.guardar_unidad(null, 'Camión', null, 'mosquito', 3, %L, true)$q$, (select chofer_a from r)), 'El chofer habitual no existe', '7b');
  perform pg_temp.espera_error(format($q$insert into public.unidades (nombre, tipo, capacidad_autos, chofer_habitual_id) values ('Camión', 'mosquito', 3, %L)$q$, (select chofer_a from r)), 'El chofer no existe', '7c');
  perform public.guardar_tarifa(null, 'Buenos Aires', 'Córdoba', 700, 1, 'ARS', true);   -- la misma ruta en otra empresa, sí
  perform public.guardar_empresa('Otra transportista SA', null, 10);
  if (select nombre from public.empresas where id = '00000000-0000-4000-8000-000000000001') <> 'Rovirosa (demo)' then raise exception 'FALLA 7d: cambió otra empresa'; end if;
  raise notice 'OK 7: otra empresa no edita tarifas ni asigna choferes de Rovirosa; puede tener su propia ruta igual; guardar_empresa solo toca la suya';
end $$;

-- Mover un usuario: desde la app no se puede; desde el SQL Editor (superusuario), sí.
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ declare n int; begin
  perform pg_temp.espera_error($q$select public.admin_mover_usuario('dueno@demo.com', '00000000-0000-4000-8000-000000000002')$q$, 'permission denied', '8');
  -- Desde la app, perfiles no se puede actualizar (no hay política): no cambia nada.
  update public.perfiles set empresa_id = '00000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLA 8b: se movió un usuario desde la app'; end if;
end $$;
reset role;
do $$ begin
  -- Ni siquiera con permisos totales se cambia la empresa sin pasar por admin_mover_usuario.
  perform pg_temp.espera_error($q$update public.perfiles set empresa_id = '00000000-0000-4000-8000-000000000002' where rol = 'administrativo'$q$,
    'No se puede cambiar la empresa de un usuario', '8c');
end $$;
reset role;
do $$ begin
  -- (La auditoría solo la ve el dueño: se revisa acá, sin RLS.)
  if not exists (select 1 from public.auditoria where tabla = 'tarifas' and registro_id = (select tarifa_cba from r) and accion = 'UPDATE'
                 and usuario = 'aaaaaaaa-0000-4000-8000-000000000005') then
    raise exception 'FALLA 1e: el cambio de tarifa no quedó en la auditoría';
  end if;
end $$;
insert into public.empresas (id, nombre) values ('00000000-0000-4000-8000-0000000000aa', 'Rovirosa');
select public.admin_mover_usuario('DUENO@demo.com', '00000000-0000-4000-8000-0000000000aa');
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ begin
  if public.mi_empresa() <> '00000000-0000-4000-8000-0000000000aa' or (select count(*) from public.viajes) <> 0 or public.mi_rol() <> 'dueno' then
    raise exception 'FALLA 8c: no quedó en la empresa nueva y limpia';
  end if;
  raise notice 'OK 8: mover un usuario solo se puede desde el SQL Editor; queda como dueño de la empresa nueva, sin los datos de prueba';
end $$;
