# Prompt para arrancar el sprint 1 en Claude Code

Copiá todo lo que está debajo de la línea y pegalo en Claude Code, abierto en la carpeta del repositorio.

---

Leé `CLAUDE.md` y `docs/especificacion.md`. Vamos a hacer el **sprint 1**: la base del proyecto.

La base de datos ya está creada en Supabase con `supabase/migrations/20261124000000_esquema_fase1.sql` y cargada con `supabase/seed.sql`. No modifiques esos archivos.

Objetivo del sprint: **entrar con un usuario y ver los datos de prueba desde el celular.**

Tareas:

1. Crear la app Next.js (App Router, TypeScript, Tailwind, ESLint) en esta misma carpeta, sin pisar los archivos que ya existen.
2. Conectar Supabase con `@supabase/ssr` (cliente para server components, server actions y middleware). Variables en `.env.local` y un `.env.example` sin valores reales. Solo la anon key: nunca la service role key.
3. Login con email y contraseña, en español, pensado para celular. Middleware que redirija a `/login` si no hay sesión.
4. Layout autenticado con una barra inferior de navegación (Inicio, Viajes, Cobros, Más) y el nombre de la empresa arriba.
5. **Inicio**: tres tarjetas con datos reales de `v_items_saldo`: total por cobrar, total vencido y cantidad de viajes de los próximos 7 días.
6. **Viajes**: lista de solo lectura con número, fecha, ruta, unidad, estado y saldo. Que se vea bien a 375 px de ancho.
7. Utilidades de formato en `lib/formato.ts`: plata en centavos a `$ 1.250.000`, fechas a `23/11/2026`, con tests en Vitest.
8. Configurar Netlify (`netlify.toml`) para desplegar la app.
9. Actualizar el `README.md` con cómo correr el proyecto en local.

Criterios de aceptación:

- Con el usuario de prueba entro desde el celular y veo los 12 viajes simulados.
- El tablero muestra $ 8.700.000 por cobrar (el total que da el seed).
- Un usuario sin perfil o de otra empresa no ve ningún dato.
- `npm run lint`, `npm run build` y `npm test` pasan sin errores.

Antes de programar, mostrame el plan con la estructura de carpetas y las dependencias que vas a instalar, y esperá mi OK.
