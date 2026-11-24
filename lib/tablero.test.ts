import { describe, expect, it } from "vitest";
import itemsSeed from "./__fixtures__/items-saldo-seed.json";
import {
  type ItemSaldo,
  resumenCobros,
  saldoPorViaje,
  ventanaProximosDias,
} from "./tablero";

// Foto de v_items_saldo con el seed, tomada el 24/11/2026.
const seed = itemsSeed as ItemSaldo[];

const item = (parcial: Partial<ItemSaldo>): ItemSaldo => ({
  viaje_id: "v1",
  moneda: "ARS",
  saldo_centavos: 0,
  estado_cobro: "pendiente",
  vencido: false,
  ...parcial,
});

describe("resumenCobros", () => {
  it("con el seed da $ 8.700.000 por cobrar y $ 2.700.000 vencido", () => {
    const resumen = resumenCobros(seed);
    expect(resumen.porCobrar).toEqual({ ARS: 870_000_000 });
    expect(resumen.vencido).toEqual({ ARS: 270_000_000 });
  });

  it("no suma ítems cancelados aunque tengan saldo", () => {
    const resumen = resumenCobros([
      item({ saldo_centavos: 100_00 }),
      item({ saldo_centavos: 500_00, estado_cobro: "cancelado" }),
    ]);
    expect(resumen.porCobrar).toEqual({ ARS: 100_00 });
  });

  it("separa pesos y dólares en vez de mezclarlos", () => {
    const resumen = resumenCobros([
      item({ saldo_centavos: 100_00 }),
      item({ saldo_centavos: 50_00, moneda: "USD", vencido: true }),
    ]);
    expect(resumen.porCobrar).toEqual({ ARS: 100_00, USD: 50_00 });
    expect(resumen.vencido).toEqual({ USD: 50_00 });
  });

  it("sin ítems pendientes devuelve totales vacíos", () => {
    expect(resumenCobros([])).toEqual({ porCobrar: {}, vencido: {} });
  });
});

describe("saldoPorViaje", () => {
  it("suma el saldo de los autos de cada viaje", () => {
    const saldos = saldoPorViaje(seed);
    expect(saldos.size).toBe(12);
    const total = [...saldos.values()].reduce((suma, m) => suma + (m.ARS ?? 0), 0);
    expect(total).toBe(870_000_000);
  });

  it("deja en cero un viaje totalmente pagado", () => {
    const saldos = saldoPorViaje([item({ viaje_id: "a", estado_cobro: "pagado" })]);
    expect(saldos.get("a")).toEqual({ ARS: 0 });
  });
});

describe("ventanaProximosDias", () => {
  it("va desde hoy hasta dentro de 7 días, ambos inclusive", () => {
    expect(ventanaProximosDias("2026-11-24", 7)).toEqual({
      desde: "2026-11-24",
      hasta: "2026-12-01",
    });
  });
});
