-- =============================================================================
-- Rovirosa · Sprint 5a: corregir viajes y sumar usuarios sin SQL
--   1. Auditoría con motivo (y para tablas sin columna "id", como perfiles).
--   2. Reglas de edición en la base: qué se cambia según el estado del viaje,
--      el precio nunca por debajo de lo cobrado, no se quita un auto con pagos.
--   3. editar_viaje(): todos los cambios en UNA transacción, con bloqueo optimista.
--   4. Usuarios: invitaciones por email, aceptar al primer ingreso, desactivar.
-- Se puede volver a correr sin error. Las funciones corren con los permisos del
-- usuario (security invoker) salvo las de usuarios, que lo dicen explícitamente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Ayudas
-- -----------------------------------------------------------------------------
-- Plata en formato argentino para los mensajes de error: 60000000 → "$ 600.000".
create or replace function public.plata_ar(p_centavos bigint, p_moneda text default 'ARS')
returns text
language sql
immutable
as $$
  select case when p_moneda = 'USD' then 'US$ ' else '$ ' end
         || replace(to_char(p_centavos / 100, 'FM999,999,999,990'), ',', '.')
         || case when p_centavos % 100 <> 0 then ',' || lpad((abs(p_centavos) % 100)::text, 2, '0') else '' end
$$;

-- Qué se puede cambiar de un viaje en cada estado (lo usan la función y el trigger).
create or replace function public.campos_editables_viaje(p_estado text)
returns text[]
language sql
immutable
as $$
  select case
    when p_estado in ('programado', 'reprogramado')
      then array['fecha_salida', 'fecha_llegada', 'origen', 'destino', 'unidad_id', 'chofer_id', 'notas']
    when p_estado in ('en_retiro', 'en_viaje') then array['chofer_id', 'notas']
    else array['notas']
  end
$$;

create or replace function public.mensaje_edicion_viaje(p_estado text)
returns text
language sql
immutable
as $$
  select case p_estado
    when 'en_retiro' then 'El viaje ya está en retiro: solo se pueden cambiar el chofer, las notas y los precios'
    when 'en_viaje'  then 'El viaje ya está en viaje: solo se pueden cambiar el chofer, las notas y los precios'
    when 'entregado' then 'El viaje ya está entregado: solo se pueden cambiar las notas y los precios (con motivo)'
    when 'cerrado'   then 'El viaje ya está cerrado: solo se pueden cambiar las notas y los precios (con motivo)'
    when 'cancelado' then 'El viaje está cancelado: solo se pueden cambiar las notas'
    else 'Ese cambio no se puede hacer'
  end
$$;

-- -----------------------------------------------------------------------------
-- 1. Auditoría con motivo
-- -----------------------------------------------------------------------------
-- El motivo lo deja editar_viaje() en la transacción (set_config local) y lo
-- toman todas las filas de auditoría de esa transacción. Los cambios que no
-- cambian nada no se registran.
alter table public.auditoria add column if not exists motivo text;

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_fila jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;
  insert into public.auditoria (empresa_id, tabla, registro_id, accion, antes, despues, motivo)
  values (
    (v_fila ->> 'empresa_id')::uuid,
    tg_table_name,
    coalesce(v_fila ->> 'id', v_fila ->> 'user_id')::uuid,
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    nullif(current_setting('rovirosa.motivo', true), '')
  );
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Reglas de edición (valen también para cambios hechos fuera de la app)
-- -----------------------------------------------------------------------------
create or replace function public.proteger_viaje()
returns trigger
language plpgsql
as $$
begin
  if old.estado in ('programado', 'reprogramado') then
    return new;
  end if;
  if (new.fecha_salida, new.fecha_llegada_estimada, new.unidad_id, new.origen, new.destino, new.tarifa_id)
     is distinct from
     (old.fecha_salida, old.fecha_llegada_estimada, old.unidad_id, old.origen, old.destino, old.tarifa_id)
     or (new.chofer_id is distinct from old.chofer_id and old.estado not in ('en_retiro', 'en_viaje')) then
    raise exception '%', public.mensaje_edicion_viaje(old.estado) using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_viaje on public.viajes;
