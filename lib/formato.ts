// Formato argentino para mostrar plata y fechas.
// La plata viaja siempre en centavos enteros; se convierte a pesos solo acá, al mostrar.

export type Moneda = "ARS" | "USD";

export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

const SIMBOLO: Record<Moneda, string> = { ARS: "$", USD: "US$" };

const numeroSinDecimales = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: "always",
});

const numeroConDecimales = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

/** 125000000 → "$ 1.250.000"; 125000050 → "$ 1.250.000,50"; -5000000 → "-$ 50.000". */
export function formatearPlata(centavos: number, moneda: Moneda = "ARS"): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new Error(`El monto debe ser un entero en centavos: ${centavos}`);
  }
  const absoluto = Math.abs(centavos);
  const formato = absoluto % 100 === 0 ? numeroSinDecimales : numeroConDecimales;
  const signo = centavos < 0 ? "-" : "";
  return `${signo}${SIMBOLO[moneda]} ${formato.format(absoluto / 100)}`;
}

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

const fechaArgentina = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_HORARIA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * "2026-11-23" → "23/11/2026".
 * Las columnas `date` se formatean tal cual (sin pasar por Date, que las leería
 * como medianoche UTC y en Argentina mostraría el día anterior).
 * Los timestamps se muestran en hora de Buenos Aires.
 */
export function formatearFecha(valor: string | Date): string {
  if (typeof valor === "string") {
    const partes = SOLO_FECHA.exec(valor);
    if (partes) return `${partes[3]}/${partes[2]}/${partes[1]}`;
  }
  const fecha = typeof valor === "string" ? new Date(valor) : valor;
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`Fecha inválida: ${String(valor)}`);
  }
  return fechaArgentina.format(fecha);
}

const fechaIsoArgentina = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha de hoy en Argentina como "AAAA-MM-DD" (el servidor corre en UTC). */
export function hoyEnArgentina(ahora: Date = new Date()): string {
  return fechaIsoArgentina.format(ahora);
}

/** Suma (o resta) días a una fecha "AAAA-MM-DD" sin depender de la zona horaria. */
export function sumarDias(fechaIso: string, dias: number): string {
  const partes = SOLO_FECHA.exec(fechaIso);
  if (!partes) throw new Error(`Fecha inválida: ${fechaIso}`);
  const fecha = new Date(Date.UTC(+partes[1], +partes[2] - 1, +partes[3] + dias));
  return fecha.toISOString().slice(0, 10);
}
