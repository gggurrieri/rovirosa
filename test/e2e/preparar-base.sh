#!/usr/bin/env bash
# Base limpia para las pruebas de punta a punta: migraciones, seed y usuarios de prueba.
# Usa las variables de conexión estándar de Postgres. Base: PGDATABASE (rovirosa_e2e).
set -euo pipefail
cd "$(dirname "$0")/../.."
BASE=${PGDATABASE:-rovirosa_e2e}
MIGRACIONES=(supabase/migrations/*.sql)

psql -q -d postgres -c "drop database if exists $BASE with (force)" -c "create database $BASE" >/dev/null
psql -q -d "$BASE" -v ON_ERROR_STOP=1 \
  -f test/stub_supabase.sql -f test/stub_storage.sql \
  -f "${MIGRACIONES[0]}" -f supabase/seed.sql \
  $(printf -- '-f %s ' "${MIGRACIONES[@]:1}") >/dev/null 2>&1

# Usuarios: dueño de Rovirosa, otra empresa, chofer y uno sin perfil (contraseña demo1234).
psql -q -d "$BASE" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into auth.users values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'dueno@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'chofer@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'otra@demo.com'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'sinperfil@demo.com');
insert into public.empresas (id, nombre) values ('00000000-0000-4000-8000-000000000002', 'Otra transportista');
insert into public.perfiles values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Gabi', 'dueno', now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Chofer demo', 'chofer', now()),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Otra', 'dueno', now());
-- Mosquito 2 en service desde mañana, para probar los avisos de disponibilidad.
insert into public.bloqueos_disponibilidad (empresa_id, unidad_id, desde, hasta, motivo)
select '00000000-0000-4000-8000-000000000001', id, public.hoy_ar() + 1, public.hoy_ar() + 3, 'service'
from public.unidades where nombre = 'Mosquito 2';
SQL
