#!/usr/bin/env bash
# Pruebas de punta a punta: compila la app apuntando al Supabase simulado, y corre
# cada archivo de pruebas sobre una base limpia. Sale con error si alguna falla.
# Uso: test/e2e/correr.sh [archivo.cjs ...]   (sin argumentos, corre todos)
set -uo pipefail
cd "$(dirname "$0")/../.."
export PGDATABASE=${PGDATABASE:-rovirosa_e2e}
export CAPTURAS=${CAPTURAS:-$(mktemp -d)}
mkdir -p "$CAPTURAS" # en la CI viene configurada pero todavía no existe
PUERTO_APP=3100
PUERTO_SIMULADO=54321

if [ $# -gt 0 ]; then PRUEBAS=("$@"); else PRUEBAS=(test/e2e/[0-9]*.cjs); fi

SIM_PID=""
APP_PID=""
liberar() {
  [ -n "$SIM_PID" ] && kill "$SIM_PID" 2>/dev/null
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null
  fuser -k "$PUERTO_SIMULADO/tcp" "$PUERTO_APP/tcp" >/dev/null 2>&1 || true
}
trap liberar EXIT
liberar

echo "▶ Compilando la app contra el Supabase simulado"
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$PUERTO_SIMULADO" NEXT_PUBLIC_SUPABASE_ANON_KEY="clave-de-prueba" \
  npx next build >"$CAPTURAS/build.log" 2>&1 || { tail -30 "$CAPTURAS/build.log"; exit 1; }
ORS_API_KEY="clave-ors-prueba" ORS_URL="http://127.0.0.1:$PUERTO_SIMULADO/ors" npx next start -p "$PUERTO_APP" >"$CAPTURAS/app.log" 2>&1 &
APP_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PUERTO_APP/login" && break; sleep 0.5; done

fallas=0
for prueba in "${PRUEBAS[@]}"; do
  echo "▶ $prueba"
  [ -n "$SIM_PID" ] && kill "$SIM_PID" 2>/dev/null && wait "$SIM_PID" 2>/dev/null
  bash test/e2e/preparar-base.sh
  node test/e2e/supabase-simulado.mjs >"$CAPTURAS/simulado.log" 2>&1 &
  SIM_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:$PUERTO_SIMULADO/" && break; sleep 0.25; done
  if ! timeout 300 node "$prueba"; then fallas=$((fallas + 1)); fi
done

echo "Capturas y registros en: $CAPTURAS"
if [ "$fallas" -gt 0 ]; then echo "❌ $fallas archivo(s) con fallas"; exit 1; fi
echo "✅ Todas las pruebas de punta a punta pasaron"
