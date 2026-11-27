#!/usr/bin/env bash
# Prueba que un backup se puede restaurar: base con datos → backup → base nueva (solo migraciones)
# → restaurar → comparar cantidades de filas y los saldos. Usa las variables PG* estándar.
set -euo pipefail
cd "$(dirname "$0")/../.."
ORIGEN=${PGDATABASE:-rovirosa_e2e}
DESTINO=${ORIGEN}_restaurada
TMP=$(mktemp -d)
MIGRACIONES=(supabase/migrations/*.sql)

bash test/e2e/preparar-base.sh
scripts/backup/hacer-backup.sh "dbname=$ORIGEN" "$TMP/backup.sql"
if grep -q "^SET transaction_timeout" "$TMP/backup.sql"; then echo "FALLA: el backup trae un parámetro que Postgres 16 no conoce"; exit 1; fi

# Encriptar y desencriptar como lo hace la tarea de GitHub
echo "clave-de-prueba" | gpg --batch --quiet --yes --pinentry-mode loopback --passphrase-fd 0 --symmetric --cipher-algo AES256 -o "$TMP/backup.sql.gpg" "$TMP/backup.sql"
echo "clave-de-prueba" | gpg --batch --quiet --yes --pinentry-mode loopback --passphrase-fd 0 --decrypt -o "$TMP/restaurar.sql" "$TMP/backup.sql.gpg"
if echo "otra-clave" | gpg --batch --quiet --yes --pinentry-mode loopback --passphrase-fd 0 --decrypt -o /dev/null "$TMP/backup.sql.gpg" 2>/dev/null; then
  echo "FALLA: se pudo abrir el backup con otra contraseña"; exit 1
fi

# Base nueva: como un proyecto de Supabase recién creado + todas las migraciones (sin seed)
psql -q -d postgres -c "drop database if exists $DESTINO with (force)" -c "create database $DESTINO" >/dev/null
psql -q -d "$DESTINO" -v ON_ERROR_STOP=1 -f test/stub_supabase.sql -f test/stub_storage.sql $(printf -- '-f %s ' "${MIGRACIONES[@]}") >/dev/null 2>&1
psql -q -d "$DESTINO" -v ON_ERROR_STOP=1 -f "$TMP/restaurar.sql" >/dev/null

CONTEO="select string_agg(t || '=' || n, ' ' order by t) from (
  select table_schema || '.' || table_name as t,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text as n
  from information_schema.tables
  where table_type = 'BASE TABLE' and (table_schema = 'public' or (table_schema = 'auth' and table_name in ('users', 'identities')))) x"
SALDOS="select sum(saldo_centavos) || '/' || count(*) from public.v_items_saldo"
SECUENCIA="select coalesce(max(numero), 0) from public.viajes"
for consulta in "$CONTEO" "$SALDOS" "$SECUENCIA"; do
  a=$(psql -tA -d "$ORIGEN" -c "$consulta"); b=$(psql -tA -d "$DESTINO" -c "$consulta")
  if [ "$a" != "$b" ]; then echo "FALLA: distinto después de restaurar"; echo " antes:   $a"; echo " después: $b"; exit 1; fi
done
echo "OK: filas por tabla, saldos y numeración iguales después de restaurar ($(psql -tA -d "$DESTINO" -c "select count(*) from public.viajes") viajes, $(psql -tA -d "$DESTINO" -c "select count(*) from public.pagos") pagos)"

# La auditoría no se duplicó (los triggers no corrieron al restaurar) y la app sigue numerando bien
a=$(psql -tA -d "$ORIGEN" -c "select count(*) from public.auditoria"); b=$(psql -tA -d "$DESTINO" -c "select count(*) from public.auditoria")
[ "$a" = "$b" ] || { echo "FALLA: auditoría $a → $b"; exit 1; }
psql -q -d "$DESTINO" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
set role authenticated;
select public.crear_viaje(gen_random_uuid(), public.hoy_ar(), null, 'Buenos Aires', 'Rosario', null, 'ARS',
  (select id from public.unidades where nombre = 'Mosquito 1'), null, null, jsonb_build_array(jsonb_build_object('cliente_id', (select id from public.clientes limit 1),
  'vehiculo', jsonb_build_object('marca', 'X', 'modelo', 'Y'), 'precio_centavos', 100)));
SQL
n=$(psql -tA -d "$DESTINO" -c "select count(*) - count(distinct (empresa_id, numero)) from public.viajes")
[ "$n" = "0" ] || { echo "FALLA: número de viaje repetido después de restaurar"; exit 1; }
echo "OK: después de restaurar se puede cargar un viaje nuevo sin repetir el número"
psql -q -d postgres -c "drop database $DESTINO with (force)" >/dev/null
rm -rf "$TMP"
echo "✅ El backup se restaura completo"
