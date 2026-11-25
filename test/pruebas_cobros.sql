-- Pruebas de la migración de cobros (sprint 2). Correr sobre una base con:
--   stub_supabase.sql → esquema_fase1 → seed.sql → 20261125000000_cobros.sql
-- Cada bloque muestra "OK: ..." o corta con "FALLA: ...".
\set ON_ERROR_STOP 1

insert into auth.users values ('aaaaaaaa-0000-4000-8000-000000000001', 'dueno@demo'),
                              ('aaaaaaaa-0000-4000-8000-000000000003', 'otra@empresa')
on conflict do nothing;
insert into public.empresas (id, nombre) values ('00000000-0000-4000-8000-000000000002', 'Otra transportista')
on conflict do nothing;
insert into public.perfiles values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Dueño demo', 'dueno', now()),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Otra', 'dueno', now())
on conflict do nothing;
insert into public.clientes (id, empresa_id, nombre)
values ('cccccccc-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Cliente de la otra')
on conflict do nothing;

-- Ayudas para las pruebas (se borran al final).
create function pg_temp.item(p_viaje bigint, p_cliente text) returns uuid language sql as
$$ select id from public.v_items_saldo where viaje_numero = p_viaje and cliente_nombre like p_cliente || '%' $$;
create function pg_temp.cliente(p_nombre text) returns uuid language sql as
$$ select id from public.clientes where nombre like p_nombre || '%' $$;
create function pg_temp.por_cobrar() returns bigint language sql as
$$ select coalesce(sum(saldo_centavos) filter (where estado_cobro <> 'cancelado'), 0) from public.v_items_saldo $$;
create function pg_temp.vencido() returns bigint language sql as
$$ select coalesce(sum(saldo_centavos) filter (where vencido), 0) from public.v_items_saldo $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Ids reales de Rovirosa, leídos sin RLS: así la prueba de "otra empresa" usa
-- datos que existen (si los buscara con RLS, vendrían vacíos y fallaría por eso).
create temp table ids_rovirosa as
select (select id from public.items_viaje where empresa_id = '00000000-0000-4000-8000-000000000001' limit 1) as item_id,
       (select id from public.clientes where nombre like 'Juan%') as cliente_id;
grant select on ids_rovirosa to authenticated;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

do $$ begin
  if pg_temp.por_cobrar() <> 870000000 or pg_temp.vencido() <> 270000000 then
    raise exception 'FALLA: el punto de partida no es $ 8.700.000 / $ 2.700.000';
  end if;
  raise notice 'OK 0: parte de $ 8.700.000 por cobrar y $ 2.700.000 vencido';
end $$;

do $$ declare r jsonb; begin
  r := public.registrar_pago('11111111-0000-4000-8000-000000000001', pg_temp.cliente('Concesionaria Norte'),
         public.hoy_ar(), 200000000, 'ARS', 'transferencia', 'Concesionaria Norte SA', null,
         jsonb_build_array(
           jsonb_build_object('item_id', pg_temp.item(3, 'Concesionaria Norte'), 'monto_centavos', 140000000),
           jsonb_build_object('item_id', pg_temp.item(4, 'Concesionaria Norte'), 'monto_centavos', 60000000)));
  if r ->> 'duplicado' <> 'false' then raise exception 'FALLA 1: %', r; end if;
  if pg_temp.por_cobrar() <> 670000000 or pg_temp.vencido() <> 70000000 then
    raise exception 'FALLA 1: quedó % por cobrar y % vencido', pg_temp.por_cobrar(), pg_temp.vencido();
  end if;
  raise notice 'OK 1: pago de $ 2.000.000 a dos autos → $ 6.700.000 por cobrar y $ 700.000 vencido';
end $$;

do $$ declare r jsonb; n int; begin
  r := public.registrar_pago('11111111-0000-4000-8000-000000000001', pg_temp.cliente('Concesionaria Norte'),
         public.hoy_ar(), 200000000, 'ARS');
  select count(*) into n from public.pagos where id = '11111111-0000-4000-8000-000000000001';
  if r ->> 'duplicado' <> 'true' or n <> 1 or pg_temp.por_cobrar() <> 670000000 then
    raise exception 'FALLA 2: el doble envío cambió algo (%)', r;
  end if;
  raise notice 'OK 2: el mismo pago enviado dos veces se guarda una sola vez';
end $$;

