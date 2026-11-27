#!/usr/bin/env bash
# Backup de los DATOS de Tracker (no del esquema: el esquema está completo en supabase/migrations).
# Uso: scripts/backup/hacer-backup.sh "<cadena de conexión>" salida.sql
# Guarda: todas las tablas de public (empresas, viajes, pagos, auditoría...) y los usuarios de
# auth (para que cada uno pueda volver a entrar con su contraseña). NO incluye los archivos de
# Storage (fotos de comprobantes): ver docs/backups.md.
set -euo pipefail
CONEXION=$1
SALIDA=$2
{
  echo "-- Backup de Tracker: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # Al restaurar, que no corran los triggers (auditoría, reglas de cobro): los datos ya los cumplieron.
  echo "set session_replication_role = replica;"
  pg_dump "$CONEXION" --data-only --no-owner --no-privileges --table='auth.users' --table='auth.identities'
  pg_dump "$CONEXION" --data-only --no-owner --no-privileges --schema=public
  echo "set session_replication_role = origin;"
} >"$SALIDA"
echo "Backup listo: $(wc -c <"$SALIDA") bytes"
