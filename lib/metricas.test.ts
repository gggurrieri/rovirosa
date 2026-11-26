import { describe, expect, it } from "vitest";
import { escalaLimpia, formatearPlataCorta, nombreMes, NOMBRE_TRAMO } from "./metricas";

describe("escalaLimpia", () => {
  it("redondea el tope a un número limpio con 4 divisiones o menos", () => {
    expect(escalaLimpia(2225000000)).toEqual({ tope: 3000000000, paso: 1000000000 });
    expect(escalaLimpia(870000000)).toEqual({ tope: 1000000000, paso: 250000000 });
    expect(escalaLimpia(140000000)).toEqual({ tope: 150000000, paso: 50000000 });
    expect(escalaLimpia(12)).toEqual({ tope: 15, paso: 5 });
  });
  it("sin datos, una escala mínima para que el gráfico no se rompa", () => {
    expect(escalaLimpia(0)).toEqual({ tope: 1, paso: 1 });
  });
});

describe("formatearPlataCorta", () => {
  it("millones con un decimal, miles con 'mil'", () => {
    expect(formatearPlataCorta(2225000000)).toBe("$ 22,3 M");
    expect(formatearPlataCorta(2000000000)).toBe("$ 20 M");
    expect(formatearPlataCorta(65000000)).toBe("$ 650 mil");
    expect(formatearPlataCorta(95000)).toBe("$ 950");
    expect(formatearPlataCorta(0)).toBe("$ 0");
    expect(formatearPlataCorta(150000, "USD")).toBe("US$ 1.500");
  });
});

describe("textos", () => {
  it("meses cortos y tramos de antigüedad", () => {
    expect(nombreMes("2026-06")).toBe("jun");
    expect(nombreMes("2026-11", true)).toBe("noviembre 2026");
    expect(NOMBRE_TRAMO.mas_60).toBe("Más de 60 días");
  });
});
