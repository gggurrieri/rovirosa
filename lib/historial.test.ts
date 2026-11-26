import { describe, expect, it } from "vitest";
import { armarHistorial, type EventoAuditoria, formatearMomento } from "./historial";

const ctx = {
  usuarios: new Map([["u1", "Gabi"], ["u2", "Admin"]]),
  unidades: new Map([["m1", "Mosquito 1"], ["m2", "Mosquito 2"]]),
  choferes: new Map([["c1", "Chofer A"]]),
  autos: new Map([["i1", "Audi R8 (Juan)"], ["i2", "BMW M3 (Juan)"]]),
};
const viaje = { estado: "programado", fecha_salida: "2026-12-01", fecha_llegada_estimada: null, origen: "Buenos Aires", destino: "Rosario", unidad_id: "m1", chofer_id: "c1", notas: null };
const ev = (e: Partial<EventoAuditoria>): EventoAuditoria => ({
  tabla: "viajes",
  registro_id: "v1",
  accion: "UPDATE",
  antes: viaje,
  despues: viaje,
  usuario: "u2",
  en: "2026-11-26T17:05:00Z",
  motivo: null,
  ...e,
});

describe("armarHistorial", () => {
  it("al crear el viaje muestra una sola línea (sin una por cada auto)", () => {
    const r = armarHistorial(
      [
        ev({ accion: "INSERT", antes: null, usuario: "u1", en: "2026-11-20T12:00:00Z" }),
        ev({ tabla: "items_viaje", registro_id: "i1", accion: "INSERT", antes: null, despues: { precio_centavos: 1, moneda: "ARS" }, usuario: "u1", en: "2026-11-20T12:00:00Z" }),
      ],
      ctx,
    );
    expect(r).toEqual([{ en: "2026-11-20T12:00:00Z", quien: "Gabi", cambios: ["Creó el viaje"], motivo: null }]);
  });

  it("agrupa los cambios de un mismo guardado y los traduce", () => {
    const r = armarHistorial(
      [
        ev({ despues: { ...viaje, fecha_salida: "2026-12-02", unidad_id: "m2", chofer_id: null, notas: "Retirar 9 hs" } }),
        ev({ tabla: "items_viaje", registro_id: "i1", antes: { precio_centavos: 90000000, moneda: "ARS", cancelado: false }, despues: { precio_centavos: 95000000, moneda: "ARS", cancelado: false } }),
        ev({ tabla: "items_viaje", registro_id: "i2", antes: { precio_centavos: 1, moneda: "ARS", cancelado: false }, despues: { precio_centavos: 1, moneda: "ARS", cancelado: true } }),
      ],
      ctx,
    );
    expect(r).toEqual([
      {
        en: "2026-11-26T17:05:00Z",
        quien: "Admin",
        cambios: [
          "Salida: 01/12/2026 → 02/12/2026",
          "Unidad: Mosquito 1 → Mosquito 2",
          "Chofer: Chofer A → sin chofer",
          "Cambió las notas",
          "Precio del Audi R8 (Juan): $ 900.000 → $ 950.000",
          "Quitó el BMW M3 (Juan)",
        ],
        motivo: null,
      },
    ]);
  });

  it("muestra el motivo y ordena del más nuevo al más viejo", () => {
    const r = armarHistorial(
      [
        ev({ en: "2026-11-21T10:00:00Z", despues: { ...viaje, estado: "en_viaje" } }),
        ev({ tabla: "items_viaje", registro_id: "i1", en: "2026-11-25T10:00:00Z", motivo: "Peaje extra", antes: { precio_centavos: 100, moneda: "USD" }, despues: { precio_centavos: 250, moneda: "USD" } }),
      ],
      ctx,
    );
    expect(r.map((l) => l.cambios[0])).toEqual(["Precio del Audi R8 (Juan): US$ 1 → US$ 2,50", "Estado: Programado → En viaje"]);
    expect(r[0].motivo).toBe("Peaje extra");
  });

  it("al cancelar el viaje no repite una línea por cada auto", () => {
    const r = armarHistorial(
      [
        ev({ despues: { ...viaje, estado: "cancelado" } }),
        ev({ tabla: "items_viaje", registro_id: "i1", antes: { cancelado: false }, despues: { cancelado: true } }),
      ],
      ctx,
    );
    expect(r[0].cambios).toEqual(["Estado: Programado → Cancelado"]);
  });

  it("autos agregados después y usuarios o autos desconocidos", () => {
    const r = armarHistorial(
      [ev({ tabla: "items_viaje", registro_id: "i9", accion: "INSERT", antes: null, despues: { precio_centavos: 1 }, usuario: null })],
      ctx,
    );
    expect(r).toEqual([{ en: "2026-11-26T17:05:00Z", quien: "Alguien", cambios: ["Agregó un auto"], motivo: null }]);
  });

  it("descarta cambios sin nada visible", () => {
    expect(armarHistorial([ev({ despues: { ...viaje, km_salida: 10 } })], ctx)).toEqual([]);
  });
});

describe("formatearMomento", () => {
  it("fecha y hora de Argentina", () => {
    expect(formatearMomento("2026-11-26T17:05:00Z")).toBe("26/11/2026 14:05");
  });
});
