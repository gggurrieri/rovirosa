-- Versión automática de test/pruebas_rls.sql: los mismos casos de la fase 1, pero
-- cada uno muestra "OK: ..." o corta con "FALLA: ..." (para correr en la CI).
-- Base con: stub_supabase.sql → stub_storage.sql → migraciones → seed.sql
\set ON_ERROR_STOP 1

insert into auth.users values ('aaaaaaaa-0000-4000-8000-000000000001', 'dueno@demo'),
                              ('aaaaaaaa-0000-4000-8000-000000000002', 'chofer@demo'),
                              ('aaaaaaaa-0000-4000-8000-000000000003', 'otra@empresa')
on conflict do nothing;
insert into public.empresas (id, nombre) values ('00000000-0000-4000-8000-000000000002', 'Otra transportista')
on conflict do nothing;
insert into public.perfiles values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Dueño demo', 'dueno', now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Chofer demo', 'chofer', now()),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Otra', 'dueno', now())
on conflict do nothing;

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

do $$ begin
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
  if (select count(*) from public.v_items_saldo) <> 22 then raise exception 'FALLA 1: el dueño no ve sus 22 ítems'; end if;
  raise notice 'OK 1: el dueño ve sus 22 ítems';

  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000003', false);
  if (select count(*) from public.v_items_saldo) <> 0 or (select count(*) from public.clientes) <> 0 then
    raise exception 'FALLA 2: otra empresa ve datos de Rovirosa';
  end if;
  raise notice 'OK 2: otra empresa no ve nada de Rovirosa';

  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', false);
  if (select count(*) from public.items_viaje) <> 0 or (select count(*) from public.pagos) <> 0 then
    raise exception 'FALLA 3: el chofer ve precios o cobros';
  end if;
  raise notice 'OK 3: el chofer no ve precios ni cobros en la fase 1';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from public.pagos;
do $$ begin
  if (select count(*) from public.pagos) <> 15 then raise exception 'FALLA 4: se borraron pagos'; end if;
  raise notice 'OK 4: nadie puede borrar (siguen los 15 pagos)';
end $$;

do $$ declare v_empresa uuid; begin
  insert into public.clientes (nombre, tipo) values ('Cliente de prueba', 'particular') returning empresa_id into v_empresa;
  if v_empresa <> '00000000-0000-4000-8000-000000000001' then raise exception 'FALLA 5: tomó otra empresa'; end if;
  raise notice 'OK 5: alta de cliente sin indicar empresa toma la del usuario';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
do $$ begin
  perform pg_temp.espera_error($q$insert into public.clientes (empresa_id, nombre) values ('00000000-0000-4000-8000-000000000001', 'Intruso')$q$,
    'new row violates row-level security policy', '6');
  raise notice 'OK 6: otra empresa no puede insertar en Rovirosa';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
create temp table t_item as
  select id, cliente_id, saldo_centavos from public.v_items_saldo
  where estado_cobro = 'pendiente' order by saldo_centavos desc, id limit 1;
grant select on t_item to authenticated;

do $$ begin
  insert into public.pagos (id, cliente_id, monto_centavos, titular)
    select 'bbbbbbbb-0000-4000-8000-000000000001', cliente_id, saldo_centavos, 'Prueba' from t_item;
  insert into public.aplicaciones_pago (pago_id, item_id, monto_centavos)
    select 'bbbbbbbb-0000-4000-8000-000000000001', id, saldo_centavos / 2 from t_item;
  if (select estado_cobro from public.v_items_saldo where id = (select id from t_item)) <> 'parcial' then
    raise exception 'FALLA 7: el pago parcial no dejó el ítem en parcial';
  end if;
  insert into public.pagos (id, cliente_id, monto_centavos)
    select 'bbbbbbbb-0000-4000-8000-000000000002', cliente_id, saldo_centavos * 2 from t_item;
  perform pg_temp.espera_error($q$insert into public.aplicaciones_pago (pago_id, item_id, monto_centavos)
    select 'bbbbbbbb-0000-4000-8000-000000000002', id, saldo_centavos from t_item$q$, 'Se cobraría más que el precio del ítem', '7b');
  perform pg_temp.espera_error($q$insert into public.aplicaciones_pago (pago_id, item_id, monto_centavos)
    select 'bbbbbbbb-0000-4000-8000-000000000001',
           (select v.id from public.v_items_saldo v where v.estado_cobro = 'pendiente' and v.id <> t_item.id limit 1), saldo_centavos
    from t_item$q$, 'Se aplicaría más que el monto del pago', '7c');
  raise notice 'OK 7: pago parcial deja el ítem en parcial; cobrar o aplicar de más se rechaza';
end $$;

do $$ begin
  perform pg_temp.espera_error($q$update public.pagos set monto_centavos = 1 where id = 'bbbbbbbb-0000-4000-8000-000000000001'$q$,
    'Monto, moneda y cliente de un pago no se editan', '8');
  update public.pagos set anulado_en = now(), anulado_motivo = 'Cargado por error' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if (select estado_cobro from public.v_items_saldo where id = (select id from t_item)) <> 'pendiente' then
    raise exception 'FALLA 8: anular no devolvió el ítem a pendiente';
  end if;
  raise notice 'OK 8: el monto de un pago no se edita; anularlo devuelve el saldo';
end $$;

do $$ begin
  if (select count(*) from public.auditoria where tabla = 'pagos' and accion = 'UPDATE') < 1
     or (select count(*) from public.auditoria where tabla = 'pagos' and accion = 'INSERT') < 2 then
    raise exception 'FALLA 9: la auditoría no registró los cambios';
  end if;
  raise notice 'OK 9: la auditoría registró altas y cambios de pagos';
end $$;
