import { describe, expect, it } from "vitest";
import { textoAnticipo, progresoEntrega, totalCobrado, validarCancelacion, validarFechaEntrega } from "./entregas";

const autos = [
  { estado_cobro: "pendiente", fecha_entrega: "2026-11-20", cobrado_centavos: 0, moneda: "ARS" as const },
  { estado_cobro: "parcial", fecha_entrega: null, cobrado_centavos: 30000000, moneda: "ARS" as const },
  { estado_cobro: "pendiente", fecha_entrega: null, cobrado_centavos: 0, moneda: "ARS" as const },
  { estado_cobro: "cancelado", fecha_entrega: null, cobrado_centavos: 0, moneda: "ARS" as const },
];

describe("progresoEntrega", () => {
  it("cuenta solo los autos activos", () => {
    expect(progresoEntrega(autos)).toEqual({ entregados: 1, total: 3, texto: "1 de 3 entregados" });
    expect(progresoEntrega([autos[0]]).texto).toBe("1 de 1 entregado");
  });
});

describe("validarFechaEntrega", () => {
  it("no a futuro ni antes de la salida", () => {
    expect(validarFechaEntrega("2026-11-26", "2026-11-20", "2026-11-25")).toBe("La fecha de entrega no puede ser posterior a hoy.");
    expect(validarFechaEntrega("2026-11-19", "2026-11-20", "2026-11-25")).toBe("La fecha de entrega no puede ser antes de la salida.");
    expect(validarFechaEntrega("", "2026-11-20", "2026-11-25")).toBe("Elegí la fecha de entrega.");
    expect(validarFechaEntrega("2026-11-22", "2026-11-20", "2026-11-25")).toBeNull();
  });
});

describe("cancelar con anticipo", () => {
  it("suma lo cobrado de los autos activos", () => {
    expect(totalCobrado(autos)).toEqual({ ARS: 30000000 });
    expect(totalCobrado([autos[0]])).toEqual({});
  });

  it("explica qué pasa con la plata en cada opción", () => {
    expect(textoAnticipo("sena", { ARS: 30000000 }, "Juan")).toBe("Los $ 300.000 quedan como seña (cobrados). El resto del precio se cancela.");
    expect(textoAnticipo("a_favor", { ARS: 30000000 }, "Juan")).toBe("Los $ 300.000 quedan a favor de Juan para otro viaje.");
    expect(textoAnticipo("a_favor", { ARS: 30000000, USD: 100 }, "Juan")).toBe("Los $ 300.000 y US$ 1 quedan a favor de Juan para otro viaje.");
  });

  it("con pagos pide elegir y motivo; sin pagos, nada", () => {
    expect(validarCancelacion({ tienePagos: false, anticipo: null, motivo: "" })).toBeNull();
    expect(validarCancelacion({ tienePagos: true, anticipo: null, motivo: "x" })).toBe("Elegí qué pasa con lo cobrado.");
    expect(validarCancelacion({ tienePagos: true, anticipo: "sena", motivo: "  " })).toBe("Escribí el motivo de la cancelación.");
    expect(validarCancelacion({ tienePagos: true, anticipo: "a_favor", motivo: "Desistió" })).toBeNull();
  });
});
