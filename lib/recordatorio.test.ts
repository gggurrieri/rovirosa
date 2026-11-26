import { describe, expect, it } from "vitest";
import { armarMensaje, haceCuanto, linkWhatsAppA, normalizarWhatsApp, posiblesDuplicados } from "./recordatorio";

const audi = { vehiculo: "Audi R8", origen: "Buenos Aires", destino: "Rosario", fecha_entrega: "2026-11-11", moneda: "ARS" as const, saldo: 140000000 };
const bmw = { vehiculo: "BMW M3", origen: "Buenos Aires", destino: "Córdoba", fecha_entrega: null, moneda: "ARS" as const, saldo: 50000000 };

describe("armarMensaje", () => {
  it("un auto, con los datos para transferir", () => {
    expect(armarMensaje({ cliente: "Juan Pérez", empresa: "Rovirosa", autos: [audi], datosCobro: "Alias: rovirosa.cobros" })).toBe(
      "Hola Juan Pérez, te escribo de Rovirosa. Te recuerdo el saldo de $ 1.400.000 por el traslado de tu Audi R8 (Buenos Aires → Rosario, entregado el 11/11/2026).\n\nPodés transferir a:\nAlias: rovirosa.cobros\n\n¡Gracias!",
    );
  });

  it("varios autos van en un solo mensaje, con el detalle de cada uno", () => {
    const texto = armarMensaje({ cliente: "Concesionaria Norte (ficticia)", empresa: "Rovirosa", autos: [audi, bmw], datosCobro: null });
    expect(texto).toBe(
      "Hola Concesionaria Norte, te escribo de Rovirosa. Te recuerdo el saldo de $ 1.900.000 por estos traslados:\n• Audi R8 (Buenos Aires → Rosario, entregado el 11/11/2026): $ 1.400.000\n• BMW M3 (Buenos Aires → Córdoba): $ 500.000\n\n¡Gracias!",
    );
  });

  it("pesos y dólares por separado", () => {
    const usd = { ...bmw, moneda: "USD" as const, saldo: 150000 };
    expect(armarMensaje({ cliente: "Ana", empresa: "R", autos: [audi, usd], datosCobro: null })).toContain("el saldo de $ 1.400.000 y US$ 1.500 por estos traslados");
  });

  it("mensaje propio de la empresa con sus marcas", () => {
    expect(
      armarMensaje({ cliente: "Ana", empresa: "R", autos: [audi], datosCobro: "CBU 123", plantilla: "{cliente}: debés {total} ({detalle}). {datos}" }),
    ).toBe("Ana: debés $ 1.400.000 (el traslado de tu Audi R8 (Buenos Aires → Rosario, entregado el 11/11/2026)). CBU 123");
  });
});

describe("normalizarWhatsApp", () => {
  it("deja el número en formato internacional argentino para wa.me", () => {
    expect(normalizarWhatsApp("11 5555-1234")).toBe("5491155551234");
    expect(normalizarWhatsApp("011 5555-1234")).toBe("5491155551234");
    expect(normalizarWhatsApp("+54 9 11 5555-1234")).toBe("5491155551234");
    expect(normalizarWhatsApp("54 11 5555 1234")).toBe("5491155551234");
    expect(normalizarWhatsApp("+598 99 123 456")).toBe("59899123456");
  });
  it("rechaza números cortos", () => {
    expect(normalizarWhatsApp("1234")).toBeNull();
    expect(normalizarWhatsApp("")).toBeNull();
  });
  it("arma el link con número y texto", () => {
    expect(linkWhatsAppA("5491155551234", "Hola & chau")).toBe("https://wa.me/5491155551234?text=Hola%20%26%20chau");
  });
});

describe("haceCuanto", () => {
  const ahora = new Date("2026-11-25T15:00:00Z");
  it("en días, en hora argentina", () => {
    expect(haceCuanto("2026-11-25T13:00:00Z", ahora)).toBe("hoy");
    expect(haceCuanto("2026-11-24T20:00:00Z", ahora)).toBe("ayer");
    expect(haceCuanto("2026-11-22T12:00:00Z", ahora)).toBe("hace 3 días");
  });
});

describe("posiblesDuplicados", () => {
  it("marca nombres iguales sin tildes, mayúsculas ni aclaraciones", () => {
    const r = posiblesDuplicados([
      { id: "1", nombre: "Juan Pérez" },
      { id: "2", nombre: "juan perez (particular)" },
      { id: "3", nombre: "María Gómez" },
    ]);
    expect([...r].sort()).toEqual(["1", "2"]);
  });
});
