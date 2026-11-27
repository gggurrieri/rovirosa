-- El script supabase/admin/arrancar_empresa_real.sql: crea la empresa limpia, copia la
-- flota, pasa al dueño, invita al administrativo y no duplica si se corre dos veces.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'gabi@correo.com') on conflict do nothing;
insert into public.perfiles (user_id, empresa_id, nombre, rol)
values ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Gabi', 'dueno') on conflict do nothing;

\! sed -e "s/'TU_EMAIL@ejemplo.com'/'gabi@correo.com'/" -e "s/v_email_admin      text    := null;/v_email_admin text := 'admin@correo.com';/" supabase/admin/arrancar_empresa_real.sql > /tmp/arranque_completo.sql
\i /tmp/arranque_completo.sql
\i /tmp/arranque_completo.sql

do $$ declare e uuid := (select id from public.empresas where nombre = 'Rovirosa'); begin
  if (select count(*) from public.empresas where nombre = 'Rovirosa') <> 1 then raise exception 'FALLA 1: empresas'; end if;
  if (select empresa_id from public.perfiles where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') <> e then raise exception 'FALLA 1: el dueño no se movió'; end if;
  if (select count(*) from public.unidades where empresa_id = e) <> 3 or (select count(*) from public.choferes where empresa_id = e) <> 3 then raise exception 'FALLA 1: flota'; end if;
  if exists (select 1 from public.unidades where empresa_id = e and chofer_habitual_id is not null
             and chofer_habitual_id not in (select id from public.choferes where empresa_id = e)) then raise exception 'FALLA 1: chofer de otra empresa'; end if;
  if (select count(*) from public.tarifas where empresa_id = e) <> 0 or (select count(*) from public.viajes where empresa_id = e) <> 0 then raise exception 'FALLA 1: no está limpia'; end if;
  if not exists (select 1 from public.invitaciones where empresa_id = e and email = 'admin@correo.com' and rol = 'administrativo') then raise exception 'FALLA 1: invitación'; end if;
  raise notice 'OK 1: empresa limpia con la flota de la demo, el dueño adentro, invitación al administrativo; correrlo dos veces no duplica';
end $$;
