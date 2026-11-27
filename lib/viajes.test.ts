import { describe, expect, it } from "vitest";
import {
  type AutoBorrador,
  armarViaje,
  avisosDisponibilidad,
  clientesParecidos,
  estadoAnterior,
  parsearPrecio,
  puedeCancelar,
  siguienteEstado,
  textoAvanzar,
  validarCapacidad,
  type ViajeBorrador,
} from "./viajes";

const auto = (parcial: Partial<AutoBorrador> = {}): AutoBorrador => ({
  cliente_id: "c1",
  cliente_nuevo: null,
  vehiculo_id: null,
  marca: "Ford",
  modelo: "Mustang",
  precio: "950.000",
  ...parcial,
});

const borrador = (parcial: Partial<ViajeBorrador> = {}): ViajeBorrador => ({
  origen: "Buenos Aires",
  destino: "Córdoba",
  tarifa_id: "t1",
  moneda: "ARS",
  fecha_salida: "2026-11-27",
  fecha_llegada: null,
  unidad_id: "u1",
  unidad_nombre: "Mosquito 1",
  capacidad: 3,
  chofer_id: "ch1",
  notas: "",
  autos: [auto(), auto({ cliente_id: "c2", marca: "Porsche", modelo: "911" })],
  ...parcial,
});

describe("estados del viaje", () => {
  it("avanza paso a paso y no se pasa del final", () => {
    expect(siguienteEstado("programado")).toBe("en_retiro");
    expect(siguienteEstado("reprogramado")).toBe("en_retiro");
    expect(siguienteEstado("en_retiro")).toBe("en_viaje");
    expect(siguienteEstado("en_viaje")).toBe("entregado");
    expect(siguienteEstado("entregado")).toBe("cerrado");
    expect(siguienteEstado("cerrado")).toBeNull();
    expect(siguienteEstado("cancelado")).toBeNull();
  });

  it("deshace un paso", () => {
    expect(estadoAnterior("en_retiro")).toBe("programado");
    expect(estadoAnterior("entregado")).toBe("en_viaje");
    expect(estadoAnterior("cerrado")).toBe("entregado");
    expect(estadoAnterior("programado")).toBeNull();
    expect(estadoAnterior("cancelado")).toBeNull();
  });

  it("nombra el botón del siguiente paso", () => {
    expect(textoAvanzar("programado")).toBe("Marcar en retiro");
    expect(textoAvanzar("en_viaje")).toBe("Marcar entregado");
    expect(textoAvanzar("entregado")).toBe("Cerrar viaje");
    expect(textoAvanzar("cerrado")).toBeNull();
  });

  it("solo cancela viajes sin pagos que todavía no salieron", () => {
    expect(puedeCancelar("programado")).toBe(true);
    expect(puedeCancelar("en_retiro")).toBe(true);
    expect(puedeCancelar("en_viaje")).toBe(false);
    expect(puedeCancelar("cancelado")).toBe(false);
  });
});

describe("validarCapacidad", () => {
  it("acepta hasta la capacidad y explica cuando se pasa", () => {
    expect(validarCapacidad(3, 3, "Mosquito 1")).toBeNull();
    expect(validarCapacidad(4, 3, "Mosquito 1")).toBe("Mosquito 1 lleva hasta 3 autos.");
    expect(validarCapacidad(2, 1, "Camioneta")).toBe("Camioneta lleva hasta 1 auto.");
  });
});

describe("parsearPrecio", () => {
  it("acepta cero (un favor, un viaje propio) y montos normales", () => {
    expect(parsearPrecio("0")).toEqual({ ok: true, centavos: 0 });
    expect(parsearPrecio("$ 0,00")).toEqual({ ok: true, centavos: 0 });
    expect(parsearPrecio("950.000")).toEqual({ ok: true, centavos: 95_000_000 });
  });

  it("sigue rechazando lo inválido", () => {
    expect(parsearPrecio("").ok).toBe(false);
    expect(parsearPrecio("-10").ok).toBe(false);
  });
});

