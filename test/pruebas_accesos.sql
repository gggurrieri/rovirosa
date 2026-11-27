-- Pruebas de adopción (accesos): una vez por día, quién lo ve, otra empresa, sin sesión.
-- Base con: stub_supabase.sql → stub_storage.sql → migraciones → seed.sql → reloj fijo (hoy = 25/11/2026).
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'dueno@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'otra@empresa.com'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'admin@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'baja@demo.com')
on conflict do nothing;
insert into public.empresas (id, nombre) values ('00000000-0000-4000-8000-000000000002', 'Otra transportista') on conflict do nothing;
insert into public.perfiles (user_id, empresa_id, nombre, rol, activo) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Dueño demo', 'dueno', true),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Otra', 'dueno', true),
  ('aaaaaaaa-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'Admin', 'administrativo', true),
  ('aaaaaaaa-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', 'De baja', 'administrativo', false)
on conflict do nothing;

set role authenticated;

-- 1. Registrar dos veces el mismo día deja un solo registro
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000005';
select public.registrar_acceso();
select public.registrar_acceso();
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select public.registrar_acceso();
do $$ begin
  if (select count(*) from public.accesos) <> 2 then raise exception 'FALLA 1: %', (select count(*) from public.accesos); end if;
  if exists (select 1 from public.accesos where dia <> date '2026-11-25') then raise exception 'FALLA 1: el día no es el de Argentina'; end if;
  raise notice 'OK 1: un registro por persona y por día (repetir no suma), con la fecha de Argentina';
end $$;

-- 2. El administrativo ve solo los suyos; no puede cargar ni borrar a mano
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000005';
do $$ begin
  if (select count(*) from public.accesos) <> 1 then raise exception 'FALLA 2: el administrativo ve los de otros'; end if;
  begin
    insert into public.accesos (user_id, dia) values ('aaaaaaaa-0000-4000-8000-000000000001', date '2026-11-01');
    raise exception 'FALLA 2: pudo inventar un acceso';
  exception when insufficient_privilege then null;
  end;
  delete from public.accesos;
  update public.accesos set dia = date '2026-01-01';
  raise notice 'OK 2: el administrativo ve solo sus días y no puede cargar, cambiar ni borrar registros';
end $$;

-- 3. Un usuario desactivado no registra; otra empresa no ve nada de Rovirosa
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000006';
select public.registrar_acceso();
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
do $$ begin
  if (select count(*) from public.accesos) <> 0 then raise exception 'FALLA 3: otra empresa ve accesos de Rovirosa'; end if;
  raise notice 'OK 3: otra empresa no ve los accesos de Rovirosa';
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.accesos where user_id = 'aaaaaaaa-0000-4000-8000-000000000006') then raise exception 'FALLA 3: el usuario desactivado registró'; end if;
  if (select count(*) from public.accesos) <> 2 then raise exception 'FALLA 2: algo se borró o cambió'; end if;
  raise notice 'OK 4: un usuario desactivado no registra, y nada se borró';
end $$;

-- 5. El dueño ve los de toda su empresa; sin sesión no se registra nada
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from public.accesos) <> 2 then raise exception 'FALLA 5: el dueño no ve todos'; end if;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform public.registrar_acceso();
    raise exception 'FALLA 5: sin sesión pudo llamar a registrar_acceso';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK 5: el dueño ve los días de toda su empresa; sin sesión no se puede registrar';
end $$;
