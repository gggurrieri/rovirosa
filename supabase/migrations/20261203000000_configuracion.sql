-- =============================================================================
-- Rovirosa · Sprint 7: Configuración desde la app
--   1. Blindaje entre empresas en unidades, consumo y bloqueos (deuda pendiente).
--   2. Sin duplicados "invisibles": rutas, unidades y choferes únicos sin importar
--      tildes ni mayúsculas ("Cordoba" = "Córdoba").
--   3. Guardar tarifas, unidades, choferes y datos de la empresa con sus reglas.
--   4. Vista previa al cambiar los días para vencer.
--   5. Importar tarifas en bloque (desde un Excel), todo o nada.
--   6. Mover un usuario a otra empresa: solo desde el SQL Editor (para arrancar la
--      empresa real). La app no puede hacerlo.
-- Se puede volver a correr sin error.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Blindaje entre empresas
-- -----------------------------------------------------------------------------
create or replace function public.blindar_unidad()
returns trigger
language plpgsql
as $$
begin
  perform public.verificar_misma_empresa('public.choferes', new.chofer_habitual_id, new.empresa_id, 'El chofer');
  return new;
end;
$$;
drop trigger if exists trg_blindar_unidad on public.unidades;
create trigger trg_blindar_unidad
before insert or update of chofer_habitual_id, empresa_id on public.unidades
for each row execute function public.blindar_unidad();

create or replace function public.blindar_consumo()
returns trigger
language plpgsql
as $$
begin
  perform public.verificar_misma_empresa('public.tarifas', new.tarifa_id, new.empresa_id, 'La tarifa');
  perform public.verificar_misma_empresa('public.unidades', new.unidad_id, new.empresa_id, 'La unidad');
  return new;
end;
$$;
drop trigger if exists trg_blindar_consumo on public.tarifas_consumo;
create trigger trg_blindar_consumo
before insert or update on public.tarifas_consumo
for each row execute function public.blindar_consumo();

create or replace function public.blindar_bloqueo()
returns trigger
language plpgsql
as $$
begin
  perform public.verificar_misma_empresa('public.unidades', new.unidad_id, new.empresa_id, 'La unidad');
  perform public.verificar_misma_empresa('public.choferes', new.chofer_id, new.empresa_id, 'El chofer');
  return new;
end;
$$;
drop trigger if exists trg_blindar_bloqueo on public.bloqueos_disponibilidad;
create trigger trg_blindar_bloqueo
before insert or update on public.bloqueos_disponibilidad
for each row execute function public.blindar_bloqueo();

-- Cambios en unidades y choferes también quedan en la auditoría.
drop trigger if exists trg_aud_unidades on public.unidades;
create trigger trg_aud_unidades after insert or update on public.unidades for each row execute function public.registrar_auditoria();
drop trigger if exists trg_aud_choferes on public.choferes;
create trigger trg_aud_choferes after insert or update on public.choferes for each row execute function public.registrar_auditoria();
drop trigger if exists trg_aud_empresas on public.empresas;
create trigger trg_aud_empresas after update on public.empresas for each row execute function public.registrar_auditoria();

