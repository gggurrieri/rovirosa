-- Pruebas del sprint 6: clientes, recordatorios por WhatsApp y datos para cobrar.
-- Base con: stub_supabase.sql → stub_storage.sql → migraciones → seed.sql → reloj fijo (hoy = 25/11/2026).
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
select (select id from public.clientes where nombre like 'Concesionaria Norte%') as norte,
       (select id from public.clientes where nombre like 'Autos del Sur%')      as sur;
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
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

do $$ begin
  if (select sum(saldo_ars) from public.v_clientes) <> 870000000 then raise exception 'FALLA 1: total %', (select sum(saldo_ars) from public.v_clientes); end if;
  if (select vencido_ars from public.v_clientes where id = (select norte from r)) <> 270000000
     or (select saldo_ars from public.v_clientes where id = (select sur from r)) <> 320000000 then
    raise exception 'FALLA 1: por cliente';
  end if;
  if (select count(*) from public.v_clientes) <> 6 or exists (select 1 from public.v_clientes where not activo) then raise exception 'FALLA 1: clientes'; end if;
  raise notice 'OK 1: los saldos por cliente suman los $ 8.700.000 por cobrar; Norte con $ 2.700.000 vencido';
end $$;

do $$ declare d jsonb; begin
  d := public.registrar_recordatorio((select norte from r));
  if d ->> 'cliente' <> 'Concesionaria Norte (ficticia)' or d ->> 'empresa' <> 'Rovirosa (demo)' or jsonb_array_length(d -> 'autos') < 1
     or (select sum((a ->> 'saldo')::bigint) from jsonb_array_elements(d -> 'autos') a) <> 270000000 then
    raise exception 'FALLA 2: %', d;
  end if;
  if (select saldo_ars from public.recordatorios where cliente_id = (select norte from r)) <> 270000000
     or (select ultimo_recordatorio from public.v_clientes where id = (select norte from r)) is null then
    raise exception 'FALLA 2: no quedó registrado';
  end if;
  raise notice 'OK 2: recordar a Norte devuelve sus autos con saldo ($ 2.700.000) y queda registrado con lo que debía';
end $$;

do $$ declare sin_whatsapp uuid; sin_deuda uuid; begin
  insert into public.clientes (nombre) values ('Sin WhatsApp') returning id into sin_whatsapp;
  insert into public.clientes (nombre, whatsapp) values ('Al día', '5491100000000') returning id into sin_deuda;
  perform pg_temp.espera_error(format('select public.registrar_recordatorio(%L)', sin_whatsapp), 'Cargá el WhatsApp del cliente', '3');
  perform pg_temp.espera_error(format('select public.registrar_recordatorio(%L)', sin_deuda), 'El cliente no debe nada', '3b');
  perform public.guardar_cliente(sin_deuda, 'Al día', 'particular', '5491100000000', '', '', '', false);
  if (select activo from public.v_clientes where id = sin_deuda) then raise exception 'FALLA 3c'; end if;
  perform pg_temp.espera_error(format($q$select public.guardar_cliente(%L, '  ', 'particular', '', '', '', '', true)$q$, sin_deuda), 'new row for relation "clientes" violates check constraint', '3d');
  raise notice 'OK 3: sin WhatsApp o sin deuda no registra; un cliente se desactiva sin borrarse; el nombre no puede quedar vacío';
end $$;

do $$ declare n int; begin
  perform public.guardar_datos_cobro('  Alias: rovirosa.cobros ', null);
  if (select datos_cobro from public.empresas) <> 'Alias: rovirosa.cobros' then raise exception 'FALLA 4: dueño'; end if;
  set local request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000005';
  perform pg_temp.espera_error($q$select public.guardar_datos_cobro('cambiado', null)$q$, 'Solo el dueño puede cambiar', '4b');
  update public.empresas set datos_cobro = 'cambiado' where id = '00000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLA 4: el administrativo cambió los datos para cobrar'; end if;
  if (public.registrar_recordatorio((select sur from r)) ->> 'datos_cobro') <> 'Alias: rovirosa.cobros' then raise exception 'FALLA 4: no viajan los datos'; end if;
  raise notice 'OK 4: solo el dueño carga los datos para cobrar; el administrativo manda recordatorios con esos datos';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';
do $$ begin
  perform pg_temp.espera_error(format('select public.registrar_recordatorio(%L)', (select norte from r)), 'No tenés permiso', '5');
  if (select count(*) from public.recordatorios) <> 0 then raise exception 'FALLA 5: el chofer ve recordatorios'; end if;
  raise notice 'OK 5: el chofer no manda ni ve recordatorios';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
do $$ begin
  perform pg_temp.espera_error(format('select public.registrar_recordatorio(%L)', (select norte from r)), 'No se encontró el cliente', '6');
  perform pg_temp.espera_error(format('insert into public.recordatorios (cliente_id) values (%L)', (select norte from r)), 'El cliente no existe', '6b');
  if (select count(*) from public.v_clientes) <> 0 or (select count(*) from public.recordatorios) <> 0 then raise exception 'FALLA 6: ve datos ajenos'; end if;
  raise notice 'OK 6: otra empresa no ve clientes ni recordatorios de Rovirosa, ni puede registrar uno con sus ids';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ declare f jsonb; begin
  select x into f from jsonb_array_elements(public.buscar_viajes('{"orden":"numero","dir":"asc"}') -> 'filas') x where (x ->> 'numero')::int = 12;
  if (f ->> 'entregados')::int <> 0 then raise exception 'FALLA 7: en viaje %', f; end if;
  select x into f from jsonb_array_elements(public.buscar_viajes('{"orden":"numero","dir":"asc"}') -> 'filas') x where (x ->> 'numero')::int = 1;
  if (f ->> 'entregados')::int <> (f ->> 'autos')::int then raise exception 'FALLA 7: entregado %', f; end if;
  raise notice 'OK 7: la grilla trae cuántos autos se entregaron (#1: todos; #12 en viaje: ninguno)';
end $$;
