-- Pruebas del calendario en Google (link iCal). Base con migraciones + seed + reloj fijo.
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
grant execute on all functions in schema pg_temp to authenticated, anon;
create temp table t (quien text, token text);
grant all on t to authenticated, anon;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ declare a text; b text; begin
  a := public.token_calendario();
  b := public.token_calendario();
  if a <> b or length(a) < 60 then raise exception 'FALLA 1: %', a; end if;
  insert into t values ('dueno_viejo', a);
  insert into t values ('dueno', public.token_calendario(true));
  if (select token from t where quien = 'dueno') = a then raise exception 'FALLA 1: no cambió'; end if;
  raise notice 'OK 1: cada usuario tiene un link fijo y largo; "Generar uno nuevo" lo cambia';
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000005';
do $$ begin insert into t values ('admin', public.token_calendario()); end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';
do $$ begin
  perform pg_temp.espera_error('select public.token_calendario()', 'No tenés permiso', '2');
  raise notice 'OK 2: el chofer no tiene link de calendario';
end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
do $$ begin insert into t values ('otra', public.token_calendario()); end $$;

-- Lo que lee Google, sin sesión
set role anon;
set request.jwt.claim.sub = '';
do $$ declare c jsonb := public.calendario_ics((select token from t where quien = 'dueno')); begin
  if c is null or c ->> 'empresa' <> 'Rovirosa (demo)' or jsonb_array_length(c -> 'viajes') <> 12 then raise exception 'FALLA 3: %', c ->> 'empresa'; end if;
  if c::text ~* '(precio|monto|cliente|saldo|whatsapp)' then raise exception 'FALLA 3: lleva datos sensibles'; end if;
  if public.calendario_ics((select token from t where quien = 'dueno_viejo')) is not null then raise exception 'FALLA 3: el link viejo sigue andando'; end if;
  if public.calendario_ics('cualquiera') is not null then raise exception 'FALLA 3: link inventado'; end if;
  if jsonb_array_length(public.calendario_ics((select token from t where quien = 'otra')) -> 'viajes') <> 0 then raise exception 'FALLA 3: otra empresa ve viajes'; end if;
  raise notice 'OK 3: sin sesión, el link trae los 12 viajes de su empresa sin precios ni clientes; el link viejo, uno inventado u otra empresa, no';
end $$;
do $$ declare n int := 0; begin
  -- Según la instalación, sin sesión la tabla da "sin permiso" o 0 filas (RLS): las dos sirven.
  begin
    select count(*) into n from public.calendario_tokens;
  exception when insufficient_privilege then n := 0;
  end;
  if n <> 0 then raise exception 'FALLA 4: sin sesión se ven los links'; end if;
  perform pg_temp.espera_error('select public.token_calendario()', 'permission denied', '4b');
  raise notice 'OK 4: sin sesión no se pueden listar ni crear links';
end $$;

reset role;
update public.perfiles set activo = false where user_id = 'aaaaaaaa-0000-4000-8000-000000000005';
set role anon;
do $$ begin
  if public.calendario_ics((select token from t where quien = 'admin')) is not null then raise exception 'FALLA 5'; end if;
  raise notice 'OK 5: si el usuario se desactiva, su link deja de funcionar';
end $$;
