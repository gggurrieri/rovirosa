// Lógica de cobros: leer montos escritos a mano, sugerir a qué autos aplicar
// un pago (los más viejos primero) y validar antes de mandarlo a la base.
// Funciones puras: no tocan la base. La base vuelve a validar todo con triggers.

import { formatearPlata, type Moneda } from "./formato";
import type { ItemSaldo, Montos } from "./tablero";

export type ItemPendiente = {
  item_id: string;
  cliente_id: string;
  viaje_numero: number;
  fecha_salida: string;
  fecha_entrega: string | null;
  moneda: Moneda;
  saldo_centavos: number;
};

export type Aplicacion = { item_id: string; monto_centavos: number };

export type ResultadoParseo = { ok: true; centavos: number } | { ok: false; error: string };

const NO_ENTIENDO = "No entiendo ese monto. Escribilo así: 1.250.000";
const MILES = String.raw`\d{1,3}(?:\.\d{3})+`;
const CON_DECIMALES = new RegExp(String.raw`^(${MILES}|\d+),(\d+)$`);
const SIN_DECIMALES = new RegExp(String.raw`^(${MILES}|\d+)$`);
const PUNTO_DECIMAL = /^\d+\.\d{1,2}$/;

/** "2.000.000,50" → 200000050 centavos. Formato argentino: punto de miles, coma decimal. */
export function parsearPlata(texto: string): ResultadoParseo {
  const limpio = texto.trim().replace(/^(US)?\$/i, "").replace(/\s/g, "");
  if (limpio === "") return { ok: false, error: "Escribí el monto." };
  if (limpio.startsWith("-")) return { ok: false, error: "El monto tiene que ser mayor a cero." };

  let entero: string;
  let decimales = "";
  const conDecimales = CON_DECIMALES.exec(limpio);
  if (conDecimales) {
    [, entero, decimales] = conDecimales;
    if (decimales.length > 2) return { ok: false, error: "Usá como mucho dos decimales." };
  } else if (SIN_DECIMALES.test(limpio)) {
    entero = limpio;
  } else if (PUNTO_DECIMAL.test(limpio)) {
    return { ok: false, error: `Usá coma para los decimales: ${limpio.replace(".", ",")}` };
  } else {
    return { ok: false, error: NO_ENTIENDO };
  }

  const centavos = Number(entero.replace(/\./g, "")) * 100 + Number(decimales.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos)) return { ok: false, error: NO_ENTIENDO };
  if (centavos === 0) return { ok: false, error: "El monto tiene que ser mayor a cero." };
  return { ok: true, centavos };
}

/** Más viejo primero: por fecha de entrega; los no entregados al final, por fecha de salida. */
export function ordenarPorAntiguedad<T extends ItemPendiente>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.fecha_entrega !== b.fecha_entrega) {
      if (a.fecha_entrega === null) return 1;
      if (b.fecha_entrega === null) return -1;
      return a.fecha_entrega < b.fecha_entrega ? -1 : 1;
    }
    if (a.fecha_salida !== b.fecha_salida) return a.fecha_salida < b.fecha_salida ? -1 : 1;
    return a.viaje_numero - b.viaje_numero;
  });
}

/**
 * Sugerencia automática: reparte el pago entre los autos pendientes, del más viejo al
 * más nuevo. Respeta los autos destildados y los montos cargados a mano; lo que sobra
 * queda como saldo a favor del cliente.
 */