describe("armarViaje", () => {
  it("arma un viaje con dos autos y su total", () => {
    const r = armarViaje(borrador());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.total).toBe(190_000_000);
    expect(r.autosEnCero).toBe(0);
    expect(r.items).toEqual([
      { cliente_id: "c1", vehiculo: { marca: "Ford", modelo: "Mustang" }, precio_centavos: 95_000_000 },
      { cliente_id: "c2", vehiculo: { marca: "Porsche", modelo: "911" }, precio_centavos: 95_000_000 },
    ]);
  });

  it("usa un vehículo existente sin pedir marca y modelo", () => {
    const r = armarViaje(borrador({ autos: [auto({ vehiculo_id: "v1", marca: "", modelo: "" })] }));
    expect(r.ok && r.items[0]).toEqual({ cliente_id: "c1", vehiculo_id: "v1", precio_centavos: 95_000_000 });
  });

  it("crea un cliente nuevo con nombre y WhatsApp opcional", () => {
    const r = armarViaje(
      borrador({ autos: [auto({ cliente_id: null, cliente_nuevo: { nombre: "  Ana Gómez ", whatsapp: "" } })] }),
    );
    expect(r.ok && r.items[0]).toMatchObject({ cliente_nuevo: { nombre: "Ana Gómez", whatsapp: null } });
  });

  it("acepta precio cero pero lo cuenta para pedir confirmación", () => {
    const r = armarViaje(borrador({ autos: [auto({ precio: "0" })] }));
    expect(r.ok && r.autosEnCero).toBe(1);
  });

  it.each<[string, Partial<ViajeBorrador>, string]>([
    ["sin ruta", { origen: " ", destino: "Córdoba" }, "Elegí la ruta o escribí origen y destino."],
    ["ruta circular", { destino: "buenos aires" }, "El origen y el destino son iguales."],
    ["sin unidad", { unidad_id: null }, "Elegí la unidad."],
    ["fecha inválida", { fecha_salida: "27/11/2026" }, "Revisá la fecha de salida."],
    ["llega antes de salir", { fecha_llegada: "2026-11-26" }, "La llegada no puede ser antes de la salida."],
    ["sin autos", { autos: [] }, "Agregá al menos un auto."],
    ["más autos que la capacidad", { capacidad: 1, unidad_nombre: "Camioneta" }, "Camioneta lleva hasta 1 auto."],
    ["auto sin cliente", { autos: [auto(), auto({ cliente_id: null })] }, "Elegí el cliente del auto 2."],
    [
      "cliente nuevo sin nombre",
      { autos: [auto({ cliente_id: null, cliente_nuevo: { nombre: " ", whatsapp: "" } })] },
      "Escribí el nombre del cliente nuevo (auto 1).",
    ],
    [
      "WhatsApp inválido",
      { autos: [auto({ cliente_id: null, cliente_nuevo: { nombre: "Ana", whatsapp: "123" } })] },
      "Revisá el WhatsApp del cliente nuevo (auto 1): tiene que tener al menos 8 números.",
    ],
    ["auto sin modelo", { autos: [auto({ modelo: "" })] }, "Escribí marca y modelo del auto 1."],
    ["precio inválido", { autos: [auto({ precio: "abc" })] }, "Auto 1: No entiendo ese monto. Escribilo así: 1.250.000"],
  ])("rechaza %s", (_caso, cambios, error) => {
    expect(armarViaje(borrador(cambios))).toEqual({ ok: false, error });
  });
});

describe("avisosDisponibilidad", () => {
  const viajes = [
    { numero: 5, unidad_id: "u1", chofer_id: "ch1", fecha_salida: "2026-11-26", fecha_llegada_estimada: "2026-11-28", estado: "programado" as const },
    { numero: 6, unidad_id: "u2", chofer_id: "ch2", fecha_salida: "2026-11-27", fecha_llegada_estimada: null, estado: "cancelado" as const },
  ];
  const bloqueos = [
    { unidad_id: "u2", chofer_id: null, desde: "2026-11-27", hasta: "2026-11-27", motivo: "service" as const },
    { unidad_id: null, chofer_id: "ch3", desde: "2026-11-20", hasta: "2026-11-30", motivo: "vacaciones" as const },
  ];
  const consulta = { unidad_id: "u1", unidad_nombre: "Mosquito 1", chofer_id: "ch1", chofer_nombre: "Chofer A", desde: "2026-11-27", hasta: "2026-11-27" };

  it("avisa si la unidad o el chofer ya tienen un viaje que se superpone", () => {
    expect(avisosDisponibilidad(consulta, viajes, bloqueos)).toEqual([
      "Mosquito 1 ya tiene el viaje #5 (26/11/2026).",
      "Chofer A ya maneja el viaje #5 (26/11/2026).",
    ]);
  });

  it("ignora viajes cancelados y avisa bloqueos de unidad o chofer", () => {
    expect(
      avisosDisponibilidad(
        { ...consulta, unidad_id: "u2", unidad_nombre: "Mosquito 2", chofer_id: "ch3", chofer_nombre: "Chofer B" },
        viajes,
        bloqueos,
      ),
    ).toEqual(["Mosquito 2 está en service del 27/11/2026 al 27/11/2026.", "Chofer B está de vacaciones del 20/11/2026 al 30/11/2026."]);
  });

  it("sin conflictos no avisa nada", () => {
    expect(avisosDisponibilidad({ ...consulta, desde: "2026-12-10", hasta: "2026-12-10" }, viajes, bloqueos)).toEqual([]);
  });
});

describe("clientesParecidos", () => {
  const clientes = [
    { id: "1", nombre: "Juan Pérez (ficticio)" },
    { id: "2", nombre: "Autos del Sur SA (ficticia)" },
  ];
  it("sugiere clientes existentes con nombre parecido, sin importar tildes ni mayúsculas", () => {
    expect(clientesParecidos("juan perez", clientes).map((c) => c.id)).toEqual(["1"]);
    expect(clientesParecidos("Ju", clientes)).toEqual([]);
    expect(clientesParecidos("Ana", clientes)).toEqual([]);
  });
});

describe("Se entrega en (viajes con varias paradas)", () => {
  it("cada auto guarda dónde se entrega, limpio; vacío no se manda", () => {
    const r = armarViaje(borrador({ autos: [auto({ entrega: "  Bariloche,   Río Negro " }), auto({ entrega: "" }), auto()] }));
    expect(r.ok && r.items.map((i) => i.entrega)).toEqual(["Bariloche, Río Negro", undefined, undefined]);
  });
  it("más de 120 letras no", () => {
    const r = armarViaje(borrador({ autos: [auto({ entrega: "x".repeat(121) })] }));
    expect(r).toEqual({ ok: false, error: "Auto 1: el lugar de entrega es muy largo (hasta 120 letras)." });
  });
});
