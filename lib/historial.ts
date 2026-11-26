// Historial de cambios de un viaje, leído de la tabla auditoria (solo el dueño la ve).
// Convierte filas técnicas (antes/después en JSON) en frases: "Unidad: Mosquito 1 → Mosquito 2".

import { formatearFecha, formatearPlata, type Moneda, ZONA_HORARIA } from "./formato";
import { type EstadoViaje, NOMBRE_ESTADO } from "./viajes";

type Fila = Record<string, unknown>;

export type EventoAuditoria = {
  tabla: "viajes" | "items_viaje";
  registro_id: string;
  accion: "INSERT" | "UPDATE";
  antes: Fila | null;
  despues: Fila | null;
  usuario: string | null;
  /** Momento de la transacción: los cambios de un mismo guardado comparten este valor. */
  en: string;
  motivo: string | null;
};

export type ContextoHistorial = {
  usuarios: Map<string, string>;
  unidades: Map<string, string>;
  choferes: Map<string, string>;
  /** item_id → "Audi R8 (Juan Pérez)" */
  autos: Map<string, string>;
};

export type LineaHistorial = { en: string; quien: string; cambios: string[]; motivo: string | null };

const momento = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_HORARIA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "2026-11-26T17:05:00Z" → "26/11/2026 14:05" (hora argentina). */
export function formatearMomento(iso: string): string {
  return momento.format(new Date(iso)).replace(",", "");
}

const fecha = (v: unknown) => (typeof v === "string" && v ? formatearFecha(v) : "—");
const distinto = (a: Fila | null, d: Fila | null, campo: string) => (a?.[campo] ?? null) !== (d?.[campo] ?? null);

function cambiosDeViaje(e: EventoAuditoria, ctx: ContextoHistorial): string[] {
  const a = e.antes;
  const d = e.despues;
  const r: string[] = [];
  const nombre = (mapa: Map<string, string>, id: unknown, vacio: string) =>
    typeof id === "string" ? (mapa.get(id) ?? "otra") : vacio;

  if (distinto(a, d, "estado")) {
    r.push(`Estado: ${NOMBRE_ESTADO[a?.estado as EstadoViaje] ?? a?.estado} → ${NOMBRE_ESTADO[d?.estado as EstadoViaje] ?? d?.estado}`);
  }
  if (distinto(a, d, "fecha_salida")) r.push(`Salida: ${fecha(a?.fecha_salida)} → ${fecha(d?.fecha_salida)}`);
  if (distinto(a, d, "fecha_llegada_estimada")) {
    r.push(`Llegada estimada: ${fecha(a?.fecha_llegada_estimada)} → ${fecha(d?.fecha_llegada_estimada)}`);
  }
  if (distinto(a, d, "origen")) r.push(`Origen: ${a?.origen} → ${d?.origen}`);
  if (distinto(a, d, "destino")) r.push(`Destino: ${a?.destino} → ${d?.destino}`);
  if (distinto(a, d, "unidad_id")) {
    r.push(`Unidad: ${nombre(ctx.unidades, a?.unidad_id, "sin unidad")} → ${nombre(ctx.unidades, d?.unidad_id, "sin unidad")}`);
  }
  if (distinto(a, d, "chofer_id")) {
    r.push(`Chofer: ${nombre(ctx.choferes, a?.chofer_id, "sin chofer")} → ${nombre(ctx.choferes, d?.chofer_id, "sin chofer")}`);
  }
  if (distinto(a, d, "notas")) r.push("Cambió las notas");
  return r;
}

function cambiosDeAuto(e: EventoAuditoria, ctx: ContextoHistorial, conEstado: boolean): string[] {
  const auto = ctx.autos.get(e.registro_id);
  const elAuto = auto ? `el ${auto}` : "un auto";
  if (e.accion === "INSERT") return [`Agregó ${elAuto}`];

  const a = e.antes;
  const d = e.despues;
  const r: string[] = [];
  if (distinto(a, d, "precio_centavos")) {
    const moneda = ((d?.moneda ?? a?.moneda) as Moneda | undefined) ?? "ARS";
    const plata = (v: unknown) => formatearPlata(Number(v), moneda);
    r.push(`Precio ${auto ? `del ${auto}` : "de un auto"}: ${plata(a?.precio_centavos)} → ${plata(d?.precio_centavos)}`);
  }
  // Al cancelar o entregar el viaje cambian todos sus autos: ya lo dice la línea del estado.
  if (!conEstado && a?.cancelado === false && d?.cancelado === true) r.push(`Quitó ${elAuto}`);
  if (!conEstado && distinto(a, d, "fecha_entrega")) {
    r.push(`Entrega ${auto ? `del ${auto}` : "de un auto"}: ${fecha(a?.fecha_entrega)} → ${fecha(d?.fecha_entrega)}`);
  }
  return r;
}

export function armarHistorial(eventos: EventoAuditoria[], ctx: ContextoHistorial): LineaHistorial[] {
  // Un guardado = mismo momento y mismo usuario.
  const grupos = new Map<string, EventoAuditoria[]>();
  for (const e of eventos) {
    const clave = `${e.en}|${e.usuario ?? ""}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), e]);
  }

  const lineas: LineaHistorial[] = [];
  for (const grupo of grupos.values()) {
    const primero = grupo[0];
    const creo = grupo.some((e) => e.tabla === "viajes" && e.accion === "INSERT");
    const conEstado = grupo.some((e) => e.tabla === "viajes" && distinto(e.antes, e.despues, "estado"));
    const cambios = creo
      ? ["Creó el viaje"]
      : [
          ...grupo.filter((e) => e.tabla === "viajes").flatMap((e) => cambiosDeViaje(e, ctx)),
          ...grupo.filter((e) => e.tabla === "items_viaje").flatMap((e) => cambiosDeAuto(e, ctx, conEstado)),
        ];
    if (cambios.length === 0) continue;
    lineas.push({
      en: primero.en,
      quien: (primero.usuario && ctx.usuarios.get(primero.usuario)) || "Alguien",
      cambios,
      motivo: grupo.find((e) => e.motivo)?.motivo ?? null,
    });
  }
  return lineas.sort((x, y) => (x.en < y.en ? 1 : x.en > y.en ? -1 : 0));
}
