// Métricas de cobranza: tipos y ayudas para los gráficos (escalas y montos cortos).
// Los cálculos los hace la base (metricas()); acá solo se presentan.

import type { Montos } from "./tablero";

export type Tramo = "sin_entregar" | "0_7" | "8_30" | "31_60" | "mas_60";

export const NOMBRE_TRAMO: Record<Tramo, string> = {
  sin_entregar: "Sin entregar",
  "0_7": "0 a 7 días",
  "8_30": "8 a 30 días",
  "31_60": "31 a 60 días",
  mas_60: "Más de 60 días",
};

export type MesMetricas = {
  mes: string;
  facturado: Montos;
  cobrado: Montos;
  recuperado: Montos;
  dias_cobro: number | null;
  autos_cobrados: number;
};

export type Metricas = {
  hoy: string;
  dias_vencimiento: number;
  meses: MesMetricas[];
  antiguedad: { tramo: Tramo; montos: Montos; autos: number }[];
  top_clientes: { cliente_id: string; nombre: string; saldo: Montos; vencido: Montos }[];
  por_cobrar: Montos;
  vencido: Montos;
  dias_cobro_90: number | null;
};

/** Tope del eje redondeado a 1, 1,5, 2, 2,5 o 5 × 10ⁿ, con 4 divisiones o menos. */
export function escalaLimpia(maximo: number): { tope: number; paso: number } {
  if (maximo <= 0) return { tope: 1, paso: 1 };
  const exponente = Math.floor(Math.log10(maximo / 4));
  for (const potencia of [exponente, exponente + 1]) {
    for (const base of [1, 2.5, 5]) {
      const paso = base * 10 ** potencia;
      const tope = Math.ceil(maximo / paso) * paso;
      if (tope / paso <= 4 && Number.isSafeInteger(paso)) return { tope, paso };
    }
  }
  const paso = 10 ** (exponente + 2);
  return { tope: Math.ceil(maximo / paso) * paso, paso };
}

const unDecimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const entero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0, useGrouping: "always" });

/** Montos cortos para ejes y etiquetas: "$ 22,3 M", "$ 650 mil", "$ 950". */
export function formatearPlataCorta(centavos: number, moneda: "ARS" | "USD" = "ARS"): string {
  const simbolo = moneda === "USD" ? "US$" : "$";
  const pesos = centavos / 100;
  if (Math.abs(pesos) >= 1_000_000) return `${simbolo} ${unDecimal.format(pesos / 1_000_000)} M`;
  if (Math.abs(pesos) >= 10_000) return `${simbolo} ${entero.format(pesos / 1_000)} mil`;
  return `${simbolo} ${entero.format(pesos)}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-06" → "jun" (o "junio 2026" completo). */
export function nombreMes(mes: string, completo = false): string {
  const [anio, numero] = mes.split("-").map(Number);
  const nombre = MESES[numero - 1];
  return completo ? `${nombre} ${anio}` : nombre.slice(0, 3);
}
