#!/usr/bin/env bash
# Corre cada archivo de pruebas SQL sobre una base nueva con las migraciones y el seed.
# Usa las variables de conexión estándar de Postgres (PGHOST, PGPORT, PGUSER, PGPASSWORD).
# Sale con error si alguna prueba dice FALLA o si algo da error.
set -euo pipefail
cd "$(dirname "$0")/../.."

BASE=${BASE_PRUEBAS:-rovirosa_pruebas}
PRUEBAS=(test/pruebas_fase1.sql test/pruebas_cobros.sql test/pruebas_viajes.sql test/pruebas_resultados_comprobantes.sql test/pruebas_grilla.sql test/pruebas_editar_usuarios.sql)
# MIGRACIONES_DIR permite probar contra otra carpeta (por ejemplo, una versión rota a propósito).
MIGRACIONES=("${MIGRACIONES_DIR:-supabase/migrations}"/*.sql)

crear_base() {
  psql -q -d postgres -c "drop database if exists $BASE" -c "create database $BASE" >/dev/null 2>&1
  # Orden de producción: primera migración, seed, el resto de las migraciones.
  # Al final, el reloj fijo (test/reloj_fijo.sql): las pruebas no dependen del día en que corren.
  psql -q -d "$BASE" -v ON_ERROR_STOP=1 \
    -f test/stub_supabase.sql -f test/stub_storage.sql \
    -f "${MIGRACIONES[0]}" -f supabase/seed.sql \
    $(printf -- '-f %s ' "${MIGRACIONES[@]:1}") -f test/reloj_fijo.sql >/dev/null 2>&1
}

fallas=0
for prueba in "${PRUEBAS[@]}"; do
  echo "▶ $prueba"
  crear_base
  salida=$(psql -q -d "$BASE" -f "$prueba" 2>&1 || true)
  echo "$salida" | grep -oE "(OK [0-9]+.*|FALLA.*|ERROR.*)" | sed 's/^/   /'
  if echo "$salida" | grep -qE "FALLA|ERROR"; then fallas=$((fallas + 1)); fi
done

psql -q -d postgres -c "drop database if exists $BASE" >/dev/null 2>&1
if [ "$fallas" -gt 0 ]; then echo "❌ $fallas archivo(s) con fallas"; exit 1; fi
echo "✅ Todas las pruebas SQL pasaron"
