-- =============================================================================
-- Rovirosa · Sprint 3: cargar viajes y seguir su estado
--   1. Blindaje entre empresas en viajes, ítems y vehículos (deuda del sprint 2).
--   2. crear_viaje(): viaje + clientes nuevos + vehículos + ítems en UNA transacción.
--   3. cambiar_estado_viaje(): solo pasos válidos, fecha de entrega, deshacer, cancelar.
-- Se puede volver a correr sin error. Todo corre con los permisos del usuario
-- (security invoker): RLS y los triggers siguen protegiendo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Blindaje entre empresas
-- -----------------------------------------------------------------------------
-- Las claves foráneas de Postgres no miran RLS: una empresa podía apuntar a la
-- unidad, el cliente o el viaje de otra si conocía el id. Estas verificaciones
-- buscan la fila con los permisos del usuario: si es de otra empresa, no la ve
-- y se rechaza como "no existe".
create or replace function public.verificar_misma_empresa(
  p_tabla regclass, p_id uuid, p_empresa uuid, p_que text
)
returns void
language plpgsql
as $$
declare
  v_empresa uuid;
begin
  if p_id is null then
    return;
  end if;
  execute format('select empresa_id from %s where id = $1', p_tabla) into v_empresa using p_id;
  if v_empresa is distinct from p_empresa then
    raise exception '% no existe', p_que;
  end if;
end;
$$;

create or replace function public.blindar_viaje()
returns trigger
language plpgsql
as $$
begin
  perform public.verificar_misma_empresa('public.unidades', new.unidad_id, new.empresa_id, 'La unidad');
  perform public.verificar_misma_empresa('public.choferes', new.chofer_id, new.empresa_id, 'El chofer');
  perform public.verificar_misma_empresa('public.tarifas', new.tarifa_id, new.empresa_id, 'La tarifa');
  return new;
end;
$$;

create or replace function public.blindar_item()
returns trigger
language plpgsql
as $$
begin
  perform public.verificar_misma_empresa('public.viajes', new.viaje_id, new.empresa_id, 'El viaje');
  perform public.verificar_misma_empresa('public.clientes', new.cliente_id, new.empresa_id, 'El cliente');
  perform public.verificar_misma_empresa('public.vehiculos', new.vehiculo_id, new.empresa_id, 'El vehículo');
  return new;
end;
$$;

create or replace function public.blindar_vehiculo()
returns trigger
language plpgsql
as $$
begin
  perform public.verificar_misma_empresa('public.clientes', new.cliente_id, new.empresa_id, 'El cliente');
  return new;
end;
$$;

drop trigger if exists trg_blindar_viaje on public.viajes;
create trigger trg_blindar_viaje
before insert or update of unidad_id, chofer_id, tarifa_id, empresa_id on public.viajes
for each row execute function public.blindar_viaje();

drop trigger if exists trg_blindar_item on public.items_viaje;
create trigger trg_blindar_item
before insert or update of viaje_id, cliente_id, vehiculo_id, empresa_id on public.items_viaje
for each row execute function public.blindar_item();

drop trigger if exists trg_blindar_vehiculo on public.vehiculos;
create trigger trg_blindar_vehiculo
before insert or update of cliente_id, empresa_id on public.vehiculos
for each row execute function public.blindar_vehiculo();