export function armarAplicaciones(
  items: ItemPendiente[],
  montoCentavos: number,
  moneda: Moneda,
  opciones: { excluidos?: string[]; manuales?: Record<string, number> } = {},
) {
  const excluidos = new Set(opciones.excluidos ?? []);
  const manuales = opciones.manuales ?? {};
  const candidatos = ordenarPorAntiguedad(items).filter(
    (i) => i.moneda === moneda && i.saldo_centavos > 0 && !excluidos.has(i.item_id),
  );

  let restante = montoCentavos;
  for (const item of candidatos) {
    if (item.item_id in manuales) restante -= manuales[item.item_id];
  }

  const aplicaciones: Aplicacion[] = [];
  for (const item of candidatos) {
    let monto: number;
    if (item.item_id in manuales) {
      monto = manuales[item.item_id];
    } else {
      monto = Math.max(0, Math.min(item.saldo_centavos, restante));
      restante -= monto;
    }
    if (monto > 0) aplicaciones.push({ item_id: item.item_id, monto_centavos: monto });
  }

  const aplicado = aplicaciones.reduce((suma, a) => suma + a.monto_centavos, 0);
  return { aplicaciones, aplicado, saldoAFavor: montoCentavos - aplicado };
}

/** Devuelve un mensaje para Rodrigo si algo está mal, o null si se puede guardar. */
export function validarAplicaciones(
  items: ItemPendiente[],
  montoCentavos: number,
  moneda: Moneda,
  aplicaciones: Aplicacion[],
): string | null {
  const porId = new Map(items.map((i) => [i.item_id, i]));
  const vistos = new Set<string>();
  let total = 0;

  for (const aplicacion of aplicaciones) {
    if (vistos.has(aplicacion.item_id)) return "Un auto aparece dos veces en el pago.";
    vistos.add(aplicacion.item_id);

    const item = porId.get(aplicacion.item_id);
    if (!item || item.saldo_centavos <= 0) {
      return "Uno de los autos ya no tiene saldo pendiente. Volvé a cargar el pago.";
    }
    if (!Number.isSafeInteger(aplicacion.monto_centavos) || aplicacion.monto_centavos <= 0) {
      return "Los montos aplicados tienen que ser mayores a cero.";
    }
    if (item.moneda !== moneda) {
      return `El viaje #${item.viaje_numero} está en ${item.moneda} y el pago en ${moneda}.`;
    }
    if (aplicacion.monto_centavos > item.saldo_centavos) {
      return `Al viaje #${item.viaje_numero} le aplicaste ${formatearPlata(aplicacion.monto_centavos, moneda)}, pero debe ${formatearPlata(item.saldo_centavos, moneda)}.`;
    }
    total += aplicacion.monto_centavos;
  }

  if (total > montoCentavos) {
    return `Aplicaste ${formatearPlata(total, moneda)}, más que el pago de ${formatearPlata(montoCentavos, moneda)}.`;
  }
  return null;
}

export type FilaSaldoCliente = Omit<ItemSaldo, "viaje_id"> & { cliente_id: string; cliente_nombre: string };

export type ResumenCliente = {
  cliente_id: string;
  nombre: string;
  deuda: Montos;
  vencido: Montos;
  autos: number;
};

/** Quién debe y cuánto: primero los que tienen algo vencido, después por deuda. */
export function resumenPorCliente(filas: FilaSaldoCliente[]): ResumenCliente[] {
  const clientes = new Map<string, ResumenCliente>();
  for (const fila of filas) {
    if (fila.estado_cobro === "cancelado" || fila.saldo_centavos <= 0) continue;
    const cliente = clientes.get(fila.cliente_id) ?? {
      cliente_id: fila.cliente_id,
      nombre: fila.cliente_nombre,
      deuda: {},
      vencido: {},
      autos: 0,
    };
    clientes.set(fila.cliente_id, cliente);
    cliente.autos += 1;
    cliente.deuda[fila.moneda] = (cliente.deuda[fila.moneda] ?? 0) + fila.saldo_centavos;
    if (fila.vencido) {
      cliente.vencido[fila.moneda] = (cliente.vencido[fila.moneda] ?? 0) + fila.saldo_centavos;
    }
  }

  const total = (m: Montos) => (m.ARS ?? 0) + (m.USD ?? 0);
  return [...clientes.values()].sort(
    (a, b) =>
      Number(total(b.vencido) > 0) - Number(total(a.vencido) > 0) ||
      total(b.deuda) - total(a.deuda) ||
      a.nombre.localeCompare(b.nombre, "es"),
  );
}
