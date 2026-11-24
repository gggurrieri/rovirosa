# Rovirosa · Kit de inicio (sprint 1)

Todo lo necesario para arrancar el sistema con Claude Code, sin esperar a Rodrigo.

## Qué hay en esta carpeta

| Archivo | Para qué sirve |
| --- | --- |
| `CLAUDE.md` | Contexto y reglas que Claude Code lee en cada tarea |
| `docs/especificacion.md` | Especificación del MVP, enfocada en la fase 1 |
| `supabase/migrations/20261124000000_esquema_fase1.sql` | Esquema de la base: tablas, seguridad por empresa, reglas de cobro y auditoría |
| `supabase/seed.sql` | Datos de prueba ficticios: 12 viajes, 22 autos, 15 pagos |
| `prompts/sprint-1.md` | El pedido para pegar en Claude Code y arrancar |
| `test/` | Pruebas de seguridad y de reglas de cobro (para Postgres local) |
| `docs/datos-simulados/` | Los CSV de los viajes simulados |

## Primeros pasos

### 1. Crear las cuentas (todas gratis)

- **GitHub**: creá un repositorio **privado** llamado `rovirosa` y subí esta carpeta.
- **Supabase**: creá un proyecto nuevo. Elegí la región de São Paulo, que es la más cercana. Guardá la contraseña de la base en un lugar seguro.
- **Netlify**: la vas a necesitar al final del sprint para publicar la app. Su plan gratis permite uso comercial.

### 2. Instalar en tu computadora

- **Node.js** (versión LTS) y **Git**.
- **Claude Code**, siguiendo la guía oficial en docs.claude.com.

### 3. Crear la base de datos

En Supabase, abrí el **SQL Editor**:

1. Pegá el contenido de `supabase/migrations/20261124000000_esquema_fase1.sql` y tocá **Run**.
2. Pegá el contenido de `supabase/seed.sql` y tocá **Run**.

### 4. Crear tu usuario

1. En Supabase, en **Authentication → Users**, agregá un usuario con tu email y una contraseña, marcado como confirmado.
2. Volvé al SQL Editor y corré esto, cambiando el email por el tuyo:

```sql
insert into public.perfiles (user_id, empresa_id, nombre, rol)
select id, '00000000-0000-4000-8000-000000000001', 'Gabi', 'dueno'
from auth.users
where email = 'TU_EMAIL@ejemplo.com';
```

Sin este paso el login funciona pero no vas a ver ningún dato: es la seguridad por empresa haciendo su trabajo.

### 5. Arrancar el sprint 1

1. En la configuración del proyecto de Supabase, en la sección **API**, copiá la URL del proyecto y la **anon key**. Nunca uses la service role key en la app.
2. Abrí Claude Code en la carpeta del repositorio.
3. Pegá el contenido de `prompts/sprint-1.md`.
4. Revisá el plan que te propone antes de darle el OK.

Cuando Claude Code te pida las claves, ponelas en `.env.local`, que ya está en `.gitignore` y no se sube a GitHub.

## Mientras tanto, pedile a Rodrigo por WhatsApp

- Cuántos autos lleva cada mosquito.
- Tarifas reales por ruta y litros que gasta cada unidad en cada ruta.
- Si cobra anticipo y en qué moneda cobra los viajes al exterior.
- Qué empresa le provee el GPS.
- Cada cuántos km hace el service de cada unidad.

Con eso, la demo de febrero va a mostrar sus propias rutas y precios.

## Pruebas de la base (opcional)

Las pruebas de `test/pruebas_rls.sql` verifican que cada empresa ve solo sus datos, que un chofer no ve precios, que nada se puede borrar y que no se puede cobrar de más. Están pensadas para un Postgres local con `test/stub_supabase.sql`, que simula lo mínimo de Supabase. Claude Code puede adaptarlas para correrlas automáticamente en el proyecto.

## Datos de prueba

Todo es ficticio: la empresa se llama "Rovirosa (demo)" y los clientes tienen "(ficticio)" en el nombre. Totales del seed: $ 22.250.000 facturado, $ 13.550.000 cobrado y $ 8.700.000 por cobrar.
