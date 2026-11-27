import { describe, expect, it } from "vitest";
import { escaparICS, generarICS, linkGoogleCalendar, plegar } from "./ics";

const viaje = {
  id: "v1", numero: 13, fecha_salida: "2026-12-01", fecha_llegada: "2026-12-03", origen: "Buenos Aires", destino: "Córdoba",
  estado: "programado" as const, unidad: "Mosquito 1", chofer: "Chofer A", autos: 2,
};
const ahora = new Date("2026-11-27T15:04:05Z");

describe("generarICS", () => {
  const ics = generarICS({ empresa: "Rovirosa", viajes: [viaje, { ...viaje, id: "v2", numero: 14, fecha_llegada: null, chofer: null }], bloqueos: [
    { id: "b1", desde: "2026-12-05", hasta: "2026-12-06", motivo: "service", quien: "Mosquito 2" },
  ], urlBase: "https://app.ejemplo", ahora });
  const lineas = ics.split("\r\n");

  it("es un calendario válido con renglones CRLF", () => {
    expect(lineas[0]).toBe("BEGIN:VCALENDAR");
    expect(lineas).toContain("VERSION:2.0");
    expect(lineas).toContain("X-WR-CALNAME:Rovirosa · Viajes");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(lineas.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(3);
  });

  it("un viaje es un evento de día completo de la salida a la llegada (fin exclusivo)", () => {
    expect(ics).toContain("UID:viaje-v1@rovirosa\r\nDTSTAMP:20261127T150405Z\r\nDTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261204\r\n");
    expect(ics).toContain("SUMMARY:#13 Buenos Aires → Córdoba · Mosquito 1\r\n");
    expect(ics).toContain("URL:https://app.ejemplo/viajes/v1\r\n");
  });

  it("sin llegada estimada ocupa el día de salida y lo aclara", () => {
    expect(ics).toContain("UID:viaje-v2@rovirosa\r\nDTSTAMP:20261127T150405Z\r\nDTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261202\r\n");
    expect(ics.replace(/\r\n /g, "")).toContain("Sin llegada estimada");
  });

  it("los bloqueos van como eventos aparte", () => {
    expect(ics).toContain("UID:bloqueo-b1@rovirosa\r\nDTSTAMP:20261127T150405Z\r\nDTSTART;VALUE=DATE:20261205\r\nDTEND;VALUE=DATE:20261207\r\nSUMMARY:🔧 Service · Mosquito 2\r\n");
  });

  it("ningún renglón pasa de 75 bytes", () => {
    expect(lineas.every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});

describe("escapes y plegado", () => {
  it("escapa comas, punto y coma, barras y saltos de línea", () => {
    expect(escaparICS("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
  });
  it("pliega renglones largos sin cortar letras con tilde", () => {
    const largo = `DESCRIPTION:${"á".repeat(60)}`;
    const r = plegar(largo).split("\r\n");
    expect(r.every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(r.map((l, i) => (i === 0 ? l : l.slice(1))).join("")).toBe(largo);
  });
});

describe("linkGoogleCalendar", () => {
  it("abre Google Calendar con el evento armado", () => {
    const url = new URL(linkGoogleCalendar(viaje, "https://app.ejemplo/viajes/v1"));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("#13 Buenos Aires → Córdoba · Mosquito 1");
    expect(url.searchParams.get("dates")).toBe("20261201/20261204");
    expect(url.searchParams.get("details")).toContain("https://app.ejemplo/viajes/v1");
  });
});
