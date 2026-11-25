import { describe, expect, it } from "vitest";
import {
  clasificarViajesHoy,
  esMesFuturo,
  mesAnterior,
  mesDe,
  mesSiguiente,
  nombreMes,
  puedeEmpezar,
  rangoMes,
  type ViajeHoy,
} from "./hoy";

const HOY = "2026-11-26";
const viaje = (numero: number, estado: ViajeHoy["estado"], fecha_salida: string): ViajeHoy => ({
  id: `v${numero}`,
  numero,
  estado,
  fecha_salida,
  origen: "Buenos Aires",
  destino: "Rosario",
  unidad: "Mosquito 1",
  chofer: "Chofer A",
  autos: 1,
});

describe("clasificarViajesHoy", () => {
  const viajes = [
    viaje(1, "entregado", "2026-11-03"),
    viaje(2, "programado", "2026-11-24"),
    viaje(3, "en_viaje", "2026-11-25"),
    viaje(4, "programado", "2026-11-26"),
    viaje(5, "reprogramado", "2026-12-03"),
    viaje(6, "programado", "2026-12-04"),
    viaje(7, "cancelado", "2026-11-27"),
    viaje(8, "en_retiro", "2026-11-22"),
    viaje(9, "programado", "2026-11-28"),
  ];

  it("separa atrasados, en curso y próximos 7 días, cada grupo del más cercano al más lejano", () => {
    const r = clasificarViajesHoy(viajes, HOY);
    expect(r.atrasados.map((v) => v.numero)).toEqual([2]);
    expect(r.enCurso.map((v) => v.numero)).toEqual([8, 3]);
    expect(r.proximos.map((v) => v.numero)).toEqual([4, 9, 5]);
  });

  it("sin viajes devuelve grupos vacíos", () => {
    expect(clasificarViajesHoy([], HOY)).toEqual({ atrasados: [], enCurso: [], proximos: [] });
  });
});

describe("puedeEmpezar", () => {
  it("solo si está programado y sale hoy o ya debía salir", () => {
    expect(puedeEmpezar(viaje(1, "programado", HOY), HOY)).toBe(true);
    expect(puedeEmpezar(viaje(1, "reprogramado", "2026-11-20"), HOY)).toBe(true);
    expect(puedeEmpezar(viaje(1, "programado", "2026-11-27"), HOY)).toBe(false);
    expect(puedeEmpezar(viaje(1, "en_viaje", HOY), HOY)).toBe(false);
    expect(puedeEmpezar(viaje(1, "cancelado", HOY), HOY)).toBe(false);
  });
});

describe("meses", () => {
  it("toma el mes de una fecha y lo nombra en español", () => {
    expect(mesDe(HOY)).toEqual({ anio: 2026, mes: 11 });
    expect(nombreMes({ anio: 2026, mes: 11 })).toBe("Noviembre 2026");
  });

  it("navega entre meses cruzando el año", () => {
    expect(mesAnterior({ anio: 2027, mes: 1 })).toEqual({ anio: 2026, mes: 12 });
    expect(mesSiguiente({ anio: 2026, mes: 12 })).toEqual({ anio: 2027, mes: 1 });
    expect(mesAnterior({ anio: 2026, mes: 11 })).toEqual({ anio: 2026, mes: 10 });
  });

  it("sabe si un mes es futuro respecto de hoy", () => {
    expect(esMesFuturo({ anio: 2026, mes: 12 }, HOY)).toBe(true);
    expect(esMesFuturo({ anio: 2026, mes: 11 }, HOY)).toBe(false);
    expect(esMesFuturo({ anio: 2025, mes: 12 }, HOY)).toBe(false);
  });

  it("da el primer y último día del mes, incluido febrero bisiesto", () => {
    expect(rangoMes({ anio: 2026, mes: 11 })).toEqual({ desde: "2026-11-01", hasta: "2026-11-30" });
    expect(rangoMes({ anio: 2028, mes: 2 })).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });
});
