# Tracker · Sistema de gestión para transportistas de autos

Este archivo le da contexto a Claude Code. Leelo completo antes de cada tarea.
La especificación funcional completa está en `docs/especificacion.md`.

## Qué es

**Tracker** es el nombre del producto (en la interfaz, títulos, íconos y mensajes). Rovirosa es el primer cliente: su nombre aparece solo como nombre de empresa (dato), nunca como nombre de la herramienta.

Sistema para Rovirosa, una transportista de autos de alto valor (carrera, 0 km, colección; hasta USD 250.000) de José C. Paz, Buenos Aires. Tiene 2 camiones mosquito, 1 camioneta con carro, 2 choferes empleados, y el dueño (Rodrigo) maneja la camioneta. Hace unos 15 viajes por mes por Argentina y países limítrofes.

Rovirosa es el primer cliente (design partner). El objetivo final es venderlo a otras transportistas, por eso es **multi-empresa desde el día 1**.

## Objetivos de negocio

Todo lo que se construye tiene que servir a los dos objetivos.

**1. Para el producto: una herramienta escalable y comercializable.**
- **Multi-empresa real**: toda tabla nueva lleva `empresa_id`, RLS y pruebas de aislamiento entre empresas usando ids reales (no buscados con RLS, que los oculta).
- **Configurable, no a medida**: nada de "lo de Rodrigo" en el código. Tarifas, unidades, reglas y plazos son datos que cada empresa carga.
- **Calidad automática**: las pruebas viven en el repo y corren solas en cada pull request (GitHub Actions). Un cambio que rompe algo no se une.
- **Costos que escalan**: hoy planes gratis. Con el primer cliente que pague, Supabase pasa al plan pago (el gratis pausa el proyecto tras 7 días sin uso).

**2. Para el cliente: gestionar simple, bajar costos y subir ganancias.**
- **Que no se escape plata**: cobros, vencidos, recordatorios. Mostrar cuánto se **recuperó** (métrica norte).
- **Bajar costos**: gastos y consumo (fase 2).
- **Ganancia real**: márgenes recién cuando haya gastos cargados; nunca mostrar un número engañoso.
- **Simple**: cada pantalla se mide en toques y segundos.

## Problema que resuelve, en orden de prioridad

1. **Viajes que no se cobran**: hoy los pagos no se registran (un cliente avisó solo que debía un viaje de hace mes y medio).
2. **Gastos de choferes sin control**: combustible, peajes y viáticos (fase 2).
3. **Pedidos y cambios desordenados** por WhatsApp.
4. **Sin pruebas del estado del auto** al retirar y entregar (fase 2).

## Usuarios

- **Rodrigo (dueño)**: poco amigo de la tecnología. Usa el **celular** para consultar resultados y viajes, y para acciones rápidas (comienzo y fin de viaje). La carga la hace el administrativo. Si algo le lleva más de 30 segundos, deja de usarlo. **La adopción es el riesgo número uno del proyecto.**
- **Administrativo**: gestiona desde la **computadora**: carga y edita viajes, registra cobros con su comprobante, controla con grillas y filtros.
- **Choferes** (fase 2): solo ven sus viajes, nunca precios ni cobros.
- **Clientes** (fase 3): link de seguimiento sin login.

## Stack

- **Next.js** (App Router) + **TypeScript** + **Tailwind CSS**. Una sola app web, instalable como PWA más adelante.
- **Supabase**: Postgres, Auth (email y contraseña), Storage. Cliente con `@supabase/ssr`.
- **Hosting: Netlify** (su plan gratis permite uso comercial; el plan gratis de Vercel no).
- **Validación**: Zod. **Tests**: Vitest para la lógica de plata.
- **Presupuesto cero**: solo planes gratis. No agregar servicios pagos (mapas, SMS, WhatsApp API, IA) sin preguntar.

## Reglas de la casa (no negociables)

