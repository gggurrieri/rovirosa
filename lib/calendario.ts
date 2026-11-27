// Calendario por unidad: rango de días, barras (viajes y bloqueos) en carriles,
// choques y el estado de cada unidad en un día. Funciones puras.

import { formatearFecha, sumarDias } from "./formato";
import type { EstadoViaje } from "./viajes";

export type Vista = "2s" | "mes";
export type MotivoBloqueo = "service" | "vtv" | "taller" | "franco" | "vacaciones" | "otro";

export const NOMBRE_MOTIVO: Record<MotivoBloqueo, string> = {
  service: "Service",
  vtv: "VTV",
  taller: "Taller",
  franco: "Franco",
  vacaciones: "Vacaciones",
  otro: "Bloqueado",
};

export type ViajeCal = {
  id: string;
  numero: number;
  unidad_id: string | null;
  chofer_id: string | null;
  fecha_salida: string;
  fecha_llegada: string | null;
  origen: string;
  destino: string;
  estado: EstadoViaje;
  autos: number;
};
export type BloqueoCal = { id: string; unidad_id: string | null; chofer_id: string | null; desde: string; hasta: string; motivo: MotivoBloqueo; notas: string | null };

const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);

export function rangoCalendario(vista: Vista, fecha: string) {
  if (vista === "mes") {
    const [a, m] = fecha.split("-").map(Number);
    const desde = `${a}-${String(m).padStart(2, "0")}-01`;
    const siguiente = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
    const anterior = m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
    const hasta = sumarDias(siguiente, -1);
    return { desde, hasta, anterior, siguiente, dias: Array.from({ length: diasEntre(desde, hasta) + 1 }, (_, i) => sumarDias(desde, i)) };
  }
  return {
    desde: fecha,
    hasta: sumarDias(fecha, 13),
    anterior: sumarDias(fecha, -14),
    siguiente: sumarDias(fecha, 14),
    dias: Array.from({ length: 14 }, (_, i) => sumarDias(fecha, i)),
  };
}

export type Segmento = {
  tipo: "viaje" | "bloqueo";
  id: string;
  etiqueta: string;
  detalle: string;
  inicio: number;
  fin: number;
  carril: number;
  cortadoAntes: boolean;
  cortadoDespues: boolean;
  sinLlegada: boolean;
  choca: boolean;
  viaje?: ViajeCal;
  bloqueo?: BloqueoCal;
};
export type Choque = { desde: string; hasta: string; etiquetas: string[] };

/** Las barras de una unidad en esos días, acomodadas en carriles para que no se tapen. */
export function armarFila(unidadId: string, dias: string[], viajes: ViajeCal[], bloqueos: BloqueoCal[]) {
  const primero = dias[0];
  const ultimo = dias[dias.length - 1];
  const crudos = [
    ...viajes
      .filter((v) => v.unidad_id === unidadId)
      .map((v) => ({
        tipo: "viaje" as const,
        id: v.id,
        etiqueta: `#${v.numero}`,
        detalle: `${v.origen} → ${v.destino}`,
        desde: v.fecha_salida,
        hasta: v.fecha_llegada ?? v.fecha_salida,
        sinLlegada: v.fecha_llegada === null,
        viaje: v,
      })),
    ...bloqueos
      .filter((b) => b.unidad_id === unidadId)
      .map((b) => ({ tipo: "bloqueo" as const, id: b.id, etiqueta: NOMBRE_MOTIVO[b.motivo], detalle: b.notas ?? "", desde: b.desde, hasta: b.hasta, sinLlegada: false, bloqueo: b })),
  ].filter((s) => s.desde <= ultimo && s.hasta >= primero);

  const finDeCarril: number[] = [];
  const segmentos: Segmento[] = crudos
    .map((s) => ({
      ...s,
      inicio: Math.max(0, diasEntre(primero, s.desde)),
      fin: Math.min(dias.length - 1, diasEntre(primero, s.hasta)),
      cortadoAntes: s.desde < primero,
      cortadoDespues: s.hasta > ultimo,
    }))
    .sort((a, b) => a.inicio - b.inicio || Number(a.tipo === "bloqueo") - Number(b.tipo === "bloqueo"))
    .map((s) => {
      let carril = finDeCarril.findIndex((fin) => fin < s.inicio);
      if (carril < 0) carril = finDeCarril.length;
      finDeCarril[carril] = s.fin;
      return { ...s, carril, choca: false };
    });

  // Choques: días con dos o más cosas a la vez. Días seguidos con lo mismo se juntan.
  const choques: Choque[] = [];
  dias.forEach((dia, i) => {
    const ahi = segmentos.filter((s) => s.inicio <= i && s.fin >= i);
    if (ahi.length < 2) return;
    ahi.forEach((s) => (s.choca = true));
    const etiquetas = ahi.map((s) => s.etiqueta);
    const anterior = choques[choques.length - 1];
    if (anterior && anterior.etiquetas.join() === etiquetas.join() && sumarDias(anterior.hasta, 1) === dia) anterior.hasta = dia;
    else choques.push({ desde: dia, hasta: dia, etiquetas });
  });

  // Orden de lectura: viajes primero, después bloqueos.
  segmentos.sort((a, b) => Number(a.tipo === "bloqueo") - Number(b.tipo === "bloqueo") || a.inicio - b.inicio);
  return { segmentos, carriles: Math.max(1, finDeCarril.length), choques };
}

const corta = (fecha: string) => formatearFecha(fecha).slice(0, 5);
const unirY = (t: string[]) => (t.length <= 1 ? t.join("") : `${t.slice(0, -1).join(", ")} y ${t[t.length - 1]}`);

/** Qué hace una unidad ese día, en palabras (para "¿Quién está libre?" en el celular). */
export function estadoDelDia(unidadId: string, dia: string, viajes: ViajeCal[], bloqueos: BloqueoCal[]) {
  const v = viajes.filter((x) => x.unidad_id === unidadId && x.fecha_salida <= dia && (x.fecha_llegada ?? x.fecha_salida) >= dia);
  const b = bloqueos.filter((x) => x.unidad_id === unidadId && x.desde <= dia && x.hasta >= dia);
  if (v.length + b.length === 0) return { tipo: "libre" as const, texto: "Libre" };
  if (v.length + b.length > 1) {
    return { tipo: "choque" as const, texto: `Choque: ${unirY([...v.map((x) => `#${x.numero}`), ...b.map((x) => NOMBRE_MOTIVO[x.motivo])])}`, viaje: v[0] };
  }
  if (v.length === 1) {
    const x = v[0];
    const vuelve = x.fecha_llegada ? ` (vuelve el ${corta(x.fecha_llegada)})` : "";
    return { tipo: "viaje" as const, texto: `En viaje #${x.numero} · ${x.origen} → ${x.destino}${vuelve}`, viaje: x };
  }
  return { tipo: "bloqueo" as const, texto: `${NOMBRE_MOTIVO[b[0].motivo]} hasta el ${corta(b[0].hasta)}`, bloqueo: b[0] };
}

const SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function etiquetaDia(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return { semana: SEMANA[d], numero: String(Number(fecha.slice(8, 10))), finDeSemana: d === 0 || d === 6 };
}
