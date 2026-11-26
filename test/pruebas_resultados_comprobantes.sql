-- Pruebas del sprint 4a (resultados, estados directos y comprobantes). Base con:
--   stub_supabase.sql → stub_storage.sql → todas las migraciones → seed.sql
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

create temp table r as
select
  (select id from public.clientes where nombre like 'Concesionaria Norte%') as norte,
  (select id from public.clientes where nombre like 'Autos del Sur%')       as sur,
  (select i.id from public.items_viaje i join public.viajes v on v.id = i.viaje_id
     join public.clientes c on c.id = i.cliente_id where v.numero = 3 and c.nombre like 'Concesionaria Norte%') as item3,
  (select i.id from public.items_viaje i join public.viajes v on v.id = i.viaje_id
     join public.clientes c on c.id = i.cliente_id where v.numero = 4 and c.nombre like 'Concesionaria Norte%') as item4,
  (select i.id from public.items_viaje i join public.viajes v on v.id = i.viaje_id
     join public.clientes c on c.id = i.cliente_id where v.numero = 7 and c.nombre like 'Autos del Sur%') as item7,
  (select id from public.unidades where nombre = 'Mosquito 1') as mosquito1,
  (select id from public.pagos limit 1) as pago_seed;
grant select on r to authenticated;

create function pg_temp.resultado(p_fecha date, p_campo text) returns bigint language sql as $$
  select coalesce((
    select (m ->> p_campo)::bigint
    from jsonb_array_elements(public.resultados_mes(extract(year from p_fecha)::int, extract(month from p_fecha)::int) -> 'montos') m
    where m ->> 'moneda' = 'ARS'), 0)
$$;
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
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

do $$ declare res jsonb := public.resultados_mes(2026, 11); begin
  if (res ->> 'viajes')::int <> 12 or pg_temp.resultado('2026-11-01', 'facturado') <> 2225000000
     or pg_temp.resultado('2026-11-01', 'cobrado') <> 1355000000 or pg_temp.resultado('2026-11-01', 'recuperado') <> 0 then
    raise exception 'FALLA 1: %', res;
  end if;
  if (public.resultados_mes(2026, 10) ->> 'viajes')::int <> 0 or jsonb_array_length(public.resultados_mes(2026, 10) -> 'montos') <> 0 then
    raise exception 'FALLA 1: octubre debería estar vacío';
  end if;
  raise notice 'OK 1: noviembre del seed → $ 22.250.000 facturado, $ 13.550.000 cobrado, 12 viajes, $ 0 recuperado; octubre vacío';
end $$;

do $$
declare
  antes_cob bigint := pg_temp.resultado(public.hoy_ar(), 'cobrado');
  -- El pago del 24/11 suma a lo cobrado del mes actual solo si hoy es noviembre de 2026.
  extra_sur bigint := case when date_trunc('month', public.hoy_ar()) = '2026-11-01' then 10000000 else 0 end;
begin
  -- Pago de Concesionaria Norte (autos vencidos): cuenta como recuperado.
  perform public.registrar_pago('44444444-0000-4000-8000-000000000001', (select norte from r), public.hoy_ar(), 200000000, 'ARS',
    'transferencia', null, null, jsonb_build_array(
      jsonb_build_object('item_id', (select item3 from r), 'monto_centavos', 140000000),
      jsonb_build_object('item_id', (select item4 from r), 'monto_centavos', 60000000)));
  -- Pago de Autos del Sur del 24/11, cuando su auto todavía NO estaba vencido: no es recuperado.
  perform public.registrar_pago('44444444-0000-4000-8000-000000000002', (select sur from r), '2026-11-24', 10000000, 'ARS',
    'transferencia', null, null, jsonb_build_array(jsonb_build_object('item_id', (select item7 from r), 'monto_centavos', 10000000)));
  if pg_temp.resultado(public.hoy_ar(), 'recuperado') <> 200000000 then
    raise exception 'FALLA 2: recuperado %', pg_temp.resultado(public.hoy_ar(), 'recuperado');
  end if;
  if pg_temp.resultado(public.hoy_ar(), 'cobrado') <> antes_cob + 200000000 + extra_sur then
    raise exception 'FALLA 2: cobrado %', pg_temp.resultado(public.hoy_ar(), 'cobrado');
  end if;
  perform public.anular_pago('44444444-0000-4000-8000-000000000001', 'Prueba');
  if pg_temp.resultado(public.hoy_ar(), 'recuperado') <> 0 then raise exception 'FALLA 2: anulado sigue contando'; end if;
  raise notice 'OK 2: pago a autos vencidos suma $ 2.000.000 recuperado; uno a tiempo no cuenta; al anular deja de contar';
end $$;

