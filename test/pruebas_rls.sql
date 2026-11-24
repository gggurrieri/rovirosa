-- Pruebas de seguridad y reglas de cobro. Correr después de la migración y el seed.
\set ON_ERROR_STOP 0
insert into auth.users values ('aaaaaaaa-0000-4000-8000-000000000001', 'dueno@demo'),
                              ('aaaaaaaa-0000-4000-8000-000000000002', 'chofer@demo'),
                              ('aaaaaaaa-0000-4000-8000-000000000003', 'otra@empresa');
insert into public.empresas (id, nombre) values ('00000000-0000-4000-8000-000000000002', 'Otra transportista');
insert into public.perfiles values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Dueño demo', 'dueno', now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Chofer demo', 'chofer', now()),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Otra', 'dueno', now());

set role authenticated;

\echo '--- 1. El dueño ve sus 22 ítems'
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select count(*) as items_dueno from v_items_saldo;

\echo '--- 2. Otra empresa no ve nada de Rovirosa'
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
select count(*) as items_otra_empresa from v_items_saldo;
select count(*) as clientes_otra_empresa from clientes;

\echo '--- 3. El chofer no ve precios ni cobros en la fase 1'
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';
select count(*) as items_chofer from items_viaje;
select count(*) as pagos_chofer from pagos;

\echo '--- 4. Nadie puede borrar (debe borrar 0 filas)'
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from pagos;
select count(*) as pagos_despues_de_delete from pagos;

\echo '--- 5. Alta de cliente sin indicar empresa: toma la del usuario'
insert into clientes (nombre, tipo) values ('Cliente de prueba', 'particular') returning (empresa_id = '00000000-0000-4000-8000-000000000001') as empresa_ok;

\echo '--- 6. Otra empresa no puede insertar en Rovirosa (debe fallar)'
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000003';
insert into clientes (empresa_id, nombre) values ('00000000-0000-4000-8000-000000000001', 'Intruso');

\echo '--- 7. Pago parcial y cobrar de más'
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
create temp table t_item as select id, cliente_id, saldo_centavos from v_items_saldo where estado_cobro = 'pendiente' order by saldo_centavos desc limit 1;
insert into pagos (id, cliente_id, monto_centavos, titular)
  select 'bbbbbbbb-0000-4000-8000-000000000001', cliente_id, saldo_centavos, 'Prueba' from t_item;
insert into aplicaciones_pago (pago_id, item_id, monto_centavos)
  select 'bbbbbbbb-0000-4000-8000-000000000001', id, saldo_centavos / 2 from t_item;
select estado_cobro as tras_pago_parcial from v_items_saldo where id = (select id from t_item);
\echo '    (lo siguiente debe fallar: más que el precio del ítem)'
insert into pagos (id, cliente_id, monto_centavos) select 'bbbbbbbb-0000-4000-8000-000000000002', cliente_id, saldo_centavos * 2 from t_item;
insert into aplicaciones_pago (pago_id, item_id, monto_centavos)
  select 'bbbbbbbb-0000-4000-8000-000000000002', id, saldo_centavos from t_item;
\echo '    (lo siguiente debe fallar: más que el monto del pago)'
insert into aplicaciones_pago (pago_id, item_id, monto_centavos)
  select 'bbbbbbbb-0000-4000-8000-000000000001', (select id from v_items_saldo where estado_cobro = 'pendiente' and id <> t_item.id limit 1), saldo_centavos from t_item;

\echo '--- 8. Editar el monto de un pago (debe fallar) y anularlo con motivo'
update pagos set monto_centavos = 1 where id = 'bbbbbbbb-0000-4000-8000-000000000001';
update pagos set anulado_en = now(), anulado_motivo = 'Cargado por error' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
select estado_cobro as tras_anular from v_items_saldo where id = (select id from t_item);

\echo '--- 9. La auditoría registró los cambios'
select tabla, accion, count(*) from auditoria where tabla = 'pagos' group by 1, 2 order by 1, 2;
reset role;
