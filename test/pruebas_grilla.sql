-- Pruebas de la grilla de viajes (sprint 4b). Base con:
--   stub_supabase.sql → stub_storage.sql → migraciones → seed.sql
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

-- Ids reales leídos sin RLS, y lo esperado calculado sin RLS.
create temp table r as
select
  (select id from public.unidades where nombre = 'Mosquito 2')                as mosquito2,
  (select id from public.clientes where nombre like 'Concesionaria Norte%')   as norte,
  (select count(distinct viaje_id) from public.v_items_saldo where vencido)   as viajes_vencidos;
grant select on r to authenticated;

create function pg_temp.b(p jsonb) returns jsonb language sql as $$ select public.buscar_viajes(p) $$;
create function pg_temp.total(p jsonb) returns int language sql as $$ select (public.buscar_viajes(p) ->> 'total')::int $$;
create function pg_temp.suma(p jsonb, campo text) returns bigint language sql as $$ select (public.buscar_viajes(p) -> 'totales' ->> campo)::bigint $$;
create function pg_temp.numeros(p jsonb) returns text language sql as $$
  select string_agg(f ->> 'numero', ',' order by o) from jsonb_array_elements(public.buscar_viajes(p) -> 'filas') with ordinality x(f, o) $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

do $$ begin
  if pg_temp.total('{}') <> 12 or pg_temp.suma('{}', 'facturado_ars') <> 2225000000 or pg_temp.suma('{}', 'saldo_ars') <> 870000000 then
    raise exception 'FALLA 1: %', pg_temp.b('{}') -> 'totales';
  end if;
  raise notice 'OK 1: sin filtros → 12 viajes, $ 22.250.000 facturado, $ 8.700.000 de saldo';
end $$;

do $$ declare p jsonb := jsonb_build_object('unidad', (select mosquito2 from r)); begin
  if pg_temp.total(p) <> 4 or pg_temp.suma(p, 'facturado_ars') <> 1170000000 then raise exception 'FALLA 2: %', pg_temp.b(p) -> 'totales'; end if;
  raise notice 'OK 2: Mosquito 2 → 4 viajes, $ 11.700.000 facturado';
end $$;

do $$ declare p jsonb := jsonb_build_object('cliente', (select norte from r), 'orden', 'numero', 'dir', 'asc'); begin
  if pg_temp.numeros(p) <> '1,3,4' or pg_temp.suma(p, 'facturado_ars') <> 365000000 then
    raise exception 'FALLA 3: viajes % facturado %', pg_temp.numeros(p), pg_temp.suma(p, 'facturado_ars');
  end if;
  raise notice 'OK 3: Concesionaria Norte → viajes #1, #3 y #4; $ 3.650.000 (solo sus autos)';
end $$;

do $$ begin
  if pg_temp.total('{"cobro":"con_saldo"}') <> 6 or pg_temp.suma('{"cobro":"con_saldo"}', 'saldo_ars') <> 870000000 then raise exception 'FALLA 4: con saldo'; end if;
  if pg_temp.total('{"cobro":"pagados"}') <> 6 then raise exception 'FALLA 4: pagados %', pg_temp.total('{"cobro":"pagados"}'); end if;
  if pg_temp.total('{"cobro":"vencidos"}') <> (select viajes_vencidos from r) then raise exception 'FALLA 4: vencidos'; end if;
  raise notice 'OK 4: cobro → 6 con saldo ($ 8.700.000), 6 pagados, y los vencidos según la fecha de hoy';
end $$;

do $$ begin
  if pg_temp.total('{"texto":"rosario"}') <> 3 then raise exception 'FALLA 5: rosario %', pg_temp.total('{"texto":"rosario"}'); end if;
  if pg_temp.total('{"texto":"%"}') <> 0 or pg_temp.total('{"texto":"_"}') <> 0 then raise exception 'FALLA 5: %% o _ traen todo'; end if;
  if pg_temp.total('{"texto":"Juan Pérez"}') < 1 then raise exception 'FALLA 5: no busca en clientes'; end if;
  raise notice 'OK 5: texto "rosario" → 3; "%%" y "_" no traen todo; busca también en clientes';
end $$;

do $$ begin
  if pg_temp.total('{"desde":"2026-11-01","hasta":"2026-11-10"}') <> 5 or pg_temp.total('{"desde":"2026-11-10","hasta":"2026-11-01"}') <> 5 then
    raise exception 'FALLA 6: fechas';
  end if;
  if pg_temp.total('{"estados":["entregado"]}') <> 11 or pg_temp.total('{"estados":["entregado","en_viaje"]}') <> 12 then raise exception 'FALLA 6: estados'; end if;
  raise notice 'OK 6: salida del 01/11 al 10/11 → 5 (también con fechas invertidas); estados combinados';
end $$;

do $$ begin
  if split_part(pg_temp.numeros('{"orden":"saldo","dir":"desc"}'), ',', 1) <> '7' then raise exception 'FALLA 7: orden por saldo'; end if;
  if split_part(pg_temp.numeros('{"orden":"numero","dir":"asc"}'), ',', 1) <> '1' then raise exception 'FALLA 7: orden por número'; end if;
  if pg_temp.numeros('{"orden":"numero","dir":"asc","por_pagina":5,"pagina":3}') <> '11,12' or pg_temp.total('{"por_pagina":5,"pagina":3}') <> 12 then
    raise exception 'FALLA 7: página %', pg_temp.numeros('{"orden":"numero","dir":"asc","por_pagina":5,"pagina":3}');
  end if;
  raise notice 'OK 7: orden por saldo (#7 primero) y por número; página 3 de a 5 → #11 y #12, total 12';
end $$;

do $$ begin
  perform pg_temp.b('{"orden":"numero; drop table viajes; --","dir":"asc; select 1"}');
  if pg_temp.total('{}') <> 12 then raise exception 'FALLA 8: la inyección tuvo efecto'; end if;
  raise notice 'OK 8: un orden con SQL inyectado se ignora (orden por defecto) y no tiene efecto';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
do $$ begin
  if pg_temp.total('{}') <> 0 or pg_temp.total(jsonb_build_object('unidad', (select mosquito2 from r))) <> 0
     or pg_temp.total(jsonb_build_object('cliente', (select norte from r))) <> 0 or pg_temp.suma('{}', 'facturado_ars') <> 0 then
    raise exception 'FALLA 9: otra empresa ve viajes de Rovirosa';
  end if;
  raise notice 'OK 9: otra empresa no ve viajes ni totales de Rovirosa, ni filtrando con sus ids reales';
end $$;
