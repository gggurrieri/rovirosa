// Lógica del Inicio de Rodrigo ("Hoy"): qué viajes están en la ruta, cuáles salen
// y cuáles se atrasaron, y la navegación entre meses de los resultados.

import { sumarDias } from "./formato";
import type { EstadoViaje } from "./viajes";

export type ViajeHoy = {
  id: string;
  numero: number;
  estado: EstadoViaje;
  fecha_salida: string;
  origen: string;
  destino: string;
  unidad: string | null;
  chofer: string | null;
  autos: number;
  /** Autos ya entregados (entrega por auto). */
  entregados: number;
};

const SIN_SALIR: EstadoViaje[] = ["programado", "reprogramado"];
const EN_RUTA: EstadoViaje[] = ["en_retiro", "en_viaje"];
const porFecha = (a: ViajeHoy, b: ViajeHoy) =>
  a.fecha_salida === b.fecha_salida ? a.numero - b.numero : a.fecha_salida < b.fecha_salida ? -1 : 1;

export function clasificarViajesHoy(viajes: ViajeHoy[], hoy: string, dias = 7) {
  const limite = sumarDias(hoy, dias);
  return {
    atrasados: viajes.filter((v) => SIN_SALIR.includes(v.estado) && v.fecha_salida < hoy).sort(porFecha),
    enCurso: viajes.filter((v) => EN_RUTA.includes(v.estado)).sort(porFecha),
    proximos: viajes
      .filter((v) => SIN_SALIR.includes(v.estado) && v.fecha_salida >= hoy && v.fecha_salida <= limite)
      .sort(porFecha),
  };
}

/** "Empezó el viaje" solo para viajes sin salir que salen hoy o ya debían salir. */
export function puedeEmpezar(viaje: Pick<ViajeHoy, "estado" | "fecha_salida">, hoy: string) {
  return SIN_SALIR.includes(viaje.estado) && viaje.fecha_salida <= hoy;
}

// -----------------------------------------------------------------------------
// Meses
// -----------------------------------------------------------------------------

export type Mes = { anio: number; mes: number };

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const mesDe = (fechaIso: string): Mes => ({ anio: Number(fechaIso.slice(0, 4)), mes: Number(fechaIso.slice(5, 7)) });
export const nombreMes = ({ anio, mes }: Mes) => `${MESES[mes - 1]} ${anio}`;
export const mesAnterior = ({ anio, mes }: Mes): Mes => (mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 });
export const mesSiguiente = ({ anio, mes }: Mes): Mes => (mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 });

export function esMesFuturo(m: Mes, hoy: string) {
  const actual = mesDe(hoy);
  return m.anio > actual.anio || (m.anio === actual.anio && m.mes > actual.mes);
}

export function rangoMes({ anio, mes }: Mes) {
  const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const siguiente = mesSiguiente({ anio, mes });
  const primeroDelSiguiente = `${siguiente.anio}-${String(siguiente.mes).padStart(2, "0")}-01`;
  return { desde, hasta: sumarDias(primeroDelSiguiente, -1) };
}

/** "2026-11" ↔ { anio: 2026, mes: 11 }, para el parámetro ?mes= de la URL. */
export function mesDesdeTexto(texto: unknown): Mes | null {
  if (typeof texto !== "string" || !/^\d{4}-\d{2}$/.test(texto)) return null;
  const m = { anio: Number(texto.slice(0, 4)), mes: Number(texto.slice(5, 7)) };
  return m.mes >= 1 && m.mes <= 12 ? m : null;
}
export const mesATexto = ({ anio, mes }: Mes) => `${anio}-${String(mes).padStart(2, "0")}`;
