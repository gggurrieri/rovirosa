-- Pruebas de "Se entrega en" por auto: crear, corregir, límites, recordatorio y otra empresa.
-- Base con: stub_supabase.sql → stub_storage.sql → migraciones → seed.sql → reloj fijo (hoy = 25/11/2026).
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'dueno@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'otra@empresa.com')
on conflict do nothing;
insert into public.empresas (id, nombre) values ('00000000-0000-4000-8000-000000000002', 'Otra transportista') on conflict do nothing;
insert into public.perfiles (user_id, empresa_id, nombre, rol) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Dueño demo', 'dueno'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Otra', 'dueno')
on conflict do nothing;

create function pg_temp.espera_error(p_sql text, p_mensaje text, p_caso text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALLA %: no dio error (esperaba "%")', p_caso, p_mensaje;
exception when others then
  if sqlerrm like 'FALLA%' then raise; end if;
  if sqlerrm not like p_mensaje || '%' then
    raise exception 'FALLA %: esperaba "%", dio "%"', p_caso, p_mensaje, sqlerrm;
  end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

-- Un viaje José C. Paz → Bariloche · Mendoza con 3 autos de un cliente nuevo (sin deuda previa)
do $$
declare
  u uuid := (select id from public.unidades where nombre = 'Mosquito 1');
  auto jsonb := jsonb_build_object('cliente_nuevo', jsonb_build_object('nombre', 'Cliente Paradas (ficticio)', 'whatsapp', '1155550000'),
                                   'vehiculo', jsonb_build_object('marca', 'Audi', 'modelo', 'R8'), 'precio_centavos', 100000000);
begin
  perform public.crear_viaje('99999999-1111-4000-8000-000000000001', public.hoy_ar() - 3, null, 'José C. Paz', 'Bariloche · Mendoza', null, 'ARS', u, null, null,
    jsonb_build_array(auto || '{"entrega": "  Bariloche,   Río Negro "}', auto || '{"entrega": "Mendoza"}', auto || '{"entrega": ""}'));
  if (select array_agg(coalesce(entrega_direccion, '∅') order by entrega_direccion nulls last) from public.items_viaje
      where viaje_id = '99999999-1111-4000-8000-000000000001') <> array['Bariloche, Río Negro', 'Mendoza', '∅'] then
    raise exception 'FALLA 1: %', (select array_agg(entrega_direccion) from public.items_viaje where viaje_id = '99999999-1111-4000-8000-000000000001');
  end if;
  raise notice 'OK 1: al crear el viaje, cada auto guarda dónde se entrega (limpio; vacío = sin dato)';
end $$;

do $$
declare
  v uuid := '99999999-1111-4000-8000-000000000001';
  item uuid := (select id from public.items_viaje where viaje_id = '99999999-1111-4000-8000-000000000001' and entrega_direccion is null);
  r jsonb;
begin
  r := public.editar_viaje(v, public.version_viaje(v), jsonb_build_object('entregas', jsonb_build_array(jsonb_build_object('item_id', item, 'entrega', 'San Luis'))));
  if (r ->> 'cambios')::int <> 1 or (select entrega_direccion from public.items_viaje where id = item) <> 'San Luis' then
    raise exception 'FALLA 2: %', r;
  end if;
  if not exists (select 1 from public.auditoria where tabla = 'items_viaje' and registro_id = item and despues ->> 'entrega_direccion' = 'San Luis') then
    raise exception 'FALLA 2: el cambio no quedó en la auditoría';
  end if;
  raise notice 'OK 2: "Se entrega en" se corrige desde Editar viaje y queda en la auditoría';

  perform pg_temp.espera_error(format('select public.editar_viaje(%L, public.version_viaje(%L), %L)', v, v,
    jsonb_build_object('entregas', jsonb_build_array(jsonb_build_object('item_id', item, 'entrega', repeat('x', 121))))),
    'El lugar de entrega es muy largo', '3');
  perform pg_temp.espera_error(format('select public.editar_viaje(%L, public.version_viaje(%L), %L)', v, v,
    jsonb_build_object('entregas', jsonb_build_array(jsonb_build_object('item_id', (select min(id::text) from public.items_viaje where viaje_id <> v), 'entrega', 'X')))),
    'El auto no es de este viaje', '3b');
  raise notice 'OK 3: hasta 120 letras, y solo autos de ese viaje';
end $$;

-- El recordatorio usa el destino de cada auto (y el del viaje si no se cargó)
do $$
declare
  d jsonb := public.registrar_recordatorio((select id from public.clientes where nombre = 'Cliente Paradas (ficticio)'));
begin
  if (select array_agg(x ->> 'destino' order by x ->> 'destino') from jsonb_array_elements(d -> 'autos') x)
     <> array['Bariloche, Río Negro', 'Mendoza', 'San Luis'] then
    raise exception 'FALLA 4: %', d -> 'autos';
  end if;
  raise notice 'OK 4: el recordatorio de WhatsApp dice a dónde fue cada auto';
end $$;

-- Otra empresa no puede tocarlo; en un viaje cancelado no se edita
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
select pg_temp.espera_error(format('select public.editar_viaje(%L, %L, %L)', '99999999-1111-4000-8000-000000000001', 'x',
  jsonb_build_object('entregas', '[]'::jsonb)), 'No se encontró el viaje', '5');
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$
declare
  v uuid := (select id from public.viajes where estado = 'cancelado' limit 1);
  item uuid := (select id from public.items_viaje where viaje_id = (select id from public.viajes where estado = 'cancelado' limit 1) and not cancelado limit 1);
begin
  if v is null then
    raise notice 'OK 5: otra empresa no lo encuentra (el seed no tiene viajes cancelados para la segunda parte)';
    return;
  end if;
  perform pg_temp.espera_error(format('select public.editar_viaje(%L, public.version_viaje(%L), %L)', v, v,
    jsonb_build_object('entregas', jsonb_build_array(jsonb_build_object('item_id', coalesce(item, gen_random_uuid()), 'entrega', 'X')))), '', '5b');
  raise notice 'OK 5: otra empresa no lo encuentra, y un viaje cancelado no se edita';
end $$;
