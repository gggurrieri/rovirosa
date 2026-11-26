import { describe, expect, it } from "vitest";
import { PLANTILLA_CSV, parsearCSVTarifas } from "./configuracion";

describe("parsearCSVTarifas", () => {
  it("lee el CSV que guarda Excel en español (punto y coma, plata con puntos, BOM)", () => {
    const r = parsearCSVTarifas("﻿Origen;Destino;Km;Precio;Moneda\r\nBuenos Aires;Córdoba;700;950.000;ARS\r\nBuenos Aires;Montevideo;580;US$ 1.500;USD\r\n");
    expect(r.errores).toEqual([]);
    expect(r.filas).toEqual([
      { origen: "Buenos Aires", destino: "Córdoba", km: 700, precio_centavos: 95000000, moneda: "ARS" },
      { origen: "Buenos Aires", destino: "Montevideo", km: 580, precio_centavos: 150000, moneda: "USD" },
    ]);
  });

  it("también acepta comas, columnas en otro orden y sin columna de moneda", () => {
    const r = parsearCSVTarifas('destino,origen,precio,km\n"Rosario, Santa Fe",Buenos Aires,"650.000",300');
    expect(r.filas).toEqual([{ origen: "Buenos Aires", destino: "Rosario, Santa Fe", km: 300, precio_centavos: 65000000, moneda: "ARS" }]);
  });

  it("marca cada fila con problemas sin frenar las demás, e ignora renglones vacíos", () => {
    const r = parsearCSVTarifas("origen;destino;km;precio\nA;B;cero;100\n;;;\nC;C;10;100\nD;E;10;mil\nF;G;20;200");
    expect(r.filas).toEqual([{ origen: "F", destino: "G", km: 20, precio_centavos: 20000, moneda: "ARS" }]);
    expect(r.errores).toEqual([
      { linea: 2, error: "Los km tienen que ser un número mayor que cero." },
      { linea: 4, error: "El origen y el destino son iguales." },
      { linea: 5, error: "Precio: No entiendo ese monto. Escribilo así: 1.250.000" },
    ]);
  });

  it("avisa si la misma ruta aparece dos veces", () => {
    const r = parsearCSVTarifas("origen;destino;km;precio\nBuenos Aires;Córdoba;700;1\nbuenos aires;CORDOBA;700;2");
    expect(r.errores).toEqual([{ linea: 3, error: "La ruta Buenos Aires → Córdoba ya está en la fila 2." }]);
  });

  it("sin encabezados conocidos explica qué columnas faltan", () => {
    expect(parsearCSVTarifas("a;b;c\n1;2;3").errores).toEqual([{ linea: 1, error: "Faltan columnas: origen, destino, km, precio. Usá la planilla de ejemplo." }]);
  });

  it("la planilla de ejemplo se puede volver a leer", () => {
    expect(parsearCSVTarifas(PLANTILLA_CSV).errores).toEqual([]);
  });
});
