# Backups y Supabase activo

Dos tareas automáticas de GitHub (pestaña **Actions** del repositorio):

| Tarea | Cuándo | Qué hace |
|---|---|---|
| **Supabase activo** | Cada 3 días | Una consulta mínima para que el plan gratis no pause el proyecto (lo pausa tras 7 días sin uso). |
| **Backup semanal** | Domingos 03:41 (Argentina) | Copia los datos, los encripta con tu contraseña y los guarda 90 días (unas 12 copias). |

Si una falla, GitHub te manda un email.

## Paso 1: cargar los dos secrets (una sola vez)

Un *secret* es un dato sensible que GitHub guarda oculto: nadie lo puede volver a ver, ni vos.

1. **La conexión a la base.** En Supabase: botón **Connect** (arriba) → pestaña **Connection string** → elegí **Session pooler** (no "Direct connection": GitHub no llega por esa vía) → copiá la URI. Reemplazá `[YOUR-PASSWORD]` por la contraseña de la base (si no la recordás: *Project Settings → Database → Reset database password*; la app no la usa, así que cambiarla no rompe nada).
2. **La contraseña del backup.** Inventá una larga (por ejemplo cuatro palabras al azar) y **guardala en tu gestor de contraseñas**. Sin ella, los backups no se pueden abrir: ni GitHub ni nadie la puede recuperar.
3. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**, y cargá:
   - `SUPABASE_DB_URL`: la URI del punto 1.
   - `BACKUP_PASSWORD`: la contraseña del punto 2.

## Paso 2: probarlo

**Actions → Backup semanal → Run workflow**. En un minuto aparece en verde; abajo, en *Artifacts*, queda `backup-AAAA-MM-DD`. Hacé lo mismo con **Supabase activo**.

## Restaurar un backup

Para un desastre (se borró algo, se dañó el proyecto). Se restaura en un **proyecto nuevo** de Supabase:

1. Creá el proyecto nuevo y corré **todas las migraciones** de `supabase/migrations/` en orden (como en "Aplicar una migración nueva" del README). **No** corras `seed.sql`.
2. Bajá el backup desde GitHub (Actions → Backup semanal → la fecha que quieras → *Artifacts*) y descomprimí el zip.
3. Desencriptalo (pide la contraseña del paso 1):
   ```bash
   gpg --decrypt tracker-AAAA-MM-DD.sql.gpg > datos.sql
   ```
4. Cargalo con la conexión *Session pooler* del proyecto nuevo:
   ```bash
   psql "<cadena de conexión del proyecto nuevo>" -v ON_ERROR_STOP=1 -f datos.sql
   ```
5. En Netlify, cambiá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` por las del proyecto nuevo y volvé a desplegar. Cada usuario entra con su misma contraseña.

Este procedimiento se prueba solo en cada pull request (`scripts/backup/probar-restauracion.sh`): backup → encriptar → restaurar en una base nueva → comparar filas, saldos, auditoría y numeración de viajes.

## Lo que NO cubre (todavía)

- **Archivos de Storage** (fotos y PDF de comprobantes): el backup guarda el registro de cada comprobante, pero no el archivo. Bajarlos requiere la clave de servicio, que no usamos fuera de Supabase. Se puede resolver más adelante con el plan pago (que incluye backups diarios completos).
- **60 días sin cambios en el repo**: GitHub apaga las tareas programadas. Te avisa por email antes; con un clic en *Enable workflow* (pestaña Actions) vuelven a andar.
- Los backups los puede bajar cualquiera con acceso al repositorio, pero están encriptados: sin la contraseña no se leen.