do $$ declare v uuid; begin
  perform public.crear_viaje('55555555-0000-4000-8000-000000000001', public.hoy_ar(), null, 'Buenos Aires', 'Tandil', null, 'ARS',
    (select mosquito1 from r), null, null,
    jsonb_build_array(jsonb_build_object('cliente_id', (select sur from r), 'vehiculo', jsonb_build_object('marca', 'X', 'modelo', 'Y'), 'precio_centavos', 1)));
  v := '55555555-0000-4000-8000-000000000001';
  perform public.cambiar_estado_viaje(v, 'programado', 'en_viaje');
  perform public.cambiar_estado_viaje(v, 'en_viaje', 'programado');
  perform public.cambiar_estado_viaje(v, 'programado', 'en_viaje');
  perform public.cambiar_estado_viaje(v, 'en_viaje', 'entregado');
  if (select estado from public.viajes where id = v) <> 'entregado'
     or exists (select 1 from public.items_viaje where viaje_id = v and fecha_entrega is distinct from public.hoy_ar()) then
    raise exception 'FALLA 3: el viaje no quedó entregado hoy';
  end if;
  perform pg_temp.espera_error(format($q$select public.cambiar_estado_viaje(%L, 'entregado', 'programado')$q$, v),
    'No se puede pasar de entregado a programado', '3b');
  raise notice 'OK 3: "Empezó el viaje" (Programado → En viaje), deshacer y "Terminó" con fecha de hoy';
end $$;

do $$ begin
  -- El dueño sube un comprobante a la carpeta de su empresa y lo vincula a un pago nuevo.
  insert into storage.objects (bucket_id, name) values ('comprobantes',
    '00000000-0000-4000-8000-000000000001/44444444-0000-4000-8000-000000000003/comprobante.png');
  perform public.registrar_pago('44444444-0000-4000-8000-000000000003', (select sur from r), public.hoy_ar(), 5000, 'ARS',
    'transferencia', null, null, '[]'::jsonb,
    '00000000-0000-4000-8000-000000000001/44444444-0000-4000-8000-000000000003/comprobante.png');
  if (select comprobante_path from public.v_pagos where id = '44444444-0000-4000-8000-000000000003') is null then
    raise exception 'FALLA 4: el pago no guardó el comprobante';
  end if;
  -- Un comprobante que no existe, o de otro pago, no se acepta.
  perform pg_temp.espera_error($q$select public.registrar_pago('44444444-0000-4000-8000-000000000004', (select sur from r), public.hoy_ar(), 5000, 'ARS',
    'transferencia', null, null, '[]'::jsonb, '00000000-0000-4000-8000-000000000001/44444444-0000-4000-8000-000000000004/no-existe.png')$q$,
    'El comprobante no es válido', '4b');
  perform pg_temp.espera_error($q$select public.registrar_pago('44444444-0000-4000-8000-000000000005', (select sur from r), public.hoy_ar(), 5000, 'ARS',
    'transferencia', null, null, '[]'::jsonb, '00000000-0000-4000-8000-000000000001/44444444-0000-4000-8000-000000000003/comprobante.png')$q$,
    'El comprobante no es válido', '4c');
  if exists (select 1 from public.pagos where id in ('44444444-0000-4000-8000-000000000004', '44444444-0000-4000-8000-000000000005')) then
    raise exception 'FALLA 4: quedó un pago con comprobante inválido';
  end if;
  raise notice 'OK 4: el pago guarda su comprobante; uno inexistente o de otro pago se rechaza sin guardar el pago';
end $$;

do $$ declare ruta text := '00000000-0000-4000-8000-000000000001/' || (select pago_seed from r) || '/comprobante.pdf'; begin
  insert into storage.objects (bucket_id, name) values ('comprobantes', ruta);
  perform public.adjuntar_comprobante((select pago_seed from r), ruta);
  perform pg_temp.espera_error(format($q$select public.adjuntar_comprobante(%L, %L)$q$, (select pago_seed from r), ruta),
    'El pago ya tiene un comprobante', '5b');
  raise notice 'OK 5: se agrega el comprobante a un pago ya cargado, una sola vez';
end $$;

-- Otra empresa intenta ver y subir comprobantes de Rovirosa, con rutas reales.
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';

do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'comprobantes') <> 0 then
    raise exception 'FALLA 6: otra empresa ve comprobantes de Rovirosa';
  end if;
  perform pg_temp.espera_error($q$insert into storage.objects (bucket_id, name) values ('comprobantes',
    '00000000-0000-4000-8000-000000000001/44444444-0000-4000-8000-000000000009/comprobante.png')$q$,
    'new row violates row-level security policy', '6a');
  perform pg_temp.espera_error($q$select public.adjuntar_comprobante((select pago_seed from r),
    '00000000-0000-4000-8000-000000000001/x/comprobante.png')$q$, 'No se encontró el pago', '6b');
  if (public.resultados_mes(2026, 11) ->> 'viajes')::int <> 0 then raise exception 'FALLA 6: ve resultados de Rovirosa'; end if;
  -- En su propia carpeta, sí puede.
  insert into storage.objects (bucket_id, name) values ('comprobantes',
    '00000000-0000-4000-8000-000000000002/44444444-0000-4000-8000-000000000010/comprobante.png');
  raise notice 'OK 6: otra empresa no ve ni sube comprobantes de Rovirosa ni ve sus resultados; en su carpeta, sí';
end $$;
