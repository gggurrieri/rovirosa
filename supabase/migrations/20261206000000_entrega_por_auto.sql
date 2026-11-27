-- =============================================================================
-- Tracker · "Se entrega en" por auto
--   Un viaje puede dejar autos en varias ciudades (José C. Paz → Bariloche → Mendoza).
--   items_viaje.entrega_direccion existe desde la fase 1; acá se habilita:
--   1. crear_viaje y editar_viaje la reciben ("entrega" en cada auto, y
--      "entregas": [{item_id, entrega}] para corregirla después).
--   2. El recordatorio de cobro usa el destino de ESE auto.
--   No hay tablas ni columnas nuevas: solo se reemplazan funciones.
-- Se puede volver a correr sin error.
-- =============================================================================

-- Texto limpio: sin espacios de más, vacío = sin dato, hasta 120 letras.
create or replace function public.texto_entrega(p_texto text)
returns text
language plpgsql
immutable
as $$
declare
  v text := nullif(regexp_replace(trim(coalesce(p_texto, '')), '\s+', ' ', 'g'), '');
begin
  if length(v) > 120 then
    raise exception 'El lugar de entrega es muy largo (hasta 120 letras)' using errcode = '22023';
  end if;
  return v;
end;
$$;

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

    insert into public.items_viaje (viaje_id, cliente_id, vehiculo_id, precio_centavos, moneda, entrega_direccion)
    values (p_id, v_cliente, v_vehiculo, (v_item ->> 'precio_centavos')::bigint, coalesce(p_moneda, 'ARS'),
            public.texto_entrega(v_item ->> 'entrega'));
  end loop;

  return jsonb_build_object('viaje_id', p_id, 'numero', v_numero, 'duplicado', false);
end;
$$;

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
  v_entregas jsonb := coalesce(p_cambios -> 'entregas', '[]'::jsonb);
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
  v_item     uuid;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para editar viajes' using errcode = '42501';
  end if;
  if jsonb_typeof(d) <> 'object' or jsonb_typeof(v_precios) <> 'array'
     or jsonb_typeof(v_quitar) <> 'array' or jsonb_typeof(v_agregar) <> 'array'
     or jsonb_typeof(v_entregas) <> 'array' then
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

  -- Dónde se entrega cada auto: se puede corregir en cualquier momento, salvo en un viaje cancelado
  if jsonb_array_length(v_entregas) > 0 and v.estado = 'cancelado' then
    raise exception '%', public.mensaje_edicion_viaje(v.estado) using errcode = '22023';
  end if;
  for v_elem in select * from jsonb_array_elements(v_entregas)
  loop
    update public.items_viaje
    set entrega_direccion = public.texto_entrega(v_elem ->> 'entrega')
    where id = (v_elem ->> 'item_id')::uuid and viaje_id = p_viaje_id and not cancelado;
    if not found then
      raise exception 'El auto no es de este viaje' using errcode = '22023';
    end if;
    v_cambios := v_cambios + 1;
  end loop;

  -- Quitar autos (cancelados, no borrados). Cada elemento es el id del auto, o
  -- { "item_id": ..., "anticipo": "sena" | "a_favor" } si el auto tiene pagos.
  for v_elem in select * from jsonb_array_elements(v_quitar)
  loop
    v_item := case when jsonb_typeof(v_elem) = 'object' then (v_elem ->> 'item_id')::uuid else (v_elem #>> '{}')::uuid end;
    if not exists (select 1 from public.items_viaje where id = v_item and viaje_id = p_viaje_id and not cancelado) then
      raise exception 'El auto no es de este viaje' using errcode = '22023';
    end if;
    perform public.cancelar_item(v_item, case when jsonb_typeof(v_elem) = 'object' then v_elem ->> 'anticipo' end, v_motivo);
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
    insert into public.items_viaje (viaje_id, cliente_id, vehiculo_id, precio_centavos, moneda, entrega_direccion)
    values (p_viaje_id, v_cliente, v_vehiculo, (v_elem ->> 'precio_centavos')::bigint, coalesce(v_moneda, 'ARS'),
            public.texto_entrega(v_elem ->> 'entrega'));
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

create or replace function public.registrar_recordatorio(p_cliente_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cliente public.clientes%rowtype;
  v_ars     bigint;
  v_usd     bigint;
  v_autos   int;
begin
  if not public.puedo_editar() then
    raise exception 'No tenés permiso para mandar recordatorios' using errcode = '42501';
  end if;
  select * into v_cliente from public.clientes where id = p_cliente_id;
  if not found then
    raise exception 'No se encontró el cliente' using errcode = 'P0002';
  end if;
  if nullif(trim(coalesce(v_cliente.whatsapp, '')), '') is null then
    raise exception 'Cargá el WhatsApp del cliente' using errcode = '22023';
  end if;
  select coalesce(sum(saldo_centavos) filter (where moneda = 'ARS'), 0),
         coalesce(sum(saldo_centavos) filter (where moneda = 'USD'), 0),
         count(*)
  into v_ars, v_usd, v_autos
  from public.v_items_saldo
  where cliente_id = p_cliente_id and estado_cobro <> 'cancelado' and saldo_centavos > 0;
  if v_autos = 0 then
    raise exception 'El cliente no debe nada' using errcode = '22023';
  end if;

  insert into public.recordatorios (cliente_id, saldo_ars, saldo_usd, autos)
  values (p_cliente_id, v_ars, v_usd, v_autos);

  return jsonb_build_object(
    'cliente', v_cliente.nombre,
    'whatsapp', v_cliente.whatsapp,
    'empresa', (select nombre from public.empresas where id = v_cliente.empresa_id),
    'datos_cobro', (select datos_cobro from public.empresas where id = v_cliente.empresa_id),
    'mensaje', (select mensaje_recordatorio from public.empresas where id = v_cliente.empresa_id),
    'autos', (select jsonb_agg(jsonb_build_object(
                'vehiculo', vehiculo, 'origen', origen,
                -- el destino de ESE auto si se cargó dónde se entrega; si no, el del viaje
                'destino', coalesce((select i.entrega_direccion from public.items_viaje i where i.id = v_items_saldo.id), destino),
                'fecha_entrega', fecha_entrega, 'moneda', moneda, 'saldo', saldo_centavos)
                order by fecha_salida, viaje_numero)
              from public.v_items_saldo
              where cliente_id = p_cliente_id and estado_cobro <> 'cancelado' and saldo_centavos > 0)
  );
end;
$$;
