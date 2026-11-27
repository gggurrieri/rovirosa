import { describe, expect, it } from "vitest";
import { armarFila, estadoDelDia, etiquetaDia, rangoCalendario, type ViajeCal, type BloqueoCal } from "./calendario";

const viaje = (numero: number, salida: string, llegada: string | null, unidad = "u1"): ViajeCal => ({
  id: `v${numero}`, numero, unidad_id: unidad, chofer_id: null, fecha_salida: salida, fecha_llegada: llegada,
  origen: "Buenos Aires", destino: "Córdoba", estado: "programado", autos: 2,
});
const service: BloqueoCal = { id: "b1", unidad_id: "u1", chofer_id: null, desde: "2026-12-03", hasta: "2026-12-04", motivo: "service", notas: null };

describe("rangoCalendario", () => {
  it("2 semanas desde el día pedido, con flechas de 14 días", () => {
    const r = rangoCalendario("2s", "2026-11-30");
    expect(r.dias).toHaveLength(14);
    expect([r.desde, r.hasta, r.anterior, r.siguiente]).toEqual(["2026-11-30", "2026-12-13", "2026-11-16", "2026-12-14"]);
  });
  it("mes completo, de cualquier día del mes, con flechas de mes", () => {
    const r = rangoCalendario("mes", "2026-02-17");
    expect(r.dias).toHaveLength(28);
    expect([r.desde, r.hasta, r.anterior, r.siguiente]).toEqual(["2026-02-01", "2026-02-28", "2026-01-01", "2026-03-01"]);
    expect(rangoCalendario("mes", "2026-12-05").siguiente).toBe("2027-01-01");
  });
});

describe("armarFila", () => {
  const dias = rangoCalendario("2s", "2026-12-01").dias;

  it("un viaje de 3 días ocupa 3 columnas; sin llegada, solo la de salida", () => {
    const f = armarFila("u1", dias, [viaje(13, "2026-12-01", "2026-12-03"), viaje(14, "2026-12-08", null)], []);
    expect(f.segmentos.map((s) => [s.etiqueta, s.inicio, s.fin, s.carril, s.sinLlegada])).toEqual([
      ["#13", 0, 2, 0, false],
      ["#14", 7, 7, 0, true],
    ]);
    expect(f.carriles).toBe(1);
    expect(f.choques).toEqual([]);
  });

  it("recorta lo que empieza antes o termina después del rango", () => {
    const f = armarFila("u1", dias, [viaje(10, "2026-11-29", "2026-12-02"), viaje(20, "2026-12-13", "2026-12-20")], []);
    expect(f.segmentos.map((s) => [s.inicio, s.fin, s.cortadoAntes, s.cortadoDespues])).toEqual([
      [0, 1, true, false],
      [12, 13, false, true],
    ]);
  });

  it("superposiciones: van en otro carril y se marcan como choque (viaje con viaje y con bloqueo)", () => {
    const f = armarFila("u1", dias, [viaje(13, "2026-12-01", "2026-12-03"), viaje(15, "2026-12-03", "2026-12-04")], [service]);
    expect(f.segmentos.map((s) => [s.etiqueta, s.carril])).toEqual([
      ["#13", 0],
      ["#15", 1],
      ["Service", 2],
    ]);
    expect(f.carriles).toBe(3);
    expect(f.choques).toEqual([
      { desde: "2026-12-03", hasta: "2026-12-03", etiquetas: ["#13", "#15", "Service"] },
      { desde: "2026-12-04", hasta: "2026-12-04", etiquetas: ["#15", "Service"] },
    ]);
    expect(f.segmentos.filter((s) => s.choca).map((s) => s.etiqueta)).toEqual(["#13", "#15", "Service"]);
  });

  it("solo lo de esa unidad", () => {
    expect(armarFila("u2", dias, [viaje(13, "2026-12-01", null)], [service]).segmentos).toEqual([]);
  });
});

describe("estadoDelDia", () => {
  it("libre, en viaje (con día de vuelta), bloqueado o con choque", () => {
    const viajes = [viaje(13, "2026-12-01", "2026-12-03")];
    expect(estadoDelDia("u1", "2026-12-05", viajes, [service]).tipo).toBe("libre");
    expect(estadoDelDia("u1", "2026-12-02", viajes, [service])).toMatchObject({ tipo: "viaje", texto: "En viaje #13 · Buenos Aires → Córdoba (vuelve el 03/12)" });
    expect(estadoDelDia("u1", "2026-12-04", viajes, [service])).toMatchObject({ tipo: "bloqueo", texto: "Service hasta el 04/12" });
    expect(estadoDelDia("u1", "2026-12-03", [...viajes, viaje(15, "2026-12-03", null)], [])).toMatchObject({ tipo: "choque", texto: "Choque: #13 y #15" });
  });
});

describe("etiquetaDia", () => {
  it("día de la semana corto y número", () => {
    expect(etiquetaDia("2026-11-30")).toEqual({ semana: "lun", numero: "30", finDeSemana: false });
    expect(etiquetaDia("2026-12-06")).toEqual({ semana: "dom", numero: "6", finDeSemana: true });
  });
});