create trigger trg_proteger_viaje
before update on public.viajes
for each row execute function public.proteger_viaje();

create or replace function public.proteger_item()
returns trigger
language plpgsql
as $$
declare
  v_cobrado bigint;
  v_estado  text;
begin
  select coalesce(sum(a.monto_centavos), 0) into v_cobrado
  from public.aplicaciones_pago a
  join public.pagos p on p.id = a.pago_id and p.anulado_en is null
  where a.item_id = new.id;

  if new.precio_centavos <> old.precio_centavos then
    select estado into v_estado from public.viajes where id = new.viaje_id;
    if old.cancelado or v_estado = 'cancelado' then
      raise exception 'Un auto cancelado no cambia de precio' using errcode = '22023';
    end if;
    if new.precio_centavos < v_cobrado then
      raise exception 'Ya se cobraron % de este auto: el precio no puede ser menor', public.plata_ar(v_cobrado, new.moneda)
        using errcode = '22023';
    end if;
  end if;

  if new.cancelado and not old.cancelado and v_cobrado > 0 then
    raise exception 'El auto tiene pagos aplicados: no se puede quitar' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_item on public.items_viaje;
create trigger trg_proteger_item
before update of precio_centavos, cancelado on public.items_viaje
for each row execute function public.proteger_item();

-- -----------------------------------------------------------------------------
-- 3. Editar un viaje
-- -----------------------------------------------------------------------------
-- Versión del viaje para el bloqueo optimista: la pantalla la lee al abrir el
-- formulario y la devuelve al guardar. Si alguien cambió el viaje o sus autos
-- mientras tanto (por ejemplo, Rodrigo lo marcó "En viaje" desde el celular),
-- la versión no coincide y no se pisa nada.
create or replace function public.version_viaje(p_viaje_id uuid)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select md5(
    coalesce((select row(v.*)::text from public.viajes v where v.id = p_viaje_id), '')
    || coalesce((select string_agg(row(i.*)::text, '|' order by i.id) from public.items_viaje i where i.viaje_id = p_viaje_id), '')
  )
$$;

