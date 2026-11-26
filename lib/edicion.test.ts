import { describe, expect, it } from "vitest";
import { armarCambios, type EdicionBorrador, type ViajeOriginal, camposEditables, borradorDesde } from "./edicion";

const original: ViajeOriginal = {
  estado: "programado",
  fecha_salida: "2026-12-01",
  fecha_llegada: null,
  origen: "Buenos Aires",
  destino: "Rosario",
  unidad_id: "u1",
  chofer_id: "c1",
  notas: null,
  autos: [
    { item_id: "i1", nombre: "Audi R8 (Juan)", moneda: "ARS", precio_centavos: 100000000, cobrado_centavos: 60000000 },
    { item_id: "i2", nombre: "BMW M3 (Juan)", moneda: "ARS", precio_centavos: 90000000, cobrado_centavos: 0 },
  ],
};
const capacidad = { capacidad: 3, unidad_nombre: "Mosquito 1" };
const con = (cambios: Partial<EdicionBorrador>, base: ViajeOriginal = original): EdicionBorrador => ({
  ...borradorDesde(base),
  ...capacidad,
  ...cambios,
});
const autoNuevo = { cliente_id: "cli", cliente_nuevo: null, vehiculo_id: null, marca: "Ferrari", modelo: "Roma", precio: "1.200.000" };

describe("camposEditables", () => {
  it("antes de salir se cambia todo; en camino, chofer y notas; después, solo notas", () => {
    expect(camposEditables("programado")).toContain("unidad_id");
    expect(camposEditables("en_viaje")).toEqual(["chofer_id", "notas"]);
    expect(camposEditables("entregado")).toEqual(["notas"]);
    expect(camposEditables("cancelado")).toEqual(["notas"]);
  });
});

describe("armarCambios", () => {
  it("sin tocar nada no hay cambios", () => {
    const r = armarCambios(original, con({}));
    expect(r).toEqual({ ok: true, cambios: {}, cantidad: 0, autosEnCero: 0 });
  });

  it("manda solo lo que cambió, con los textos limpios", () => {
    const r = armarCambios(original, con({ fecha_salida: "2026-12-02", notas: "  Retirar 9 hs ", chofer_id: null }));
    expect(r).toEqual({
      ok: true,
      cambios: { viaje: { fecha_salida: "2026-12-02", notas: "Retirar 9 hs", chofer_id: null } },
      cantidad: 3,
      autosEnCero: 0,
    });
  });

  it("borrar las notas o la llegada se manda como vacío", () => {
    const base = { ...original, notas: "algo", fecha_llegada: "2026-12-03" };
    const r = armarCambios(base, con({ notas: "  ", fecha_llegada: "" }, base));
    expect(r.ok && r.cambios.viaje).toEqual({ notas: null, fecha_llegada: null });
  });

  it("precio: acepta formato argentino y no baja de lo cobrado", () => {
    const ok = armarCambios(original, con({ precios: { i1: "800.000", i2: "900.000" } }));
    expect(ok.ok && ok.cambios.precios).toEqual([{ item_id: "i1", precio_centavos: 80000000 }]);
    const mal = armarCambios(original, con({ precios: { i1: "500.000", i2: "900.000" } }));
    expect(mal).toEqual({ ok: false, error: "Ya se cobraron $ 600.000 del Audi R8 (Juan): el precio no puede ser menor." });
  });

  it("precio ilegible da un error con el auto", () => {
    const r = armarCambios(original, con({ precios: { i1: "mil", i2: "900.000" } }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/^Audi R8 \(Juan\): /);
  });

  it("quitar un auto sin pagos y agregar otro", () => {
    const r = armarCambios(original, con({ quitar: ["i2"], agregar: [autoNuevo] }));
    expect(r).toEqual({
      ok: true,
      cambios: { quitar: ["i2"], agregar: [{ cliente_id: "cli", vehiculo: { marca: "Ferrari", modelo: "Roma" }, precio_centavos: 120000000 }] },
      cantidad: 2,
      autosEnCero: 0,
    });
  });

  it("no quita un auto con pagos ni deja el viaje sin autos", () => {
    expect(armarCambios(original, con({ quitar: ["i1"] }))).toEqual({
      ok: false,
      error: "El Audi R8 (Juan) tiene pagos: no se puede quitar.",
    });
    const sinPagos = { ...original, autos: [original.autos[1]] };
    expect(armarCambios(sinPagos, con({ quitar: ["i2"] }, sinPagos))).toEqual({ ok: false, error: "El viaje tiene que tener al menos un auto." });
  });

  it("respeta la capacidad de la unidad", () => {
    const r = armarCambios(original, con({ agregar: [autoNuevo, autoNuevo] }));
    expect(r).toEqual({ ok: false, error: "Mosquito 1 lleva hasta 3 autos." });
  });

  it("valida ruta y fechas", () => {
    expect(armarCambios(original, con({ destino: " buenos aires " }))).toEqual({ ok: false, error: "El origen y el destino son iguales." });
    expect(armarCambios(original, con({ origen: "" }))).toEqual({ ok: false, error: "Escribí origen y destino." });
    expect(armarCambios(original, con({ fecha_llegada: "2026-11-30" }))).toEqual({ ok: false, error: "La llegada no puede ser antes de la salida." });
  });

  it("en viaje: rechaza cambiar la fecha o los autos", () => {
    const enViaje = { ...original, estado: "en_viaje" as const };
    expect(armarCambios(enViaje, con({ fecha_salida: "2026-12-05" }, enViaje))).toEqual({
      ok: false,
      error: "El viaje ya está en viaje: solo se pueden cambiar el chofer, las notas y los precios.",
    });
    expect(armarCambios(enViaje, con({ agregar: [autoNuevo] }, enViaje))).toEqual({
      ok: false,
      error: "Solo se agregan o quitan autos antes de que salga el viaje.",
    });
    expect(armarCambios(enViaje, con({ chofer_id: "c2" }, enViaje)).ok).toBe(true);
  });

  it("entregado: el precio se cambia solo con motivo", () => {
    const entregado = { ...original, estado: "entregado" as const };
    expect(armarCambios(entregado, con({ precios: { i1: "1.100.000", i2: "900.000" } }, entregado))).toEqual({
      ok: false,
      error: "Escribí el motivo del cambio de precio.",
    });
    const r = armarCambios(entregado, con({ precios: { i1: "1.100.000", i2: "900.000" }, motivo: " Peaje extra " }, entregado));
    expect(r.ok && r.cambios.motivo).toBe("Peaje extra");
  });

  it("cancelado: no cambia precios", () => {
    const cancelado = { ...original, estado: "cancelado" as const };
    expect(armarCambios(cancelado, con({ precios: { i1: "1.100.000", i2: "900.000" } }, cancelado))).toEqual({
      ok: false,
      error: "El viaje está cancelado: solo se pueden cambiar las notas.",
    });
  });

  it("cuenta los autos nuevos a $ 0 para pedir confirmación", () => {
    const r = armarCambios(original, con({ agregar: [{ ...autoNuevo, precio: "0" }] }));
    expect(r.ok && r.autosEnCero).toBe(1);
  });
});