1. **Dos puestos de trabajo.** El administrativo gestiona desde la computadora (grillas, filtros, formularios anchos). Rodrigo consulta y hace acciones rápidas desde el celular (resultados, viajes en curso, comienzo y fin de viaje), con botones grandes y pocos toques. Una sola web *responsive*: toda pantalla se prueba a 375 px y a 1280 px. Los permisos van por rol, nunca por dispositivo.
2. **Todo en español rioplatense** en la interfaz ("cargá", "guardá"). Formato argentino: `$ 1.250.000`, `23/11/2026`. Usar `Intl.NumberFormat('es-AR')` y zona horaria `America/Argentina/Buenos_Aires`.
3. **La plata en centavos, como enteros** (`bigint` en la base, `number` entero en TS). Nunca floats para plata. Convertir solo al mostrar.
4. **Multi-empresa**: toda tabla tiene `empresa_id` y Row Level Security. La app nunca filtra por empresa "a mano": lo hace la base. El `empresa_id` se completa solo con `mi_empresa()` por defecto.
5. **Nada se borra.** No hay `DELETE`. Los pagos se anulan con motivo (`anulado_en`, `anulado_motivo`). Todo cambio queda en `auditoria`.
6. **El precio y el cobro van por ítem (auto), no por viaje.** Un viaje puede llevar autos de varios clientes. Saldo de un ítem = precio − pagos aplicados (vista `v_items_saldo`).
7. **Un pago puede cubrir varios ítems y un ítem cobrarse en varios pagos** (`aplicaciones_pago`). Lo que no se aplica queda como saldo a favor del cliente. Las reglas las hace cumplir la base con triggers: no se puede cobrar más que el precio ni aplicar más que el pago.
8. **Nunca usar la service role key en el navegador.** Solo la anon key en el cliente; RLS hace el resto.
9. **Datos personales**: de quien recibe un auto se guarda nombre y número de DNI, sin foto del documento (Ley 25.326).

## Base de datos

- Migraciones en `supabase/migrations/`. La primera (`20261124000000_esquema_fase1.sql`) tiene todo lo de la fase 1.
- Datos de prueba ficticios en `supabase/seed.sql` (empresa "Rovirosa (demo)", 12 viajes, 22 autos, 15 pagos).
- `test/pruebas_rls.sql` prueba seguridad y reglas de cobro contra un Postgres local (con `test/stub_supabase.sql`).
- Cambios de esquema: **siempre en una migración nueva**, nunca editando una ya aplicada.

Tablas de la fase 1: `empresas`, `perfiles` (usuario → empresa y rol), `clientes`, `vehiculos`, `choferes`, `unidades`, `tarifas`, `tarifas_consumo`, `viajes`, `items_viaje`, `pagos`, `aplicaciones_pago`, `bloqueos_disponibilidad`, `auditoria`. Vista: `v_items_saldo`.

Estados de viaje: `programado → en_retiro → en_viaje → entregado → cerrado`, más `reprogramado` y `cancelado`.
Estados de cobro de un ítem (calculados): `pendiente → parcial → pagado`, y `vencido` si pasaron más de `empresas.dias_vencimiento` días desde la entrega sin cobrar todo.

## Fases

- **Fase 1 (ahora): viajes y cobros, solo para Rodrigo.** Clientes, autos, unidades, tarifas, viajes, calendario por unidad, pagos, saldos, tablero de inicio y alertas de vencidos.
- Fase 2: app del chofer (gastos con foto, custodia con fotos y firma, constancia PDF), mapa, retornos vacíos, métricas, mantenimiento.
- Fase 3: planificador, seguimiento para clientes, bolsa de cargas entre transportistas.

**No construir nada de la fase 2 hasta que Rodrigo vea la demo de la fase 1** (mediados de febrero de 2027).

## Cómo trabajar

- Una funcionalidad por pedido, con su criterio de aceptación. Antes de programar algo grande, proponé un plan y esperá el OK.
- Tests primero para la lógica de plata (saldos, pagos parciales, aplicación de pagos, formato de montos).
- Componentes simples y legibles. Preferir server components y server actions; poco estado en el cliente.
- Al terminar cada tarea: correr `npm run lint`, `npm run build` y los tests, y decir cómo probarlo desde el celular.
- Si algo de la especificación no está claro o choca con estas reglas, preguntá antes de inventar.
