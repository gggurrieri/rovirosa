// Entrega por auto y cancelación con anticipo. Funciones puras; la base vuelve a
// validar todo (entregar_auto, cancelar_viaje, cancelar_item).

import { formatearPlata, type Moneda } from "./formato";

type AutoBasico = { estado_cobro: string; fecha_entrega: string | null; cobrado_centavos: number; moneda: Moneda };
const activos = <T extends AutoBasico>(autos: T[]) => autos.filter((a) => a.estado_cobro !== "cancelado");

export function progresoEntrega(autos: AutoBasico[]) {
  const lista = activos(autos);
  const entregados = lista.filter((a) => a.fecha_entrega !== null).length;
  const total = lista.length;
  return { entregados, total, texto: `${entregados} de ${total} ${total === 1 ? "entregado" : "entregados"}` };
}

/** Igual que entregar_auto() en la base. */
export function validarFechaEntrega(fecha: string, salida: string, hoy: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "Elegí la fecha de entrega.";
  if (fecha > hoy) return "La fecha de entrega no puede ser posterior a hoy.";
  if (fecha < salida) return "La fecha de entrega no puede ser antes de la salida.";
  return null;
}

export type Anticipo = "sena" | "a_favor";

export function totalCobrado(autos: AutoBasico[]): Partial<Record<Moneda, number>> {
  const total: Partial<Record<Moneda, number>> = {};
  for (const a of activos(autos)) {
    if (a.cobrado_centavos > 0) total[a.moneda] = (total[a.moneda] ?? 0) + a.cobrado_centavos;
  }
  return total;
}

const enTexto = (montos: Partial<Record<Moneda, number>>) =>
  (Object.entries(montos) as [Moneda, number][]).map(([m, c]) => formatearPlata(c, m)).join(" y ");

/** Qué pasa con la plata cobrada en cada opción, para mostrar antes de confirmar. */
export function textoAnticipo(anticipo: Anticipo, cobrado: Partial<Record<Moneda, number>>, cliente: string): string {
  return anticipo === "sena"
    ? `Los ${enTexto(cobrado)} quedan como seña (cobrados). El resto del precio se cancela.`
    : `Los ${enTexto(cobrado)} quedan a favor de ${cliente} para otro viaje.`;
}

export function validarCancelacion(d: { tienePagos: boolean; anticipo: Anticipo | null; motivo: string }): string | null {
  if (!d.tienePagos) return null;
  if (!d.anticipo) return "Elegí qué pasa con lo cobrado.";
  if (d.motivo.trim() === "") return "Escribí el motivo de la cancelación.";
  return null;
}
