import { describe, expect, it } from "vitest";
import {
  formatearFecha,
  formatearPlata,
  hoyEnArgentina,
  sumarDias,
} from "./formato";

describe("formatearPlata", () => {
  it("convierte centavos a pesos con separador de miles", () => {
    expect(formatearPlata(125_000_000)).toBe("$ 1.250.000");
  });

  it("muestra el total por cobrar del seed", () => {
    expect(formatearPlata(870_000_000)).toBe("$ 8.700.000");
  });

  it("agrupa también los miles chicos", () => {
    expect(formatearPlata(250_000)).toBe("$ 2.500");
  });

  it("muestra cero", () => {
    expect(formatearPlata(0)).toBe("$ 0");
  });

  it("muestra decimales solo si no son ,00", () => {
    expect(formatearPlata(125_000_050)).toBe("$ 1.250.000,50");
    expect(formatearPlata(5)).toBe("$ 0,05");
  });

  it("pone el signo adelante en los negativos", () => {
    expect(formatearPlata(-5_000_000)).toBe("-$ 50.000");
  });

  it("usa US$ para dólares", () => {
    expect(formatearPlata(1_200_000, "USD")).toBe("US$ 12.000");
  });

  it("rechaza montos que no son centavos enteros", () => {
    expect(() => formatearPlata(10.5)).toThrow();
    expect(() => formatearPlata(Number.NaN)).toThrow();
  });
});

describe("formatearFecha", () => {
  it("formatea una fecha sin hora (columna date) sin correrla de día", () => {
    expect(formatearFecha("2026-11-23")).toBe("23/11/2026");
    expect(formatearFecha("2026-01-01")).toBe("01/01/2026");
  });

  it("formatea un timestamp en hora de Argentina", () => {
    // 02:00 UTC del 24/11 son las 23:00 del 23/11 en Buenos Aires.
    expect(formatearFecha("2026-11-24T02:00:00Z")).toBe("23/11/2026");
    expect(formatearFecha(new Date("2026-11-24T15:00:00Z"))).toBe("24/11/2026");
  });

  it("rechaza fechas inválidas", () => {
    expect(() => formatearFecha("no es fecha")).toThrow();
  });
});

describe("hoyEnArgentina", () => {
  it("usa la fecha de Buenos Aires, no la UTC", () => {
    // 01:30 UTC del 24/11 todavía es 23/11 en Argentina.
    expect(hoyEnArgentina(new Date("2026-11-24T01:30:00Z"))).toBe("2026-11-23");
    expect(hoyEnArgentina(new Date("2026-11-24T03:30:00Z"))).toBe("2026-11-24");
  });
});

describe("sumarDias", () => {
  it("suma días cruzando fin de mes y de año", () => {
    expect(sumarDias("2026-11-24", 7)).toBe("2026-12-01");
    expect(sumarDias("2026-12-28", 7)).toBe("2027-01-04");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});
