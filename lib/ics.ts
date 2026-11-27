// Calendario en formato iCal (lo leen Google Calendar, el iPhone y Outlook) y el link
// "Agregar a Google Calendar" de un viaje. Sin precios ni datos de clientes.

import { NOMBRE_MOTIVO, type MotivoBloqueo } from "./calendario";
import { sumarDias } from "./formato";
import { NOMBRE_ESTADO, type EstadoViaje } from "./viajes";

export type ViajeICS = {
  id: string;
  numero: number;
  fecha_salida: string;
  fecha_llegada: string | null;
  origen: string;
  destino: string;
  estado: EstadoViaje;
  unidad: string | null;
  chofer: string | null;
  autos: number;
};
export type BloqueoICS = { id: string; desde: string; hasta: string; motivo: MotivoBloqueo; quien: string | null };

/** En iCal, comas, punto y coma, barras y saltos de línea van escapados. */
export const escaparICS = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Ningún renglón puede pasar de 75 bytes: se sigue en el siguiente, empezando con un espacio. */
export function plegar(linea: string): string {
  const partes: string[] = [];
  let actual = "";
  let bytes = 0;
  for (const letra of linea) {
    const b = Buffer.byteLength(letra);
    const limite = partes.length === 0 ? 75 : 74;
    if (bytes + b > limite) {
      partes.push(actual);
      actual = "";
      bytes = 0;
    }
    actual += letra;
    bytes += b;
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

const fechaICS = (iso: string) => iso.replace(/-/g, "");
const sello = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export const tituloViaje = (v: ViajeICS) => `#${v.numero} ${v.origen} → ${v.destino}${v.unidad ? ` · ${v.unidad}` : ""}`;

function detalleViaje(v: ViajeICS, url: string) {
  return [
    v.unidad && `Unidad: ${v.unidad}`,
    v.chofer && `Chofer: ${v.chofer}`,
    `Autos: ${v.autos}`,
    `Estado: ${NOMBRE_ESTADO[v.estado]}`,
    !v.fecha_llegada && "Sin llegada estimada",
    `Ver en la app: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function generarICS(d: { empresa: string; viajes: ViajeICS[]; bloqueos: BloqueoICS[]; urlBase: string; ahora?: Date }): string {
  const stamp = sello(d.ahora ?? new Date());
  const renglones = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rovirosa//Calendario de viajes//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escaparICS(`${d.empresa} · Viajes`)}`,
    "X-WR-TIMEZONE:America/Argentina/Buenos_Aires",
    // Pedido de refresco cada hora (Google igual decide cuándo: suele tardar varias horas).
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const v of d.viajes) {
    const url = `${d.urlBase}/viajes/${v.id}`;
    renglones.push(
      "BEGIN:VEVENT",
      `UID:viaje-${v.id}@rovirosa`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${fechaICS(v.fecha_salida)}`,
      `DTEND;VALUE=DATE:${fechaICS(sumarDias(v.fecha_llegada ?? v.fecha_salida, 1))}`,
      `SUMMARY:${escaparICS(tituloViaje(v))}`,
      `LOCATION:${escaparICS(v.origen)}`,
      `DESCRIPTION:${escaparICS(detalleViaje(v, url))}`,
      `URL:${url}`,
      "END:VEVENT",
    );
  }
  for (const b of d.bloqueos) {
    renglones.push(
      "BEGIN:VEVENT",
      `UID:bloqueo-${b.id}@rovirosa`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${fechaICS(b.desde)}`,
      `DTEND;VALUE=DATE:${fechaICS(sumarDias(b.hasta, 1))}`,
      `SUMMARY:${escaparICS(`🔧 ${NOMBRE_MOTIVO[b.motivo]}${b.quien ? ` · ${b.quien}` : ""}`)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  renglones.push("END:VCALENDAR");
  return `${renglones.map(plegar).join("\r\n")}\r\n`;
}

/** Abre Google Calendar con el viaje ya armado (para agregarlo al instante, sin esperar la suscripción). */
export function linkGoogleCalendar(v: ViajeICS, url: string): string {
  const fin = sumarDias(v.fecha_llegada ?? v.fecha_salida, 1);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: tituloViaje(v),
    dates: `${fechaICS(v.fecha_salida)}/${fechaICS(fin)}`,
    details: detalleViaje(v, url),
    location: v.origen,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
