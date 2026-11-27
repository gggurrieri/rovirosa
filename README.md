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
| `app/login/`, `app/registro/` | Entrar, salir y crear el usuario de una persona invitada |
| `app/(app)/` | Pantallas con sesión: Inicio, Viajes, Cobros, Más |
| `components/` | Piezas de interfaz reutilizables (barra inferior, tarjetas, montos) |
| `lib/formato.ts` | Plata en centavos → `$ 1.250.000`, fechas → `23/11/2026` |
| `lib/tablero.ts` | Cálculos de saldos (funciones puras, con tests) |
| `lib/cobros.ts` | Montos escritos a mano, sugerencia de aplicación de pagos y validaciones (con tests) |
| `lib/viajes.ts` | Estados del viaje, armado antes de guardar y avisos de disponibilidad (con tests) |
| `lib/grilla.ts` | Filtros de la grilla en la URL, orden y exportación CSV para Excel (con tests) |
| `lib/edicion.ts` | Qué se puede editar de un viaje según su estado y armado de los cambios (con tests) |
| `lib/historial.ts` | Historial de cambios de un viaje en frases, desde la auditoría (con tests) |
| `lib/entregas.ts` | Avance de entregas por auto, fecha de entrega y textos de cancelar con anticipo (con tests) |
| `lib/metricas.ts`, `components/graficos/` | Escalas, montos cortos y gráficos de la pantalla Métricas (HTML y SVG propios, sin librerías) |
| `lib/recordatorio.ts` | Mensaje de recordatorio de cobro, número de WhatsApp en formato internacional y posibles clientes duplicados (con tests) |
| `lib/configuracion.ts` | Lectura del CSV de tarifas que guarda Excel (con tests) |
| `lib/usuarios.ts` | Estados de las invitaciones y mensaje para mandar por WhatsApp (con tests) |
| `lib/datos*.ts` | Consultas a Supabase (generales, cobros y viajes) |
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
| `20261126000000_viajes.sql` | Cargar viajes (con clientes y autos nuevos), cambiar su estado, blindaje entre empresas en viajes, autos y vehículos |
| `20261127000000_resultados_y_comprobantes.sql` | Resultados del mes (con recuperado), "Empezó el viaje" con un toque, comprobantes en Storage privado por empresa |
| `20261128000000_grilla_viajes.sql` | Búsqueda de viajes para la grilla (filtros, orden, páginas y totales en la base) |
| `20261129000000_editar_viaje_y_usuarios.sql` | Editar viajes (reglas por estado, precio nunca menor a lo cobrado, bloqueo optimista, auditoría con motivo) e invitaciones de usuarios |
| `20261130000000_entrega_y_cancelacion.sql` | Entrega por auto, cancelar con anticipo (seña o a favor del cliente, desaplicando pagos sin borrarlos) y usar el saldo a favor en otros viajes |
| `20261201000000_metricas.sql` | Métricas de cobranza para los gráficos (por mes, antigüedad de la deuda, días de cobro, quién debe más) |
| `20261202000000_clientes_y_recordatorios.sql` | Clientes con saldos (`v_clientes`), recordatorios de cobro por WhatsApp registrados, datos para cobrar de la empresa y avance de entregas en la grilla |
| `20261203000000_configuracion.sql` | Configuración desde la app: tarifas, unidades, choferes y empresa (con sus reglas), importar tarifas, rutas sin duplicados, blindaje y mover un usuario de empresa (solo SQL Editor) |

Para aplicar una (sirve desde el celular):

1. Abrí el archivo en GitHub y tocá **Raw**. Copiá todo el texto.
2. En Supabase: **SQL Editor → New query**, pegá el texto y tocá **Run**.
3. Tiene que decir **Success. No rows returned**. Si da error, no sigas: copiá el mensaje y consultalo.
4. **Primero la migración, después el deploy:** si la app nueva se publica antes de correr la migración, la pantalla Cobros va a fallar porque busca funciones que todavía no existen.

