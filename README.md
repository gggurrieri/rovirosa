# Rovirosa · Sistema de gestión para transporte de autos

App web (Next.js + Supabase) para registrar viajes y cobros, pensada para usar desde el celular.

## Correr la app en local

Necesitás **Node.js 22** (LTS) y el proyecto de Supabase ya creado y cargado (ver "Primeros pasos" más abajo).

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Crear el archivo de variables a partir del ejemplo:

   ```bash
   cp .env.example .env.local
   ```

3. Completar `.env.local` con la **URL del proyecto** y la **anon key** (Supabase → Project Settings → API). Nunca la service role key.

4. Levantar la app:

   ```bash
   npm run dev
   ```

5. Abrir http://localhost:3000 y entrar con tu usuario.

### Probarla desde el celular en la misma red wifi

```bash
npm run dev -- --hostname 0.0.0.0
```

Después abrí en el celular `http://IP-DE-TU-COMPU:3000`.

### Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | App en modo desarrollo |
| `npm run build` | Compila para producción |
| `npm run lint` | Revisa el estilo y errores comunes del código |
| `npm test` | Corre los tests (formato de plata y fechas, cálculos del tablero) |

### Estructura

| Carpeta | Qué hay |
| --- | --- |
| `app/login/` | Pantalla de login y acciones de entrar y salir |
| `app/(app)/` | Pantallas con sesión: Inicio, Viajes, Cobros, Más |
| `components/` | Piezas de interfaz reutilizables (barra inferior, tarjetas, montos) |
| `lib/formato.ts` | Plata en centavos → `$ 1.250.000`, fechas → `23/11/2026` |
| `lib/tablero.ts` | Cálculos de saldos (funciones puras, con tests) |
| `lib/datos.ts` | Todas las consultas a Supabase |
| `lib/supabase/` | Clientes de Supabase y refresco de sesión |
| `proxy.ts` | Redirige a `/login` si no hay sesión (en Next.js 16 el "middleware" se llama "proxy") |

## Publicar en Netlify

1. En Netlify: **Add new site → Import an existing project** y elegí el repositorio `rovirosa` de GitHub.
2. Netlify lee `netlify.toml` (comando `npm run build`, Node 22). No hace falta tocar nada más.
3. En **Site configuration → Environment variables** cargá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. **Deploy**. Abrí la URL que te da Netlify desde el celular.

## Aplicar una migración nueva en Supabase

Cada cambio de base viene en un archivo nuevo dentro de `supabase/migrations/`, y se aplican **en orden** por la fecha del nombre. Nunca se edita una migración que ya corrió.

| Migración | Qué agrega |
| --- | --- |
| `20261124000000_esquema_fase1.sql` | Tablas, seguridad por empresa, reglas de cobro y auditoría |
| `20261125000000_cobros.sql` | Registrar y anular pagos, vistas de pagos, vencido en hora argentina, blindaje entre empresas |

Para aplicar una (sirve desde el celular):

1. Abrí el archivo en GitHub y tocá **Raw**. Copiá todo el texto.
2. En Supabase: **SQL Editor → New query**, pegá el texto y tocá **Run**.
3. Tiene que decir **Success. No rows returned**. Si da error, no sigas: copiá el mensaje y consultalo.
4. **Primero la migración, después el deploy:** si la app nueva se publica antes de correr la migración, la pantalla Cobros va a fallar porque busca funciones que todavía no existen.

## Pruebas de la base (Postgres local)

En una base vacía, aplicá en este orden: `test/stub_supabase.sql`, las migraciones, `supabase/seed.sql`. Después:

- `test/pruebas_rls.sql`: seguridad por empresa y reglas de cobro de la fase 1.
- `test/pruebas_cobros.sql`: registrar, pagos duplicados, cobrar de más, saldo a favor, anular y aislamiento entre empresas. Cada caso imprime `OK` o corta con `FALLA`.

## Kit de inicio

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
