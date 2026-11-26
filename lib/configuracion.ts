// Importar tarifas desde Excel: lee el CSV que guarda Excel (en español usa punto y
// coma) y devuelve las filas listas para la base, o el error de cada renglón.
// La base vuelve a validar todo al guardar (importar_tarifas).

import { parsearPlata } from "./cobros";

export type FilaTarifa = { origen: string; destino: string; km: number; precio_centavos: number; moneda: "ARS" | "USD" };
export type ErrorFila = { linea: number; error: string };

export const PLANTILLA_CSV = "Origen;Destino;Km;Precio;Moneda\r\nBuenos Aires;Córdoba;700;950.000;ARS\r\nBuenos Aires;Rosario;300;650.000;ARS\r\n";

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Separa un renglón CSV respetando comillas ("Rosario, Santa Fe"). */
function celdas(linea: string, separador: string): string[] {
  const r: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else entreComillas = !entreComillas;
    } else if (ch === separador && !entreComillas) {
      r.push(actual);
      actual = "";
    } else actual += ch;
  }
  r.push(actual);
  return r.map((c) => c.trim());
}

const COLUMNAS = ["origen", "destino", "km", "precio"] as const;

export function parsearCSVTarifas(texto: string): { filas: FilaTarifa[]; errores: ErrorFila[] } {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/);
  const encabezado = lineas[0] ?? "";
  const separador = (encabezado.match(/;/g)?.length ?? 0) >= (encabezado.match(/,/g)?.length ?? 0) ? ";" : ",";
  const nombres = celdas(encabezado, separador).map(normalizar);
  const indice = (n: string) => nombres.indexOf(n);
  const faltan = COLUMNAS.filter((c) => indice(c) < 0);
  if (faltan.length > 0) return { filas: [], errores: [{ linea: 1, error: `Faltan columnas: ${faltan.join(", ")}. Usá la planilla de ejemplo.` }] };

  const filas: FilaTarifa[] = [];
  const errores: ErrorFila[] = [];
  const vistas = new Map<string, { numero: number; ruta: string }>();

  lineas.slice(1).forEach((linea, i) => {
    const numero = i + 2;
    const c = celdas(linea, separador);
    if (c.every((x) => x === "")) return;
    const valor = (n: string) => c[indice(n)] ?? "";
    const origen = valor("origen").replace(/\s+/g, " ");
    const destino = valor("destino").replace(/\s+/g, " ");
    const km = Number(valor("km").replace(/\./g, ""));
    const monedaTexto = indice("moneda") >= 0 ? valor("moneda").toUpperCase() : "";
    const moneda = monedaTexto.startsWith("US") || monedaTexto.startsWith("U$") ? "USD" : "ARS";

    const falla = (error: string) => errores.push({ linea: numero, error });
    if (origen === "" || destino === "") return falla("Falta el origen o el destino.");
    if (normalizar(origen) === normalizar(destino)) return falla("El origen y el destino son iguales.");
    if (!Number.isInteger(km) || km <= 0) return falla("Los km tienen que ser un número mayor que cero.");
    const precio = parsearPlata(valor("precio").replace(/^(US\$|U\$S|\$)\s*/i, ""));
    if (!precio.ok) return falla(`Precio: ${precio.error}`);
    const clave = `${normalizar(origen)}→${normalizar(destino)}`;
    const anterior = vistas.get(clave);
    if (anterior) return falla(`La ruta ${anterior.ruta} ya está en la fila ${anterior.numero}.`);
    vistas.set(clave, { numero, ruta: `${origen} → ${destino}` });
    filas.push({ origen, destino, km, precio_centavos: precio.centavos, moneda });
  });
  return { filas, errores };
}