## Sumar usuarios (invitaciones)

El dueño invita desde **Más → Usuarios** (nombre, email y rol) y le manda el link por WhatsApp. La persona entra a `/registro`, crea su usuario con ese email, confirma el mail y, al primer ingreso, la base le asigna la empresa y el rol. Sin invitación, entra pero no ve nada.

Para que funcione, una sola vez en Supabase:

1. **Authentication → Sign In / Providers → Email**: activar **Allow new users to sign up** y dejar **Confirm email** activado.
2. **Authentication → URL Configuration**: en **Site URL** poner la dirección de la app (por ejemplo `https://rovirosa-demo.netlify.app`) y agregar `https://rovirosa-demo.netlify.app/**` en **Redirect URLs**.

El envío de mails del plan gratis de Supabase tiene un límite bajo (unos pocos por hora): alcanza para sumar de a una persona.

## Arrancar la empresa real (una vez)

`supabase/admin/arrancar_empresa_real.sql` crea la empresa limpia (sin datos de prueba), copia si querés las unidades y choferes de la demo, y pasa tu usuario a la empresa nueva como dueño. No es una migración: se corre a mano en el SQL Editor.

1. Abrí el archivo en GitHub, tocá **Raw** y copiá todo.
2. En el SQL Editor, pegalo y **completá la parte "Completá acá"**: tu email (el mismo con el que entrás), el del administrativo si ya lo tenés, y si querés copiar la flota.
3. Tocá **Run**. Abajo aparecen los avisos de lo que hizo.
4. Volvé a entrar a la app: vas a ver la empresa nueva vacía. Cargá las tarifas reales en **Configuración → Tarifas** (o importalas desde Excel) y revisá unidades y choferes.

Si querés seguir mostrando la demo, poné otro email tuyo en `v_email_demo`: queda una invitación para entrar a la demo con ese usuario.

## Historia de demo para Métricas (opcional)

`supabase/demo/historia_6_meses.sql` carga 5 meses de viajes y cobros **ficticios** en la empresa "Rovirosa (demo)", para mostrar cómo se ven los gráficos con uso real. No es una migración: se corre a mano en el SQL Editor (una vez; si se corre de nuevo, no duplica). Todo queda marcado con la nota "Historia de demo". Cuando Rovirosa empiece a cargar datos reales, conviene hacerlo en una empresa nueva, sin datos de prueba.

## Pruebas

Las pruebas corren **solas en cada pull request** con GitHub Actions (`.github/workflows/pruebas.yml`): el PR muestra ✅ o ❌. Para que GitHub no deje unir un PR con ❌: **Settings → Branches → Add branch protection rule** → `main` → tildar **Require status checks to pass before merging** y elegir **pruebas**.

| Comando | Qué prueba | Necesita |
| --- | --- | --- |
| `npm test` | Lógica de plata, fechas, viajes, cobros y comprobantes (Vitest) | Nada |
| `npm run test:sql` | Migraciones contra Postgres: seguridad por empresa, reglas de cobro, viajes, resultados y Storage | Postgres local |
| `npm run test:e2e` | La app en un navegador a 375 px (celular) y 1280 px (computadora), de punta a punta, contra un Supabase simulado | Postgres local y Playwright |

Las pruebas de Postgres usan las variables estándar (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`). Por ejemplo, con un Postgres en Docker:

```bash
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
```

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres npm run test:sql
```

Qué hay en `test/`:

- `stub_supabase.sql` y `stub_storage.sql`: lo mínimo de Supabase (auth y Storage) para correr las migraciones en un Postgres común.
- `pruebas_*.sql`: cada caso imprime `OK` o corta con `FALLA`. `pruebas_rls.sql` es la versión original de la fase 1, para leer a ojo; `pruebas_fase1.sql` es su versión automática.
- `e2e/`: el Supabase simulado (aplica las políticas reales de la base), los scripts de cada sprint y los corredores.

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