-- -----------------------------------------------------------------------------
-- 2. Crear un viaje completo, todo o nada
-- -----------------------------------------------------------------------------
-- p_id lo genera la app al abrir el formulario: un doble envío no crea dos viajes.
-- p_items: [{ "cliente_id": "..." | "cliente_nuevo": {"nombre": "...", "whatsapp": "..."},
--             "vehiculo_id": "..." | "vehiculo": {"marca": "...", "modelo": "..."},
--             "precio_centavos": 95000000 }, ...]
-- Un mismo cliente nuevo en varios autos del viaje se crea una sola vez.
create or replace function public.crear_viaje(
  p_id             uuid,
  p_fecha_salida   date,
  p_fecha_llegada  date,
  p_origen         text,
  p_destino        text,
  p_tarifa_id      uuid,
  p_moneda         text,
  p_unidad_id      uuid,
  p_chofer_id      uuid,
  p_notas          text,
  p_items          jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_numero     bigint;
  v_capacidad  int;
  v_item       jsonb;
  v_cliente    uuid;
  v_vehiculo   uuid;
  v_nuevos     jsonb := '{}'::jsonb;
  v_clave      text;
  v_marca      text;
  v_modelo     text;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para cargar viajes' using errcode = '42501';
  end if;

  select numero into v_numero from public.viajes where id = p_id;
  if found then
    return jsonb_build_object('viaje_id', p_id, 'numero', v_numero, 'duplicado', true);
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agregá al menos un auto' using errcode = '22023';
  end if;

  select capacidad_autos into v_capacidad from public.unidades where id = p_unidad_id and activa;
  if v_capacidad is null then
    raise exception 'La unidad no existe' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > v_capacidad then
    raise exception 'La unidad lleva hasta % autos', v_capacidad using errcode = '22023';
  end if;

  begin
    insert into public.viajes (id, fecha_salida, fecha_llegada_estimada, unidad_id, chofer_id,
                               origen, destino, tarifa_id, notas)
    values (p_id, p_fecha_salida, p_fecha_llegada, p_unidad_id, p_chofer_id,
            trim(p_origen), trim(p_destino), p_tarifa_id, nullif(trim(p_notas), ''))
    returning numero into v_numero;
  exception when unique_violation then
    select numero into v_numero from public.viajes where id = p_id;
    return jsonb_build_object('viaje_id', p_id, 'numero', v_numero, 'duplicado', true);
  end;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Cliente: existente, o nuevo (uno solo por nombre dentro del viaje)
    if v_item ? 'cliente_id' then
      v_cliente := (v_item ->> 'cliente_id')::uuid;
    else
      v_clave := lower(trim(v_item -> 'cliente_nuevo' ->> 'nombre'));
      if v_clave is null or v_clave = '' then
        raise exception 'Falta el nombre del cliente nuevo' using errcode = '22023';
      end if;
      if v_nuevos ? v_clave then
        v_cliente := (v_nuevos ->> v_clave)::uuid;
      else
        insert into public.clientes (nombre, whatsapp)
        values (trim(v_item -> 'cliente_nuevo' ->> 'nombre'),
                nullif(trim(v_item -> 'cliente_nuevo' ->> 'whatsapp'), ''))
        returning id into v_cliente;
        v_nuevos := v_nuevos || jsonb_build_object(v_clave, v_cliente);
      end if;
    end if;

    -- Vehículo: uno que ya trajo ese cliente, o uno nuevo
    if v_item ? 'vehiculo_id' then
      v_vehiculo := (v_item ->> 'vehiculo_id')::uuid;
      if not exists (select 1 from public.vehiculos where id = v_vehiculo and cliente_id = v_cliente) then
        raise exception 'El vehículo no es de ese cliente' using errcode = '22023';
      end if;
    else
      v_marca  := nullif(trim(v_item -> 'vehiculo' ->> 'marca'), '');
      v_modelo := nullif(trim(v_item -> 'vehiculo' ->> 'modelo'), '');
      if v_marca is null or v_modelo is null then
        raise exception 'Falta la marca o el modelo de un auto' using errcode = '22023';
      end if;
      insert into public.vehiculos (cliente_id, marca, modelo)
      values (v_cliente, v_marca, v_modelo)
      returning id into v_vehiculo;
    end if;

    insert into public.items_viaje (viaje_id, cliente_id, vehiculo_id, precio_centavos, moneda)
    values (p_id, v_cliente, v_vehiculo, (v_item ->> 'precio_centavos')::bigint, coalesce(p_moneda, 'ARS'));
  end loop;

  return jsonb_build_object('viaje_id', p_id, 'numero', v_numero, 'duplicado', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Cambiar el estado de un viaje
-- -----------------------------------------------------------------------------
-- p_desde es el estado que vio la pantalla: si otro lo cambió mientras tanto, se
-- rechaza en vez de pisarlo. Pasos válidos: avanzar uno, deshacer uno, o cancelar
-- un viaje que no salió y no tiene pagos (cancelar con anticipo: sprint 4).
create or replace function public.cambiar_estado_viaje(
  p_viaje_id       uuid,
  p_desde          text,
  p_hacia          text,
  p_fecha_entrega  date default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado  text;
  v_salida  date;
  v_fecha   date;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para cambiar viajes' using errcode = '42501';
  end if;

  select estado, fecha_salida into v_estado, v_salida
  from public.viajes where id = p_viaje_id for update;
  if not found then
    raise exception 'No se encontró el viaje' using errcode = 'P0002';
  end if;
  if v_estado <> p_desde then
    raise exception 'El viaje cambió mientras lo mirabas. Recargá la página';
  end if;

  if (p_desde, p_hacia) not in (
    ('programado', 'en_retiro'), ('reprogramado', 'en_retiro'), ('en_retiro', 'en_viaje'),
    ('en_viaje', 'entregado'), ('entregado', 'cerrado'),
    ('en_retiro', 'programado'), ('en_viaje', 'en_retiro'), ('entregado', 'en_viaje'), ('cerrado', 'entregado'),
    ('programado', 'cancelado'), ('reprogramado', 'cancelado'), ('en_retiro', 'cancelado')
  ) then
    raise exception 'No se puede pasar de % a %', p_desde, p_hacia using errcode = '22023';
  end if;

  if p_hacia = 'cancelado' and exists (
    select 1
    from public.aplicaciones_pago a
    join public.pagos p on p.id = a.pago_id and p.anulado_en is null
    join public.items_viaje i on i.id = a.item_id
    where i.viaje_id = p_viaje_id
  ) then
    raise exception 'El viaje ya tiene pagos aplicados y todavía no se puede cancelar' using errcode = '22023';
  end if;

  if p_desde = 'en_viaje' and p_hacia = 'entregado' then
    v_fecha := coalesce(p_fecha_entrega, public.hoy_ar());
    if v_fecha > public.hoy_ar() then
      raise exception 'La fecha de entrega no puede ser posterior a hoy' using errcode = '22023';
    end if;
    if v_fecha < v_salida then
      raise exception 'La fecha de entrega no puede ser antes de la salida' using errcode = '22023';
    end if;
    update public.items_viaje set fecha_entrega = v_fecha
    where viaje_id = p_viaje_id and not cancelado;
  elsif p_desde = 'entregado' and p_hacia = 'en_viaje' then
    update public.items_viaje set fecha_entrega = null where viaje_id = p_viaje_id;
  elsif p_hacia = 'cancelado' then
    update public.items_viaje set cancelado = true where viaje_id = p_viaje_id;
  end if;

  update public.viajes set estado = p_hacia where id = p_viaje_id;
end;
$$;

revoke execute on function public.crear_viaje(uuid, date, date, text, text, uuid, text, uuid, uuid, text, jsonb) from public, anon;
revoke execute on function public.cambiar_estado_viaje(uuid, text, text, date) from public, anon;
grant  execute on function public.crear_viaje(uuid, date, date, text, text, uuid, text, uuid, uuid, text, jsonb) to authenticated;
grant  execute on function public.cambiar_estado_viaje(uuid, text, text, date) to authenticated;
