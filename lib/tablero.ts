// Cálculos del tablero de inicio y de la lista de viajes.
// Funciones puras: reciben filas de v_items_saldo y no tocan la base.

import { type Moneda, sumarDias } from "./formato";

export type EstadoCobro = "pendiente" | "parcial" | "pagado" | "cancelado";

export type ItemSaldo = {
  viaje_id: string;
  moneda: Moneda;
  saldo_centavos: number;
  estado_cobro: EstadoCobro;
  vencido: boolean;
};

/** Montos separados por moneda: nunca se suman pesos con dólares. */
export type Montos = Partial<Record<Moneda, number>>;

function sumar(montos: Montos, moneda: Moneda, centavos: number) {
  montos[moneda] = (montos[moneda] ?? 0) + centavos;
}

export function resumenCobros(items: ItemSaldo[]): { porCobrar: Montos; vencido: Montos } {
  const porCobrar: Montos = {};
  const vencido: Montos = {};
  for (const item of items) {
    if (item.estado_cobro === "cancelado" || item.saldo_centavos <= 0) continue;
    sumar(porCobrar, item.moneda, item.saldo_centavos);
    if (item.vencido) sumar(vencido, item.moneda, item.saldo_centavos);
  }
  return { porCobrar, vencido };
}

/** Saldo de cada viaje = suma del saldo de sus autos (sin los cancelados). */
export function saldoPorViaje(items: ItemSaldo[]): Map<string, Montos> {
  const saldos = new Map<string, Montos>();
  for (const item of items) {
    const montos = saldos.get(item.viaje_id) ?? {};
    saldos.set(item.viaje_id, montos);
    if (item.estado_cobro === "cancelado") continue;
    sumar(montos, item.moneda, Math.max(item.saldo_centavos, 0));
  }
  return saldos;
}

/** Rango de fechas "AAAA-MM-DD" desde hoy hasta hoy + dias, ambos inclusive. */
export function ventanaProximosDias(hoy: string, dias: number) {
  return { desde: hoy, hasta: sumarDias(hoy, dias) };
}

/** ¿Hay algún monto distinto de cero, en cualquier moneda? */
export const tieneMonto = (m: Montos) => Object.values(m).some((v) => (v ?? 0) !== 0);
