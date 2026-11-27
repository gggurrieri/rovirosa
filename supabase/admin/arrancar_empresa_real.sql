-- =============================================================================
-- Rovirosa · Arrancar la empresa real (se corre UNA vez, a mano, en el SQL Editor)
--   1. Crea la empresa limpia (sin datos de prueba), con los datos para cobrar y
--      los días para vencer de la empresa demo.
--   2. Si se pide, copia la flota de la demo (unidades y choferes) para no
--      cargarla de nuevo. Las tarifas NO se copian: las de la demo son ficticias
--      (cargá las reales en Configuración → Tarifas o importalas desde Excel).
--   3. Pasa tu usuario a la empresa nueva como dueño (y el del administrativo, si
--      ya existe; si no, le deja una invitación).
--   4. Opcional: deja una invitación en la empresa demo para otro email tuyo, así
--      podés seguir mostrando la demo.
-- ANTES DE CORRER: cambiá los datos de "Completá acá".
-- Si se corre de nuevo, no crea otra empresa: usa la que ya existe con ese nombre.
-- =============================================================================
do $$
declare
  -- ---- Completá acá ---------------------------------------------------------
  v_nombre           text    := 'Rovirosa';
  v_email_dueno      text    := 'TU_EMAIL@ejemplo.com';
  v_email_admin      text    := null;     -- 'administrativo@ejemplo.com' o null
  v_copiar_flota     boolean := true;     -- copiar unidades y choferes de la demo
  v_email_demo       text    := null;     -- otro email tuyo para seguir viendo la demo, o null
  -- --------------------------------------------------------------------------
  v_demo    constant uuid := '00000000-0000-4000-8000-000000000001';
  v_empresa uuid;
  v_chofer  record;
  v_unidad  record;
begin
  if v_email_dueno like '%ejemplo.com' then
    raise exception 'Cambiá el email del dueño en "Completá acá" antes de correr el script';
  end if;
  if not exists (select 1 from auth.users where lower(email) = lower(trim(v_email_dueno))) then
    raise exception 'No hay un usuario con el email %: tiene que existir antes (Authentication → Users)', v_email_dueno;
  end if;

  select id into v_empresa from public.empresas where nombre = v_nombre and id <> v_demo;
  if v_empresa is null then
    insert into public.empresas (nombre, dias_vencimiento, datos_cobro, mensaje_recordatorio)
    select v_nombre, dias_vencimiento, datos_cobro, mensaje_recordatorio from public.empresas where id = v_demo
    returning id into v_empresa;
    if v_empresa is null then
      insert into public.empresas (nombre) values (v_nombre) returning id into v_empresa;
    end if;
    raise notice 'Empresa "%" creada (id %).', v_nombre, v_empresa;

    if v_copiar_flota then
      for v_chofer in select nombre, telefono from public.choferes where empresa_id = v_demo and activo loop
        insert into public.choferes (empresa_id, nombre, telefono) values (v_empresa, v_chofer.nombre, v_chofer.telefono);
      end loop;
      for v_unidad in
        select u.nombre, u.patente, u.tipo, u.capacidad_autos, c.nombre as chofer
        from public.unidades u left join public.choferes c on c.id = u.chofer_habitual_id
        where u.empresa_id = v_demo and u.activa
      loop
        insert into public.unidades (empresa_id, nombre, patente, tipo, capacidad_autos, chofer_habitual_id)
        values (v_empresa, v_unidad.nombre, v_unidad.patente, v_unidad.tipo, v_unidad.capacidad_autos,
                (select id from public.choferes where empresa_id = v_empresa and nombre = v_unidad.chofer));
      end loop;
      raise notice 'Flota copiada: revisá nombres, patentes y capacidades en Configuración.';
    end if;
  else
    raise notice 'La empresa "%" ya existía: no se creó otra.', v_nombre;
  end if;

  if v_email_demo is not null then
    insert into public.invitaciones (empresa_id, email, nombre, rol)
    values (v_demo, lower(trim(v_email_demo)), 'Demo', 'dueno')
    on conflict do nothing;
    raise notice 'Invitación a la demo para % (creá ese usuario en /registro).', v_email_demo;
  end if;

  perform public.admin_mover_usuario(v_email_dueno, v_empresa, 'dueno');
  raise notice '% ahora es dueño de "%".', v_email_dueno, v_nombre;

  if v_email_admin is not null then
    if exists (select 1 from public.perfiles p join auth.users u on u.id = p.user_id where lower(u.email) = lower(trim(v_email_admin))) then
      perform public.admin_mover_usuario(v_email_admin, v_empresa, 'administrativo');
      raise notice '% ahora es administrativo de "%".', v_email_admin, v_nombre;
    else
      insert into public.invitaciones (empresa_id, email, nombre, rol)
      values (v_empresa, lower(trim(v_email_admin)), 'Administrativo', 'administrativo')
      on conflict do nothing;
      raise notice 'Invitación para % como administrativo de "%".', v_email_admin, v_nombre;
    end if;
  end if;
end $$;