do $$ begin
  begin
    perform public.registrar_pago('11111111-0000-4000-8000-000000000002', pg_temp.cliente('Juan Pérez'),
      public.hoy_ar(), 100000000, 'ARS', 'transferencia', null, null,
      jsonb_build_array(jsonb_build_object('item_id', pg_temp.item(9, 'Juan Pérez'), 'monto_centavos', 100000000)));
    raise exception 'FALLA 3: dejó cobrar más que el saldo';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;
  if exists (select 1 from public.pagos where id = '11111111-0000-4000-8000-000000000002') then
    raise exception 'FALLA 3: el pago quedó guardado sin sus aplicaciones';
  end if;
  raise notice 'OK 3: cobrar de más se rechaza y no queda un pago a medias';
end $$;

do $$ declare a_favor bigint; begin
  perform public.registrar_pago('11111111-0000-4000-8000-000000000003', pg_temp.cliente('Juan Pérez'),
    public.hoy_ar(), 100000000, 'ARS', 'transferencia', null, null,
    jsonb_build_array(jsonb_build_object('item_id', pg_temp.item(9, 'Juan Pérez'), 'monto_centavos', 95000000)));
  select a_favor_centavos into a_favor from public.v_pagos where id = '11111111-0000-4000-8000-000000000003';
  if a_favor <> 5000000 then raise exception 'FALLA 4: saldo a favor %', a_favor; end if;
  raise notice 'OK 4: pago de más deja $ 50.000 a favor';
end $$;

do $$ begin
  begin
    perform public.registrar_pago(gen_random_uuid(), pg_temp.cliente('Juan Pérez'), public.hoy_ar() + 1, 100, 'ARS');
    raise exception 'FALLA 5: aceptó una fecha futura';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;
  raise notice 'OK 5: rechaza fechas futuras';
end $$;

do $$ begin
  perform public.anular_pago('11111111-0000-4000-8000-000000000001', 'Cargado dos veces por error');
  if pg_temp.por_cobrar() <> 775000000 or pg_temp.vencido() <> 270000000 then
    raise exception 'FALLA 6: al anular quedó % por cobrar', pg_temp.por_cobrar();
  end if;
  if not exists (select 1 from public.v_pagos
                 where id = '11111111-0000-4000-8000-000000000001' and anulado_motivo like 'Cargado%') then
    raise exception 'FALLA 6: el pago anulado no se ve con su motivo';
  end if;
  begin
    perform public.anular_pago('11111111-0000-4000-8000-000000000001', 'Otra vez');
    raise exception 'FALLA 6: dejó anular dos veces';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;
  begin
    perform public.anular_pago('11111111-0000-4000-8000-000000000003', '  ');
    raise exception 'FALLA 6: dejó anular sin motivo';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;
  raise notice 'OK 6: anular devuelve los saldos, guarda el motivo y no se repite ni va sin motivo';
end $$;

-- Otra empresa intenta tocar a Rovirosa.
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';

do $$ declare n int; begin
  select count(*) into n from public.v_pagos;
  if n <> 0 then raise exception 'FALLA 7: otra empresa ve % pagos de Rovirosa', n; end if;
  begin
    perform public.registrar_pago(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000002',
      public.hoy_ar(), 100000000, 'ARS', 'transferencia', null, null,
      jsonb_build_array(jsonb_build_object('item_id',
        (select item_id from ids_rovirosa), 'monto_centavos', 100)));
    raise exception 'FALLA 7: otra empresa aplicó un pago a un auto que no ve';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
    if sqlerrm <> 'El auto no existe' then raise exception 'FALLA 7: rechazó por otro motivo: %', sqlerrm; end if;
  end;
  begin
    perform public.registrar_pago(gen_random_uuid(), (select cliente_id from ids_rovirosa),
      public.hoy_ar(), 100, 'ARS');
    raise exception 'FALLA 7: otra empresa registró un pago con un cliente de Rovirosa';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
    if sqlerrm <> 'El cliente no existe' then raise exception 'FALLA 7: rechazó por otro motivo: %', sqlerrm; end if;
  end;
  begin
    perform public.anular_pago('11111111-0000-4000-8000-000000000003', 'Intento ajeno');
    raise exception 'FALLA 7: otra empresa anuló un pago de Rovirosa';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
    if sqlerrm <> 'No se encontró el pago' then raise exception 'FALLA 7: rechazó por otro motivo: %', sqlerrm; end if;
  end;
  raise notice 'OK 7: otra empresa no ve, no aplica ni anula pagos de Rovirosa';
end $$;

reset role;
do $$ declare n int; begin
  select count(*) into n from public.aplicaciones_pago a
  join public.pagos p on p.id = a.pago_id join public.items_viaje i on i.id = a.item_id
  where p.empresa_id <> i.empresa_id;
  if n <> 0 then raise exception 'FALLA 8: hay % aplicaciones que cruzan empresas', n; end if;
  raise notice 'OK 8: ninguna aplicación cruza empresas';
end $$;