-- -----------------------------------------------------------------------------
-- 2. Nombres sin duplicados invisibles
-- -----------------------------------------------------------------------------
create or replace function public.normalizar_texto(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(translate(lower(trim(coalesce(p, ''))), 'áéíóúüñàèìòùâêîôûäëïö', 'aeiouunaeiouaeiouaeio'), '\s+', ' ', 'g')
$$;

create unique index if not exists tarifas_ruta_unica
  on public.tarifas (empresa_id, public.normalizar_texto(origen), public.normalizar_texto(destino));
create unique index if not exists unidades_nombre_unico
  on public.unidades (empresa_id, public.normalizar_texto(nombre));
create unique index if not exists choferes_nombre_unico
  on public.choferes (empresa_id, public.normalizar_texto(nombre));

-- -----------------------------------------------------------------------------
-- 3. Guardar configuración (dueño y administrativo)
-- -----------------------------------------------------------------------------
-- Sin p_id crea; con p_id edita. Devuelve el id.
create or replace function public.guardar_tarifa(
  p_id uuid, p_origen text, p_destino text, p_km int, p_precio_centavos bigint, p_moneda text, p_activa boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para cambiar la configuración' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_origen, '')), '') is null or nullif(trim(coalesce(p_destino, '')), '') is null then
    raise exception 'Escribí origen y destino' using errcode = '22023';
  end if;
  if public.normalizar_texto(p_origen) = public.normalizar_texto(p_destino) then
    raise exception 'El origen y el destino son iguales' using errcode = '22023';
  end if;
  if coalesce(p_km, 0) <= 0 then
    raise exception 'Los km tienen que ser más que cero' using errcode = '22023';
  end if;
  if coalesce(p_precio_centavos, -1) < 0 then
    raise exception 'Revisá el precio' using errcode = '22023';
  end if;
  if coalesce(p_moneda, '') not in ('ARS', 'USD') then
    raise exception 'Elegí la moneda' using errcode = '22023';
  end if;

  begin
    if v_id is null then
      insert into public.tarifas (origen, destino, km, precio_base_centavos, moneda, activa)
      values (trim(p_origen), trim(p_destino), p_km, p_precio_centavos, p_moneda, coalesce(p_activa, true))
      returning id into v_id;
    else
      update public.tarifas
      set origen = trim(p_origen), destino = trim(p_destino), km = p_km, precio_base_centavos = p_precio_centavos,
          moneda = p_moneda, activa = coalesce(p_activa, true)
      where id = v_id;
      if not found then
        raise exception 'No se encontró la tarifa' using errcode = 'P0002';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay una tarifa de % a % (puede estar desactivada)', trim(p_origen), trim(p_destino) using errcode = '22023';
  end;
  return v_id;
end;
$$;

create or replace function public.guardar_unidad(
  p_id uuid, p_nombre text, p_patente text, p_tipo text, p_capacidad int, p_chofer_habitual_id uuid, p_activa boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_viaje record;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para cambiar la configuración' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Escribí el nombre de la unidad' using errcode = '22023';
  end if;
  if coalesce(p_tipo, '') not in ('mosquito', 'camioneta_carro', 'otro') then
    raise exception 'Elegí el tipo de unidad' using errcode = '22023';
  end if;
  if coalesce(p_capacidad, 0) <= 0 then
    raise exception 'La capacidad tiene que ser de al menos 1 auto' using errcode = '22023';
  end if;
  if p_chofer_habitual_id is not null and not exists (select 1 from public.choferes where id = p_chofer_habitual_id and activo) then
    raise exception 'El chofer habitual no existe o está desactivado' using errcode = '22023';
  end if;

  if v_id is not null then
    -- No achicar la unidad por debajo de un viaje que todavía no salió.
    select v.numero, count(*) as autos into v_viaje
    from public.viajes v join public.items_viaje i on i.viaje_id = v.id and not i.cancelado
    where v.unidad_id = v_id and v.estado in ('programado', 'reprogramado', 'en_retiro')
    group by v.id, v.numero
    having count(*) > p_capacidad
    order by count(*) desc
    limit 1;
    if found then
      raise exception 'El viaje #% lleva % autos: la capacidad no puede ser menor', v_viaje.numero, v_viaje.autos using errcode = '22023';
    end if;
  end if;

  begin
    if v_id is null then
      insert into public.unidades (nombre, patente, tipo, capacidad_autos, chofer_habitual_id, activa)
      values (trim(p_nombre), nullif(upper(trim(coalesce(p_patente, ''))), ''), p_tipo, p_capacidad, p_chofer_habitual_id, coalesce(p_activa, true))
      returning id into v_id;
    else
      update public.unidades
      set nombre = trim(p_nombre), patente = nullif(upper(trim(coalesce(p_patente, ''))), ''), tipo = p_tipo,
          capacidad_autos = p_capacidad, chofer_habitual_id = p_chofer_habitual_id, activa = coalesce(p_activa, true)
      where id = v_id;
      if not found then
        raise exception 'No se encontró la unidad' using errcode = 'P0002';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay una unidad que se llama %', trim(p_nombre) using errcode = '22023';
  end;
  return v_id;
end;
$$;

create or replace function public.guardar_chofer(p_id uuid, p_nombre text, p_telefono text, p_activo boolean)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para cambiar la configuración' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Escribí el nombre del chofer' using errcode = '22023';
  end if;
  begin
    if v_id is null then
      insert into public.choferes (nombre, telefono, activo)
      values (trim(p_nombre), nullif(trim(coalesce(p_telefono, '')), ''), coalesce(p_activo, true))
      returning id into v_id;
    else
      update public.choferes
      set nombre = trim(p_nombre), telefono = nullif(trim(coalesce(p_telefono, '')), ''), activo = coalesce(p_activo, true)
      where id = v_id;
      if not found then
        raise exception 'No se encontró el chofer' using errcode = 'P0002';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay un chofer que se llama %', trim(p_nombre) using errcode = '22023';
  end;
  -- Un chofer desactivado deja de ser el habitual de su unidad.
  if not coalesce(p_activo, true) then
    update public.unidades set chofer_habitual_id = null where chofer_habitual_id = v_id;
  end if;
  return v_id;
end;
$$;

-- La tabla empresas solo la cambia el dueño por RLS; acá también el administrativo,
-- y solo estos campos. SECURITY DEFINER con el control explícito.
create or replace function public.guardar_empresa(p_nombre text, p_cuit text, p_dias_vencimiento int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para cambiar la configuración' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Escribí el nombre de la empresa' using errcode = '22023';
  end if;
  if p_dias_vencimiento is null or p_dias_vencimiento < 0 or p_dias_vencimiento > 180 then
    raise exception 'Los días para vencer van de 0 a 180' using errcode = '22023';
  end if;
  update public.empresas
  set nombre = trim(p_nombre), cuit = nullif(trim(coalesce(p_cuit, '')), ''), dias_vencimiento = p_dias_vencimiento
  where id = public.mi_empresa();
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. ¿Qué cambia si los días para vencer pasan a p_dias?
-- -----------------------------------------------------------------------------
create or replace function public.vista_previa_vencimiento(p_dias int)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with pendientes as (
    select moneda, saldo_centavos, fecha_entrega, vencido
    from v_items_saldo
    where estado_cobro <> 'cancelado' and saldo_centavos > 0 and fecha_entrega is not null
  ),
  nuevo as (
    select *, public.hoy_ar() > fecha_entrega + greatest(p_dias, 0) as vencido_nuevo from pendientes
  )
  select jsonb_build_object(
    'actual', jsonb_build_object(
      'autos', (select count(*) from nuevo where vencido),
      'ars', (select coalesce(sum(saldo_centavos), 0) from nuevo where vencido and moneda = 'ARS'),
      'usd', (select coalesce(sum(saldo_centavos), 0) from nuevo where vencido and moneda = 'USD')),
    'nuevo', jsonb_build_object(
      'autos', (select count(*) from nuevo where vencido_nuevo),
      'ars', (select coalesce(sum(saldo_centavos), 0) from nuevo where vencido_nuevo and moneda = 'ARS'),
      'usd', (select coalesce(sum(saldo_centavos), 0) from nuevo where vencido_nuevo and moneda = 'USD'))
  )
$$;

-- -----------------------------------------------------------------------------
-- 5. Importar tarifas en bloque
-- -----------------------------------------------------------------------------
-- p_filas: [{ origen, destino, km, precio_centavos, moneda }]. Si la ruta ya existe
-- (aunque cambien tildes o mayúsculas), se actualiza y se reactiva; si no, se crea.
-- Si una fila está mal, no se guarda ninguna.
create or replace function public.importar_tarifas(p_filas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_fila    jsonb;
  v_n       int := 0;
  v_id      uuid;
  v_creadas int := 0;
  v_actualizadas int := 0;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para cambiar la configuración' using errcode = '42501';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay tarifas para importar' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) > 500 then
    raise exception 'Se importan hasta 500 tarifas por vez' using errcode = '22023';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas)
  loop
    v_n := v_n + 1;
    select id into v_id from public.tarifas
    where public.normalizar_texto(origen) = public.normalizar_texto(v_fila ->> 'origen')
      and public.normalizar_texto(destino) = public.normalizar_texto(v_fila ->> 'destino');
    begin
      perform public.guardar_tarifa(v_id, v_fila ->> 'origen', v_fila ->> 'destino', (v_fila ->> 'km')::int,
                                    (v_fila ->> 'precio_centavos')::bigint, coalesce(v_fila ->> 'moneda', 'ARS'), true);
    exception when others then
      raise exception 'Fila %: %', v_n, sqlerrm using errcode = '22023';
    end;
    if v_id is null then v_creadas := v_creadas + 1; else v_actualizadas := v_actualizadas + 1; end if;
  end loop;
  return jsonb_build_object('creadas', v_creadas, 'actualizadas', v_actualizadas);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Mover un usuario a otra empresa (solo SQL Editor, para arrancar la empresa real)
-- -----------------------------------------------------------------------------
create or replace function public.proteger_perfil()
returns trigger
language plpgsql
as $$
begin
  if (new.user_id <> old.user_id or new.empresa_id <> old.empresa_id)
     and coalesce(current_setting('rovirosa.mover_usuario', true), '') <> 'si' then
    raise exception 'No se puede cambiar la empresa de un usuario' using errcode = '22023';
  end if;
  if new.empresa_id = old.empresa_id and old.rol = 'dueno' and old.activo and (not new.activo or new.rol <> 'dueno')
     and not exists (select 1 from public.perfiles
                     where empresa_id = old.empresa_id and rol = 'dueno' and activo and user_id <> old.user_id) then
    raise exception 'La empresa tiene que tener al menos un dueño activo' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.admin_mover_usuario(p_email text, p_empresa uuid, p_rol text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.empresas where id = p_empresa) then
    raise exception 'No existe la empresa %', p_empresa;
  end if;
  perform set_config('rovirosa.mover_usuario', 'si', true);
  update public.perfiles
  set empresa_id = p_empresa, rol = coalesce(p_rol, rol), activo = true
  where user_id = (select id from auth.users where lower(email) = lower(trim(p_email)));
  if not found then
    raise exception 'No hay un usuario con el email % (tiene que haber entrado al menos una vez)', p_email;
  end if;
  perform set_config('rovirosa.mover_usuario', '', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
revoke execute on function public.guardar_tarifa(uuid, text, text, int, bigint, text, boolean) from public, anon;
revoke execute on function public.guardar_unidad(uuid, text, text, text, int, uuid, boolean) from public, anon;
revoke execute on function public.guardar_chofer(uuid, text, text, boolean) from public, anon;
revoke execute on function public.guardar_empresa(text, text, int) from public, anon;
revoke execute on function public.vista_previa_vencimiento(int) from public, anon;
revoke execute on function public.importar_tarifas(jsonb) from public, anon;
grant  execute on function public.guardar_tarifa(uuid, text, text, int, bigint, text, boolean) to authenticated;
grant  execute on function public.guardar_unidad(uuid, text, text, text, int, uuid, boolean) to authenticated;
grant  execute on function public.guardar_chofer(uuid, text, text, boolean) to authenticated;
grant  execute on function public.guardar_empresa(text, text, int) to authenticated;
grant  execute on function public.vista_previa_vencimiento(int) to authenticated;
grant  execute on function public.importar_tarifas(jsonb) to authenticated;
-- Mover usuarios: nadie desde la app, solo el SQL Editor (superusuario).
revoke execute on function public.admin_mover_usuario(text, uuid, text) from public, anon, authenticated;
