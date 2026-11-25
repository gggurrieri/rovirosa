import { describe, expect, it } from "vitest";
import {
  armarAplicaciones,
  type ItemPendiente,
  ordenarPorAntiguedad,
  parsearPlata,
  resumenPorCliente,
  validarAplicaciones,
} from "./cobros";

// Deuda de Concesionaria Norte en el seed: dos autos vencidos.
const viaje3: ItemPendiente = {
  item_id: "i3",
  cliente_id: "norte",
  viaje_numero: 3,
  fecha_salida: "2026-11-05",
  fecha_entrega: "2026-11-08",
  moneda: "ARS",
  saldo_centavos: 140_000_000,
};
const viaje4: ItemPendiente = {
  item_id: "i4",
  cliente_id: "norte",
  viaje_numero: 4,
  fecha_salida: "2026-11-08",
  fecha_entrega: "2026-11-11",
  moneda: "ARS",
  saldo_centavos: 130_000_000,
};
const sinEntregar: ItemPendiente = {
  item_id: "i12",
  cliente_id: "norte",
  viaje_numero: 12,
  fecha_salida: "2026-11-01",
  fecha_entrega: null,
  moneda: "ARS",
  saldo_centavos: 60_000_000,
};
const enDolares: ItemPendiente = { ...viaje3, item_id: "usd", moneda: "USD", saldo_centavos: 500_000 };

describe("parsearPlata", () => {
  it.each([
    ["2000000", 200_000_000],
    ["2.000.000", 200_000_000],
    ["2.000.000,50", 200_000_050],
    ["2.000.000,5", 200_000_050],
    ["$ 2.000.000", 200_000_000],
    ["  950000 ", 95_000_000],
    ["1.250", 125_000],
    ["0,05", 5],
    ["US$ 12.000", 1_200_000],
  ])("%s → %i centavos", (texto, centavos) => {
    expect(parsearPlata(texto)).toEqual({ ok: true, centavos });
  });

  it.each([
    ["", "Escribí el monto."],
    ["abc", "No entiendo ese monto. Escribilo así: 1.250.000"],
    ["-500", "El monto tiene que ser mayor a cero."],
    ["0", "El monto tiene que ser mayor a cero."],
    ["10,555", "Usá como mucho dos decimales."],
    ["2000.5", "Usá coma para los decimales: 2000,5"],
    ["1.25.000", "No entiendo ese monto. Escribilo así: 1.250.000"],
  ])("rechaza %j", (texto, error) => {
    expect(parsearPlata(texto)).toEqual({ ok: false, error });
  });
});

describe("ordenarPorAntiguedad", () => {
  it("ordena por fecha de entrega y deja al final lo no entregado", () => {
    const orden = ordenarPorAntiguedad([sinEntregar, viaje4, viaje3]).map((i) => i.item_id);
    expect(orden).toEqual(["i3", "i4", "i12"]);
  });
});

describe("armarAplicaciones (sugerencia automática)", () => {
  it("cubre el más viejo completo y el siguiente en parte", () => {
    const r = armarAplicaciones([viaje4, viaje3], 200_000_000, "ARS");
    expect(r.aplicaciones).toEqual([
      { item_id: "i3", monto_centavos: 140_000_000 },
      { item_id: "i4", monto_centavos: 60_000_000 },
    ]);
    expect(r.aplicado).toBe(200_000_000);
    expect(r.saldoAFavor).toBe(0);
  });

  it("pago exacto deja todo pagado y nada a favor", () => {
    const r = armarAplicaciones([viaje3, viaje4], 270_000_000, "ARS");
    expect(r.aplicaciones).toHaveLength(2);
    expect(r.saldoAFavor).toBe(0);
  });

  it("pago de más: lo que sobra queda a favor", () => {
    const r = armarAplicaciones([viaje3], 150_000_000, "ARS");
    expect(r.aplicaciones).toEqual([{ item_id: "i3", monto_centavos: 140_000_000 }]);
    expect(r.saldoAFavor).toBe(10_000_000);
  });

  it("pago menor al primer auto: aplica parcial solo a ese", () => {
    const r = armarAplicaciones([viaje3, viaje4], 50_000_000, "ARS");
    expect(r.aplicaciones).toEqual([{ item_id: "i3", monto_centavos: 50_000_000 }]);
  });

  it("no mezcla monedas", () => {
    const r = armarAplicaciones([enDolares, viaje3], 100_000, "USD");
    expect(r.aplicaciones).toEqual([{ item_id: "usd", monto_centavos: 100_000 }]);
    expect(armarAplicaciones([viaje3], 100_000, "USD").aplicaciones).toEqual([]);
  });

  it("sin monto no sugiere nada", () => {
    expect(armarAplicaciones([viaje3], 0, "ARS").aplicaciones).toEqual([]);
  });

  it("respeta los autos que se destildan", () => {
    const r = armarAplicaciones([viaje3, viaje4], 200_000_000, "ARS", { excluidos: ["i3"] });
    expect(r.aplicaciones).toEqual([{ item_id: "i4", monto_centavos: 130_000_000 }]);
    expect(r.saldoAFavor).toBe(70_000_000);
  });

  it("respeta un monto cargado a mano y reparte el resto", () => {
    const r = armarAplicaciones([viaje3, viaje4], 200_000_000, "ARS", {
      manuales: { i3: 100_000_000 },
    });
    expect(r.aplicaciones).toEqual([
      { item_id: "i3", monto_centavos: 100_000_000 },
      { item_id: "i4", monto_centavos: 100_000_000 },
    ]);
  });
});

