-- El script de historia de demo (supabase/demo/historia_6_meses.sql): carga 5 meses,
-- no duplica si se corre dos veces y no toca otras empresas. Reloj fijo: hoy = 25/11/2026.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'dueno@demo.com') on conflict do nothing;
insert into public.perfiles (user_id, empresa_id, nombre, rol)
values ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Dueño demo', 'dueno') on conflict do nothing;

\i supabase/demo/historia_6_meses.sql
\i supabase/demo/historia_6_meses.sql

do $$ begin
  if (select count(*) from public.viajes where notas = 'Historia de demo') <> 60 then
    raise exception 'FALLA 1: viajes %', (select count(*) from public.viajes where notas = 'Historia de demo');
  end if;
  raise notice 'OK 1: 60 viajes de jun a oct, y correrlo dos veces no duplica';
end $$;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ declare m jsonb := public.metricas(6); x jsonb; begin
  for x in select * from jsonb_array_elements(m -> 'meses') loop
    if coalesce((x -> 'facturado' ->> 'ARS')::bigint, 0) = 0 then raise exception 'FALLA 2: % sin facturado', x ->> 'mes'; end if;
  end loop;
  if coalesce((m -> 'meses' -> 3 -> 'recuperado' ->> 'ARS')::bigint, 0) = 0 then raise exception 'FALLA 2: sin recuperado en septiembre'; end if;
  if (m -> 'meses' -> 1 ->> 'dias_cobro')::int <= (m -> 'meses' -> 4 ->> 'dias_cobro')::int then
    raise exception 'FALLA 2: los días de cobro no bajan (jul % / oct %)', m -> 'meses' -> 1 ->> 'dias_cobro', m -> 'meses' -> 4 ->> 'dias_cobro';
  end if;
  if coalesce((m -> 'antiguedad' -> 4 -> 'montos' ->> 'ARS')::bigint, 0) = 0 then raise exception 'FALLA 2: no hay deuda de más de 60 días'; end if;
  raise notice 'OK 2: las métricas muestran los 6 meses, recuperado desde septiembre, días de cobro que bajan y deuda vieja';
end $$;
