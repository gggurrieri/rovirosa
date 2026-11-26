import { describe, expect, it } from "vitest";
import { aCSV, aParametrosBusqueda, FILTROS_VACIOS, filtrosAURL, filtrosDesdeURL, type FilaGrilla } from "./grilla";

describe("filtrosDesdeURL", () => {
  it("sin parámetros da los filtros por defecto", () => {
    expect(filtrosDesdeURL({})).toEqual(FILTROS_VACIOS);
  });

  it("lee todos los filtros, con varios estados a la vez", () => {
    const f = filtrosDesdeURL({
      estado: ["entregado", "en_viaje"],
      cobro: "con_saldo",
      desde: "2026-11-01",
      hasta: "2026-11-10",
      unidad: "b76b4d15-f492-5f03-a9f7-1cd35af0fb9a",
      cliente: "3341aa03-7be5-5a2d-81c7-cf14cd71e52a",
      q: "  rosario ",
      orden: "saldo",
      dir: "asc",
      pagina: "2",
    });
    expect(f).toEqual({
      estados: ["entregado", "en_viaje"],
      cobro: "con_saldo",
      desde: "2026-11-01",
      hasta: "2026-11-10",
      unidad: "b76b4d15-f492-5f03-a9f7-1cd35af0fb9a",
      cliente: "3341aa03-7be5-5a2d-81c7-cf14cd71e52a",
      texto: "rosario",
      orden: "saldo",
      dir: "asc",
      pagina: 2,
      fechasInvertidas: false,
    });
  });

  it("ignora valores inválidos sin romper", () => {
    const f = filtrosDesdeURL({ estado: ["xyz", "entregado"], cobro: "todo", desde: "ayer", unidad: "no-es-un-id", orden: "precio; drop table", dir: "arriba", pagina: "-3" });
    expect(f).toEqual({ ...FILTROS_VACIOS, estados: ["entregado"] });
  });

  it("invierte las fechas si vienen al revés y lo avisa", () => {
    const f = filtrosDesdeURL({ desde: "2026-11-30", hasta: "2026-11-01" });
    expect(f).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-30", fechasInvertidas: true });
  });

  it("acepta URLSearchParams", () => {
    expect(filtrosDesdeURL(new URLSearchParams("estado=cancelado&estado=cerrado")).estados).toEqual(["cancelado", "cerrado"]);
  });
});

describe("filtrosAURL", () => {
  it("ida y vuelta sin perder nada, y sin escribir los valores por defecto", () => {
    const f = { ...FILTROS_VACIOS, estados: ["entregado" as const], texto: "Córdoba", orden: "saldo" as const, pagina: 3 };
    const url = filtrosAURL(f);
    expect(url).toBe("estado=entregado&q=C%C3%B3rdoba&orden=saldo&pagina=3");
    expect(filtrosDesdeURL(new URLSearchParams(url))).toEqual(f);
    expect(filtrosAURL(FILTROS_VACIOS)).toBe("");
  });

  it("aplica cambios (por ejemplo, otro orden) y vuelve a la página 1", () => {
    const f = { ...FILTROS_VACIOS, pagina: 4 };
    expect(filtrosAURL(f, { orden: "numero", dir: "asc", pagina: 1 })).toBe("orden=numero&dir=asc");
  });
});

describe("aParametrosBusqueda", () => {
  it("arma lo que recibe la base", () => {
    const f = { ...FILTROS_VACIOS, estados: ["programado" as const], texto: "BA", pagina: 2 };
    expect(aParametrosBusqueda(f, 50)).toEqual({
      estados: ["programado"],
      cobro: null,
      desde: null,
      hasta: null,
      unidad: null,
      cliente: null,
      texto: "BA",
      orden: "fecha_salida",
      dir: "desc",
      pagina: 2,
      por_pagina: 50,
    });
  });
});

describe("aCSV", () => {
  const fila = (cambios: Partial<FilaGrilla> = {}): FilaGrilla => ({
    id: "v1",
    numero: 12,
    fecha_salida: "2026-11-21",
    origen: "Buenos Aires",
    destino: "Mar del Plata",
    estado: "en_viaje",
    cobro: "pendiente",
    unidad: "Mosquito 2",
    chofer: "Chofer B",
    autos: 2,
    clientes: "Juan Pérez (ficticio); Colección Ruiz",
    facturado_ars: 120_000_000,
    saldo_ars: 120_000_050,
    facturado_usd: 0,
    saldo_usd: 0,
    ...cambios,
  });

  it("empieza con la marca para que Excel lea bien los acentos y usa ; y saltos de línea de Windows", () => {
    const csv = aCSV([fila()]);
    expect(csv.startsWith("﻿")).toBe(true);
    const [encabezado, linea] = csv.slice(1).split("\r\n");
    expect(encabezado).toBe(
      "Número;Salida;Origen;Destino;Unidad;Chofer;Autos;Clientes;Estado;Cobro;Facturado $;Saldo $;Facturado US$;Saldo US$",
    );
    expect(linea).toBe(
      '12;21/11/2026;Buenos Aires;Mar del Plata;Mosquito 2;Chofer B;2;"Juan Pérez (ficticio); Colección Ruiz";En viaje;Pendiente;1200000;1200000,50;0;0',
    );
  });

  it("escapa comillas y evita que un texto se ejecute como fórmula en Excel", () => {
    const linea = aCSV([fila({ clientes: '=HYPERLINK("http://x")', chofer: 'Juan "el rápido"', unidad: "+54 11" })]).split("\r\n")[1];
    expect(linea).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(linea).toContain('"Juan ""el rápido"""');
    expect(linea).toContain("'+54 11");
  });

  it("sin filas deja solo el encabezado; los datos vacíos quedan vacíos", () => {
    expect(aCSV([]).split("\r\n")).toHaveLength(1);
    expect(aCSV([fila({ unidad: null, chofer: null })]).split("\r\n")[1]).toContain("Mar del Plata;;;2");
  });
});