-- p_cambios (todas las claves son opcionales; solo viaja lo que cambió):
--   viaje:   { fecha_salida, fecha_llegada, origen, destino, unidad_id, chofer_id, notas }
--   precios: [{ item_id, precio_centavos }]
--   quitar:  [item_id]                     (se marcan cancelados: nada se borra)
--   agregar: [ mismos ítems que crear_viaje ]
create or replace function public.editar_viaje(
  p_viaje_id  uuid,
  p_version   text,
  p_cambios   jsonb,
  p_motivo    text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v          public.viajes%rowtype;
  d          jsonb := coalesce(p_cambios -> 'viaje', '{}'::jsonb);
  v_precios  jsonb := coalesce(p_cambios -> 'precios', '[]'::jsonb);
  v_quitar   jsonb := coalesce(p_cambios -> 'quitar', '[]'::jsonb);
  v_agregar  jsonb := coalesce(p_cambios -> 'agregar', '[]'::jsonb);
  v_motivo   text := nullif(trim(coalesce(p_motivo, '')), '');
  v_campo    text;
  v_cambios  int := 0;
  v_elem     jsonb;
  v_salida   date;
  v_llegada  date;
  v_origen   text;
  v_destino  text;
  v_unidad   uuid;
  v_capacidad int;
  v_activos  int;
  v_moneda   text;
  v_nuevos   jsonb := '{}'::jsonb;
  v_clave    text;
  v_cliente  uuid;
  v_vehiculo uuid;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para editar viajes' using errcode = '42501';
  end if;
  if jsonb_typeof(d) <> 'object' or jsonb_typeof(v_precios) <> 'array'
     or jsonb_typeof(v_quitar) <> 'array' or jsonb_typeof(v_agregar) <> 'array' then
    raise exception 'No pudimos leer los cambios' using errcode = '22023';
  end if;

  select * into v from public.viajes where id = p_viaje_id for update;
  if not found then
    raise exception 'No se encontró el viaje' using errcode = 'P0002';
  end if;
  if public.version_viaje(p_viaje_id) is distinct from p_version then
    raise exception 'El viaje cambió mientras lo editabas. Recargá la página para ver los cambios' using errcode = 'P0001';
  end if;

  perform set_config('rovirosa.motivo', coalesce(v_motivo, ''), true);

  -- Qué se puede tocar en este estado
  for v_campo in select jsonb_object_keys(d)
  loop
    if not v_campo = any (public.campos_editables_viaje('programado')) then
      raise exception 'No pudimos leer los cambios' using errcode = '22023';
    end if;
    if not v_campo = any (public.campos_editables_viaje(v.estado)) then
      raise exception '%', public.mensaje_edicion_viaje(v.estado) using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(v_precios) > 0 then
    if v.estado = 'cancelado' then
      raise exception '%', public.mensaje_edicion_viaje(v.estado) using errcode = '22023';
    end if;
    if v.estado in ('entregado', 'cerrado') and v_motivo is null then
      raise exception 'Escribí el motivo del cambio de precio' using errcode = '22023';
    end if;
  end if;
  if (jsonb_array_length(v_quitar) > 0 or jsonb_array_length(v_agregar) > 0)
     and v.estado not in ('programado', 'reprogramado') then
    raise exception 'Solo se agregan o quitan autos antes de que salga el viaje' using errcode = '22023';
  end if;

  -- Datos del viaje: se calculan los valores finales y se validan antes de guardar
  if d <> '{}'::jsonb then
    v_salida  := case when d ? 'fecha_salida'  then (d ->> 'fecha_salida')::date  else v.fecha_salida end;
    v_llegada := case when d ? 'fecha_llegada' then (d ->> 'fecha_llegada')::date else v.fecha_llegada_estimada end;
    v_origen  := case when d ? 'origen'  then trim(d ->> 'origen')  else v.origen end;
    v_destino := case when d ? 'destino' then trim(d ->> 'destino') else v.destino end;
    v_unidad  := case when d ? 'unidad_id' then (d ->> 'unidad_id')::uuid else v.unidad_id end;

    if v_salida is null then
      raise exception 'Revisá la fecha de salida' using errcode = '22023';
    end if;
    if v_llegada is not null and v_llegada < v_salida then
      raise exception 'La llegada no puede ser antes de la salida' using errcode = '22023';
    end if;
    if coalesce(v_origen, '') = '' or coalesce(v_destino, '') = '' then
      raise exception 'Escribí origen y destino' using errcode = '22023';
    end if;
    if lower(v_origen) = lower(v_destino) then
      raise exception 'El origen y el destino son iguales' using errcode = '22023';
    end if;
    if d ? 'unidad_id' and not exists (select 1 from public.unidades where id = v_unidad and activa) then
      raise exception 'Elegí la unidad' using errcode = '22023';
    end if;

    update public.viajes
    set fecha_salida           = v_salida,
        fecha_llegada_estimada = v_llegada,
        origen                 = v_origen,
        destino                = v_destino,
        tarifa_id              = case when v_origen = v.origen and v_destino = v.destino then tarifa_id end,
        unidad_id              = v_unidad,
        chofer_id              = case when d ? 'chofer_id' then (d ->> 'chofer_id')::uuid else chofer_id end,
        notas                  = case when d ? 'notas' then nullif(trim(d ->> 'notas'), '') else notas end
    where id = p_viaje_id;
    v_cambios := v_cambios + (select count(*) from jsonb_object_keys(d));
  end if;

  -- Precios
  for v_elem in select * from jsonb_array_elements(v_precios)
  loop
    if (v_elem ->> 'precio_centavos') is null or (v_elem ->> 'precio_centavos')::bigint < 0 then
      raise exception 'Revisá el precio' using errcode = '22023';
    end if;
    update public.items_viaje
    set precio_centavos = (v_elem ->> 'precio_centavos')::bigint
    where id = (v_elem ->> 'item_id')::uuid and viaje_id = p_viaje_id and not cancelado;
    if not found then
      raise exception 'El auto no es de este viaje' using errcode = '22023';
    end if;
    v_cambios := v_cambios + 1;
  end loop;

  -- Quitar autos (cancelados, no borrados; el trigger impide quitar uno con pagos)
  for v_elem in select * from jsonb_array_elements(v_quitar)
  loop
    update public.items_viaje set cancelado = true
    where id = (v_elem #>> '{}')::uuid and viaje_id = p_viaje_id and not cancelado;
    if not found then
      raise exception 'El auto no es de este viaje' using errcode = '22023';
    end if;
    v_cambios := v_cambios + 1;
  end loop;

  -- Agregar autos (igual que en crear_viaje)
  select moneda into v_moneda from public.items_viaje where viaje_id = p_viaje_id order by creado_en limit 1;
  for v_elem in select * from jsonb_array_elements(v_agregar)
  loop
    if v_elem ? 'cliente_id' then
      v_cliente := (v_elem ->> 'cliente_id')::uuid;
    else
      v_clave := lower(trim(v_elem -> 'cliente_nuevo' ->> 'nombre'));
      if v_clave is null or v_clave = '' then
        raise exception 'Falta el nombre del cliente nuevo' using errcode = '22023';
      end if;
      if v_nuevos ? v_clave then
        v_cliente := (v_nuevos ->> v_clave)::uuid;
      else
        insert into public.clientes (nombre, whatsapp)
        values (trim(v_elem -> 'cliente_nuevo' ->> 'nombre'), nullif(trim(v_elem -> 'cliente_nuevo' ->> 'whatsapp'), ''))
        returning id into v_cliente;
        v_nuevos := v_nuevos || jsonb_build_object(v_clave, v_cliente);
      end if;
    end if;

    if v_elem ? 'vehiculo_id' then
      v_vehiculo := (v_elem ->> 'vehiculo_id')::uuid;
      if not exists (select 1 from public.vehiculos where id = v_vehiculo and cliente_id = v_cliente) then
        raise exception 'El vehículo no es de ese cliente' using errcode = '22023';
      end if;
    else
      if nullif(trim(v_elem -> 'vehiculo' ->> 'marca'), '') is null or nullif(trim(v_elem -> 'vehiculo' ->> 'modelo'), '') is null then
        raise exception 'Falta la marca o el modelo de un auto' using errcode = '22023';
      end if;
      insert into public.vehiculos (cliente_id, marca, modelo)
      values (v_cliente, trim(v_elem -> 'vehiculo' ->> 'marca'), trim(v_elem -> 'vehiculo' ->> 'modelo'))
      returning id into v_vehiculo;
    end if;

    if (v_elem ->> 'precio_centavos') is null or (v_elem ->> 'precio_centavos')::bigint < 0 then
      raise exception 'Revisá el precio' using errcode = '22023';
    end if;
    insert into public.items_viaje (viaje_id, cliente_id, vehiculo_id, precio_centavos, moneda)
    values (p_viaje_id, v_cliente, v_vehiculo, (v_elem ->> 'precio_centavos')::bigint, coalesce(v_moneda, 'ARS'));
    v_cambios := v_cambios + 1;
  end loop;

  -- Capacidad de la unidad y al menos un auto
  if d ? 'unidad_id' or jsonb_array_length(v_quitar) > 0 or jsonb_array_length(v_agregar) > 0 then
    select u.capacidad_autos, u.nombre into v_capacidad, v_clave
    from public.unidades u join public.viajes vi on vi.unidad_id = u.id where vi.id = p_viaje_id;
    select count(*) into v_activos from public.items_viaje where viaje_id = p_viaje_id and not cancelado;
    if v_activos = 0 then
      raise exception 'El viaje tiene que tener al menos un auto' using errcode = '22023';
    end if;
    if v_capacidad is not null and v_activos > v_capacidad then
      raise exception '% lleva hasta % autos', v_clave, v_capacidad using errcode = '22023';
    end if;
  end if;

  return jsonb_build_object('cambios', v_cambios);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Usuarios
-- -----------------------------------------------------------------------------
-- 4a. Perfiles: activo (desactivar en vez de borrar) y email (para listarlos).
alter table public.perfiles add column if not exists activo boolean not null default true;
alter table public.perfiles add column if not exists email text;
update public.perfiles p set email = lower(u.email)
from auth.users u
where u.id = p.user_id and p.email is null;

-- Un usuario desactivado deja de tener empresa y rol: RLS le oculta todo al instante.
create or replace function public.mi_empresa()
returns uuid
language sql stable security definer set search_path = public
as $$ select empresa_id from public.perfiles where user_id = auth.uid() and activo $$;

create or replace function public.mi_rol()
returns text
language sql stable security definer set search_path = public
as $$ select rol from public.perfiles where user_id = auth.uid() and activo $$;

-- Siempre queda al menos un dueño activo, y nadie se cambia de empresa.
create or replace function public.proteger_perfil()
returns trigger
language plpgsql
as $$
begin
  if new.user_id <> old.user_id or new.empresa_id <> old.empresa_id then
    raise exception 'No se puede cambiar la empresa de un usuario' using errcode = '22023';
  end if;
  if old.rol = 'dueno' and old.activo and (not new.activo or new.rol <> 'dueno')
     and not exists (select 1 from public.perfiles
                     where empresa_id = old.empresa_id and rol = 'dueno' and activo and user_id <> old.user_id) then
    raise exception 'La empresa tiene que tener al menos un dueño activo' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- El email de un perfil cargado a mano (como el primero, con SQL) sale de auth.users.
create or replace function public.completar_email_perfil()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.email is null then
    select lower(email) into new.email from auth.users where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_completar_email_perfil on public.perfiles;
create trigger trg_completar_email_perfil
before insert on public.perfiles
for each row execute function public.completar_email_perfil();

drop trigger if exists trg_proteger_perfil on public.perfiles;
create trigger trg_proteger_perfil
before update on public.perfiles
for each row execute function public.proteger_perfil();

drop trigger if exists trg_aud_perfiles on public.perfiles;
create trigger trg_aud_perfiles
after insert or update on public.perfiles
for each row execute function public.registrar_auditoria();

-- 4b. Invitaciones: el dueño invita por email; la persona se registra con ese email.
create table if not exists public.invitaciones (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null default public.mi_empresa() references public.empresas (id),
  email         text not null check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nombre        text not null check (length(trim(nombre)) between 1 and 80),
  rol           text not null check (rol in ('dueno', 'administrativo')),
  creada_por    uuid default auth.uid(),
  creado_en     timestamptz not null default now(),
  vence_en      timestamptz not null default now() + interval '7 days',
  aceptada_en   timestamptz,
  aceptada_por  uuid,
  anulada_en    timestamptz
);

create unique index if not exists invitaciones_pendiente_unica
  on public.invitaciones (empresa_id, email)
  where aceptada_en is null and anulada_en is null;

alter table public.invitaciones enable row level security;

drop policy if exists invitaciones_select on public.invitaciones;
create policy invitaciones_select on public.invitaciones for select to authenticated
  using (empresa_id = public.mi_empresa() and public.mi_rol() = 'dueno');
drop policy if exists invitaciones_insert on public.invitaciones;
create policy invitaciones_insert on public.invitaciones for insert to authenticated
  with check (empresa_id = public.mi_empresa() and public.mi_rol() = 'dueno');
drop policy if exists invitaciones_update on public.invitaciones;
create policy invitaciones_update on public.invitaciones for update to authenticated
  using (empresa_id = public.mi_empresa() and public.mi_rol() = 'dueno')
  with check (empresa_id = public.mi_empresa());

drop trigger if exists trg_aud_invitaciones on public.invitaciones;
create trigger trg_aud_invitaciones
after insert or update on public.invitaciones
for each row execute function public.registrar_auditoria();

create or replace function public.invitar_usuario(p_email text, p_nombre text, p_rol text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id    uuid;
begin
  if coalesce(public.mi_rol(), '') <> 'dueno' then
    raise exception 'Solo el dueño puede invitar usuarios' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Revisá el email: no parece válido' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Escribí el nombre' using errcode = '22023';
  end if;
  if coalesce(p_rol, '') not in ('dueno', 'administrativo') then
    raise exception 'Elegí el rol' using errcode = '22023';
  end if;
  if exists (select 1 from public.perfiles where empresa_id = public.mi_empresa() and lower(email) = v_email) then
    raise exception 'Ya hay un usuario con ese email' using errcode = '22023';
  end if;

  -- Una invitación vencida no bloquea invitar de nuevo: se anula sola.
  update public.invitaciones set anulada_en = now()
  where email = v_email and aceptada_en is null and anulada_en is null and vence_en <= now();
  if exists (select 1 from public.invitaciones where email = v_email and aceptada_en is null and anulada_en is null) then
    raise exception 'Ya hay una invitación pendiente para ese email' using errcode = '22023';
  end if;

  insert into public.invitaciones (email, nombre, rol)
  values (v_email, trim(p_nombre), p_rol)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.anular_invitacion(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(public.mi_rol(), '') <> 'dueno' then
    raise exception 'Solo el dueño puede anular invitaciones' using errcode = '42501';
  end if;
  update public.invitaciones set anulada_en = now()
  where id = p_id and aceptada_en is null and anulada_en is null;
  if not found then
    raise exception 'La invitación ya no está pendiente' using errcode = '22023';
  end if;
end;
$$;

-- Se llama al entrar a la app. Si el usuario no tiene perfil, busca una invitación
-- vigente para su email CONFIRMADO y le crea el perfil. SECURITY DEFINER porque el
-- usuario todavía no tiene empresa (RLS no le dejaría ver ni la invitación).
-- Devuelve: activo | desactivado | aceptada | sin_confirmar | sin_invitacion | sin_sesion
create or replace function public.aceptar_invitacion()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_activo    boolean;
  v_email     text;
  v_confirmado timestamptz;
  v_inv       public.invitaciones%rowtype;
begin
  if v_uid is null then
    return 'sin_sesion';
  end if;
  select activo into v_activo from public.perfiles where user_id = v_uid;
  if found then
    return case when v_activo then 'activo' else 'desactivado' end;
  end if;

  select lower(email), email_confirmed_at into v_email, v_confirmado from auth.users where id = v_uid;
  if v_email is null or v_confirmado is null then
    return 'sin_confirmar';
  end if;

  select * into v_inv from public.invitaciones
  where email = v_email and aceptada_en is null and anulada_en is null and vence_en > now()
  order by creado_en desc
  limit 1
  for update;
  if not found then
    return 'sin_invitacion';
  end if;

  insert into public.perfiles (user_id, empresa_id, nombre, rol, email)
  values (v_uid, v_inv.empresa_id, v_inv.nombre, v_inv.rol, v_email);
  update public.invitaciones set aceptada_en = now(), aceptada_por = v_uid where id = v_inv.id;
  return 'aceptada';
end;
$$;

-- Desactivar o reactivar a alguien de la empresa. SECURITY DEFINER porque perfiles
-- no tiene política de update: este es el único camino, con sus controles.
create or replace function public.cambiar_activo_usuario(p_user_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.mi_rol(), '') <> 'dueno' then
    raise exception 'Solo el dueño puede cambiar usuarios' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and not p_activo then
    raise exception 'No podés desactivarte a vos mismo' using errcode = '22023';
  end if;
  update public.perfiles set activo = p_activo
  where user_id = p_user_id and empresa_id = public.mi_empresa();
  if not found then
    raise exception 'No se encontró el usuario' using errcode = 'P0002';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos: solo usuarios logueados
-- -----------------------------------------------------------------------------
revoke execute on function public.version_viaje(uuid) from public, anon;
revoke execute on function public.editar_viaje(uuid, text, jsonb, text) from public, anon;
revoke execute on function public.invitar_usuario(text, text, text) from public, anon;
revoke execute on function public.anular_invitacion(uuid) from public, anon;
revoke execute on function public.aceptar_invitacion() from public, anon;
revoke execute on function public.cambiar_activo_usuario(uuid, boolean) from public, anon;
grant  execute on function public.version_viaje(uuid) to authenticated;
grant  execute on function public.editar_viaje(uuid, text, jsonb, text) to authenticated;
grant  execute on function public.invitar_usuario(text, text, text) to authenticated;
grant  execute on function public.anular_invitacion(uuid) to authenticated;
grant  execute on function public.aceptar_invitacion() to authenticated;
grant  execute on function public.cambiar_activo_usuario(uuid, boolean) to authenticated;
