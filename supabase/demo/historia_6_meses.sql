-- =============================================================================
-- Rovirosa · Historia de demo: 5 meses de viajes y cobros FICTICIOS
--   Para que la pantalla Métricas muestre cómo se ve con uso real. NO es una
--   migración: se corre a mano en el SQL Editor de Supabase, una vez.
--   - Solo funciona en la empresa "Rovirosa (demo)". En otra empresa, no hace nada.
--   - Se puede correr dos veces: si ya está cargada, avisa y no duplica.
--   - Cuenta una historia: antes del sistema los cobros se atrasaban (jun–ago);
--     después se recupera lo vencido y se cobra más rápido (sep–oct).
--   - Todo queda marcado con la nota "Historia de demo".
-- =============================================================================
do $$
declare
  v_empresa  constant uuid := '00000000-0000-4000-8000-000000000001';
  v_hoy      date := public.hoy_ar();
  v_mes      date;
  v_atras    int;
  v_k        int;
  v_n        int;
  v_r        int;
  v_tarifa   record;
  v_unidad   record;
  v_cliente  uuid;
  v_viaje    uuid;
  v_vehiculo uuid;
  v_item     uuid;
  v_pago     uuid;
  v_salida   date;
  v_entrega  date;
  v_demora   int;
  v_monto    bigint;
  v_autos    int;
  v_clientes uuid[];
  v_marcas   text[] := array['Porsche 911', 'Ferrari Roma', 'BMW M4', 'Audi R8', 'Mercedes AMG GT', 'Ford Mustang', 'Toyota GR86', 'Chevrolet Camaro'];
  v_total    int := 0;
begin
  if not exists (select 1 from public.empresas where id = v_empresa and nombre like '%(demo)%') then
    raise notice 'No hay empresa demo: no se cargó nada.';
    return;
  end if;
  if exists (select 1 from public.viajes where empresa_id = v_empresa and notas = 'Historia de demo') then
    raise notice 'La historia de demo ya estaba cargada: no se cargó nada.';
    return;
  end if;

  select array_agg(id order by nombre) into v_clientes from public.clientes where empresa_id = v_empresa;

  for v_atras in reverse 5..1 loop                     -- de hace 5 meses a hace 1 mes
    v_mes := (date_trunc('month', v_hoy) - make_interval(months => v_atras))::date;
    for v_k in 1..12 loop
      v_r := abs(hashtext(v_mes::text || '-' || v_k));
      select * into v_tarifa from public.tarifas where empresa_id = v_empresa and activa
        order by id offset (v_r % (select count(*) from public.tarifas where empresa_id = v_empresa and activa)) limit 1;
      select * into v_unidad from public.unidades where empresa_id = v_empresa and activa
        order by id offset ((v_r / 7) % (select count(*) from public.unidades where empresa_id = v_empresa and activa)) limit 1;
      v_autos := least(v_unidad.capacidad_autos, 1 + (v_r / 11) % 3);
      v_salida := v_mes + ((v_k * 5 + v_r % 3) % 27);
      v_entrega := v_salida + 1 + (v_r / 13) % 3;

      insert into public.viajes (empresa_id, fecha_salida, fecha_llegada_estimada, unidad_id, chofer_id, origen, destino,
                                 tarifa_id, estado, notas)
      values (v_empresa, v_salida, v_entrega, v_unidad.id, v_unidad.chofer_habitual_id, v_tarifa.origen, v_tarifa.destino,
              v_tarifa.id, case when v_atras >= 3 then 'cerrado' else 'entregado' end, 'Historia de demo')
      returning id into v_viaje;

      for v_n in 1..v_autos loop
        v_r := abs(hashtext(v_viaje::text || v_n));
        v_cliente := v_clientes[1 + v_r % array_length(v_clientes, 1)];
        insert into public.vehiculos (empresa_id, cliente_id, marca, modelo)
        values (v_empresa, v_cliente, split_part(v_marcas[1 + (v_r / 5) % 8], ' ', 1),
                substr(v_marcas[1 + (v_r / 5) % 8], strpos(v_marcas[1 + (v_r / 5) % 8], ' ') + 1))
        returning id into v_vehiculo;
        insert into public.items_viaje (empresa_id, viaje_id, cliente_id, vehiculo_id, precio_centavos, moneda, fecha_entrega)
        values (v_empresa, v_viaje, v_cliente, v_vehiculo, v_tarifa.precio_base_centavos, v_tarifa.moneda, v_entrega)
        returning id into v_item;

        -- Antes del sistema (hace 3 a 5 meses) se cobraba tarde; después, rápido.
        v_demora := case when v_atras >= 3 then 20 + (v_r / 17) % 45 else 2 + (v_r / 17) % 12 end;
        continue when v_r % 10 = 0;                          -- 1 de cada 10 autos queda sin cobrar
        continue when v_entrega + v_demora > v_hoy;          -- todavía no pagó
        v_monto := case when v_r % 7 = 0 then v_tarifa.precio_base_centavos / 2 else v_tarifa.precio_base_centavos end;
        insert into public.pagos (empresa_id, cliente_id, fecha, monto_centavos, moneda, medio, notas)
        values (v_empresa, v_cliente, v_entrega + v_demora, v_monto, v_tarifa.moneda, 'transferencia', 'Historia de demo')
        returning id into v_pago;
        insert into public.aplicaciones_pago (empresa_id, pago_id, item_id, monto_centavos)
        values (v_empresa, v_pago, v_item, v_monto);
      end loop;
      v_total := v_total + 1;
    end loop;
  end loop;

  raise notice 'Historia de demo cargada: % viajes en 5 meses.', v_total;
end $$;