describe("validarAplicaciones", () => {
  it("acepta una aplicación correcta", () => {
    expect(
      validarAplicaciones([viaje3, viaje4], 200_000_000, "ARS", [
        { item_id: "i3", monto_centavos: 140_000_000 },
        { item_id: "i4", monto_centavos: 60_000_000 },
      ]),
    ).toBeNull();
  });

  it("no deja cobrar más que el saldo de un auto", () => {
    expect(
      validarAplicaciones([viaje3], 200_000_000, "ARS", [{ item_id: "i3", monto_centavos: 150_000_000 }]),
    ).toBe("Al viaje #3 le aplicaste $ 1.500.000, pero debe $ 1.400.000.");
  });

  it("no deja aplicar más que el pago", () => {
    expect(
      validarAplicaciones([viaje3, viaje4], 100_000_000, "ARS", [
        { item_id: "i3", monto_centavos: 80_000_000 },
        { item_id: "i4", monto_centavos: 80_000_000 },
      ]),
    ).toBe("Aplicaste $ 1.600.000, más que el pago de $ 1.000.000.");
  });

  it("rechaza autos que no están pendientes, montos no enteros y otra moneda", () => {
    expect(validarAplicaciones([viaje3], 100, "ARS", [{ item_id: "x", monto_centavos: 100 }])).toBe(
      "Uno de los autos ya no tiene saldo pendiente. Volvé a cargar el pago.",
    );
    expect(validarAplicaciones([viaje3], 100, "ARS", [{ item_id: "i3", monto_centavos: 1.5 }])).toBe(
      "Los montos aplicados tienen que ser mayores a cero.",
    );
    expect(validarAplicaciones([enDolares], 100, "ARS", [{ item_id: "usd", monto_centavos: 100 }])).toBe(
      "El viaje #3 está en USD y el pago en ARS.",
    );
  });

  it("rechaza el mismo auto dos veces", () => {
    expect(
      validarAplicaciones([viaje3], 200, "ARS", [
        { item_id: "i3", monto_centavos: 100 },
        { item_id: "i3", monto_centavos: 100 },
      ]),
    ).toBe("Un auto aparece dos veces en el pago.");
  });
});

describe("resumenPorCliente", () => {
  const fila = (cliente_id: string, nombre: string, saldo: number, vencido = false) => ({
    cliente_id,
    cliente_nombre: nombre,
    moneda: "ARS" as const,
    saldo_centavos: saldo,
    estado_cobro: "pendiente" as const,
    vencido,
  });

  it("agrupa por cliente, pone primero a los vencidos y saca a los que no deben", () => {
    const resumen = resumenPorCliente([
      fila("a", "Autos del Sur", 320_000_000),
      fila("n", "Norte", 140_000_000, true),
      fila("n", "Norte", 130_000_000, true),
      fila("p", "Pagado", 0),
    ]);
    expect(resumen.map((c) => c.cliente_id)).toEqual(["n", "a"]);
    expect(resumen[0]).toMatchObject({ nombre: "Norte", deuda: { ARS: 270_000_000 }, vencido: { ARS: 270_000_000 }, autos: 2 });
  });
});
