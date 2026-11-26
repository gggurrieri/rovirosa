// Recordatorio de cobro por WhatsApp: el mensaje, el número y el link. Sin API paga:
// se abre WhatsApp con el texto escrito y la persona lo manda.

import { formatearFecha, formatearPlata, type Moneda, ZONA_HORARIA } from "./formato";

export type AutoAdeudado = {
  vehiculo: string | null;
  origen: string;
  destino: string;
  fecha_entrega: string | null;
  moneda: Moneda;
  saldo: number;
};

export const MENSAJE_POR_DEFECTO =
  "Hola {cliente}, te escribo de {empresa}. Te recuerdo el saldo de {total} por {detalle}.\n\n{datos}¡Gracias!";

/** "Concesionaria Norte (ficticia)" → "Concesionaria Norte": las aclaraciones no van en el saludo. */
const sinAclaracion = (nombre: string) => nombre.replace(/\s*\([^)]*\)\s*$/, "").trim();

const recorrido = (a: AutoAdeudado) =>
  `${a.vehiculo ?? "auto"} (${a.origen} → ${a.destino}${a.fecha_entrega ? `, entregado el ${formatearFecha(a.fecha_entrega)}` : ""})`;

export function armarMensaje(d: {
  cliente: string;
  empresa: string;
  autos: AutoAdeudado[];
  datosCobro: string | null;
  plantilla?: string | null;
}): string {
  const total = (["ARS", "USD"] as const)
    .map((m) => [m, d.autos.filter((a) => a.moneda === m).reduce((s, a) => s + a.saldo, 0)] as const)
    .filter(([, monto]) => monto > 0)
    .map(([m, monto]) => formatearPlata(monto, m))
    .join(" y ");
  const detalle =
    d.autos.length === 1
      ? `el traslado de tu ${recorrido(d.autos[0])}`
      : `estos traslados:\n${d.autos.map((a) => `• ${recorrido(a)}: ${formatearPlata(a.saldo, a.moneda)}`).join("\n")}`;
  // Con varios autos el detalle termina en una lista: sin punto después del último renglón.
  const base = d.plantilla?.trim() || MENSAJE_POR_DEFECTO;
  const plantilla = d.autos.length > 1 ? base.replaceAll("{detalle}.", "{detalle}") : base;
  const datos = d.datosCobro?.trim() ? (d.plantilla?.trim() ? d.datosCobro.trim() : `Podés transferir a:\n${d.datosCobro.trim()}\n\n`) : "";
  return plantilla
    .replaceAll("{cliente}", sinAclaracion(d.cliente))
    .replaceAll("{empresa}", d.empresa)
    .replaceAll("{total}", total)
    .replaceAll("{detalle}", detalle)
    .replaceAll("{datos}", datos)
    .trim();
}

/**
 * Número en formato internacional para wa.me (solo dígitos). Un número argentino
 * sin código de país se toma como celular: 549 + característica + número.
 */
export function normalizarWhatsApp(texto: string): string | null {
  let n = texto.replace(/\D/g, "").replace(/^00/, "");
  if (texto.trim().startsWith("+") || n.startsWith("54")) {
    if (n.startsWith("54") && !n.startsWith("549")) n = `549${n.slice(2)}`;
  } else {
    n = `549${n.replace(/^0/, "")}`;
  }
  return n.length >= 10 && n.length <= 15 ? n : null;
}

export const linkWhatsAppA = (numero: string, texto: string) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

const diaAR = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(d);

/** "hoy", "ayer", "hace 3 días" (por día calendario argentino). */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const dias = Math.round((Date.parse(diaAR(ahora)) - Date.parse(diaAR(new Date(iso)))) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

const normalizarNombre = (t: string) =>
  sinAclaracion(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Ids de clientes que tienen otro con el mismo nombre (sin tildes, mayúsculas ni aclaraciones). */
export function posiblesDuplicados(clientes: { id: string; nombre: string }[]): Set<string> {
  const porNombre = new Map<string, string[]>();
  for (const c of clientes) {
    const clave = normalizarNombre(c.nombre);
    porNombre.set(clave, [...(porNombre.get(clave) ?? []), c.id]);
  }
  return new Set([...porNombre.values()].filter((ids) => ids.length > 1).flat());
}
