# Rovirosa · Especificación del MVP

Copia para el repositorio del documento de especificación (23/11/2026). Si hay diferencias, la versión viva es el documento compartido.

## Contexto y problema

El MVP ataca primero la plata que se pierde: viajes que no se cobran y gastos de choferes sin control.

| Dolor | Evidencia | Impacto |
| --- | --- | --- |
| Cobros sin registrar | Un cliente avisó solo que debía un viaje de hace mes y medio | Pérdida directa de ingresos |
| Gastos de choferes sin control | Choferes poco confiables; Rodrigo sabe cuánto combustible debería gastar cada camión por viaje | Sobrecostos difíciles de detectar |
| Pedidos y cambios desordenados | Cambios de horario y consultas nuevas llegan por WhatsApp | Errores de agenda y tiempo de Rodrigo |
| Sin registro del estado del auto | Autos de hasta USD 250.000 | Reclamos por daños sin pruebas |

## Métricas de éxito

- **Métrica norte:** plata recuperada o ahorrada por mes.
- 100% de los viajes nuevos con estado de cobro registrado.
- Ningún saldo de más de 30 días sin gestionar.
- Carga de un viaje en menos de 30 segundos; 4 semanas seguidas con todos los viajes cargados.

## Roles

| Rol | Qué hace | Qué ve |
| --- | --- | --- |
| Dueño (Rodrigo) | Carga viajes y cobros, configura tarifas | Todo |
| Administrativo | Carga viajes, cobros y facturas | Todo menos configuración y márgenes |
| Chofer (fase 2) | Gastos con foto, fotos de retiro y entrega, cambia el estado del viaje | Solo sus viajes, sin precios |
| Cliente (fase 3) | Sigue su viaje con un link sin login | Solo su auto |

## Alcance de la fase 1 (lo que se construye ahora)

- Configuración: unidades, choferes, tarifas por ruta con litros esperados por unidad, días para considerar vencido un saldo.
- Clientes y sus autos.
- Viajes con ítems (un ítem por auto), estados, grilla con filtros y calendario por unidad.
- Pagos: registrar, aplicar a uno o varios ítems, anular con motivo.
- Saldos por cliente, estados de cobro y alerta de vencidos.
- Tablero de inicio: total por cobrar, vencido, viajes de la semana.
- Carga rápida de pedidos (formulario con autocompletado; la IA queda para cuando haya presupuesto).
- Recordatorio de pago como link de WhatsApp (`wa.me`) con el mensaje armado.

**Fuera del MVP:** facturación electrónica con ARCA, sueldos, cotizador online para clientes, app nativa.

## Flujos de la fase 1

**A. Alta de viaje (menos de 30 segundos, desde el celular)**

1. Elegir ruta: se autocompletan precio base por auto y litros esperados.
2. Elegir unidad y chofer (sugiere el chofer habitual de la unidad).
3. Agregar autos: cliente y modelo. Cliente nuevo: alcanza con nombre y WhatsApp.
4. Ajustar el precio de cada auto si difiere de la tarifa. Cargar fecha deseada y días de flexibilidad.
5. Guardar: el viaje queda Programado.

**B. Registro de cobro**

1. Llega una transferencia.
2. Se carga monto, fecha, titular y opcionalmente la captura del comprobante.
3. El sistema sugiere los ítems pendientes de ese cliente, del más viejo al más nuevo.
4. Aplicar: los saldos se actualizan y el ítem pasa a Parcial o Pagado.

**Estados**

- Viaje: Programado → En retiro → En viaje → Entregado → Cerrado. También Reprogramado o Cancelado.
- Cobro de cada ítem: Pendiente → Parcial → Pagado. Vencido si no está pagado N días después de la entrega (N configurable, 7 por defecto).

## Reglas de negocio de la fase 1

| Regla | Cuándo | Qué pasa |
| --- | --- | --- |
| Saldo vencido | Ítem entregado hace más de N días sin pago completo | Aparece en el tablero con botón de recordatorio por WhatsApp |
| No cobrar de más | Una aplicación superaría el precio del ítem | La base la rechaza |
| No aplicar de más | Las aplicaciones superarían el monto del pago | La base la rechaza |
| Pagos inmutables | Se intenta cambiar monto, moneda o cliente | La base lo rechaza: se anula y se carga de nuevo |
| Nada se borra | Cualquier intento de borrar | No hay permiso; se anula con motivo |
| Unidad bloqueada | Service, VTV, taller o franco | El calendario la muestra sin lugar esos días |

## Casos de borde que el modelo ya contempla

- Viaje con autos de varios clientes: uno paga y otro no.
- La transferencia la hace un tercero (la concesionaria paga por un particular): el pago es del que paga y se aplica a ítems de otro cliente.
- Un pago cubre varios viajes, o un ítem se cobra en varios pagos (anticipo y saldo).
- Pago de más: lo no aplicado queda como saldo a favor.
- Viaje cancelado con anticipo: el ítem se marca cancelado y el pago queda como saldo a favor.
- Viajes al exterior en dólares: ítem y pago en USD; no se mezclan monedas en una aplicación.

Casos todavía abiertos (preguntar antes de implementar): tipo de cambio para viajes en USD pagados en pesos, viaje en falso (el auto no se pudo retirar), cuenta corriente de clientes recurrentes.

## Pantallas de la fase 1

| Pantalla | Contenido principal |
| --- | --- |
| Inicio | Total por cobrar, vencido, viajes de la semana y alertas |
| Viajes | Grilla con filtros por estado, fecha, unidad y cliente; botón Nuevo viaje |
| Detalle de viaje | Autos y clientes, precios, cobros y estado |
| Calendario | Una fila por unidad con sus viajes por día, días libres y bloqueos |
| Cobros | Saldos por cliente, registrar pago, aplicar a ítems, anular |
| Clientes | Ficha con autos, historial de viajes y saldo |
| Configuración | Unidades, choferes, tarifas y consumo esperado |

## Lo que viene después (no construir todavía)

- **Fase 2:** app del chofer (PWA) con gastos con foto y modo sin señal; custodia con fotos guiadas, video corto, daños marcados en un dibujo, firma y DNI de quien entrega y recibe; constancia del viaje en PDF; franja horaria de retiro; mapa con última ubicación y hora estimada; retornos vacíos con mensaje de lugar disponible; tablero de márgenes; mantenimiento con aviso de service; precio sugerido por ruta; indicadores por chofer.
- **Fase 3:** planificador para juntar cargas, bolsa de cargas entre transportistas, seguimiento en tiempo real con la API del GPS, link para clientes.

## Preguntas abiertas para Rodrigo (pedir por WhatsApp)

- ¿Cuántos autos lleva cada mosquito?
- Tarifas reales por ruta y litros que gasta cada unidad por ruta.
- ¿Cobra anticipo? ¿En qué moneda cobra los viajes al exterior?
- ¿Qué empresa le provee el GPS?
- ¿Cada cuántos km hace el service de cada unidad?
