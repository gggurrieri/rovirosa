// Grilla de viajes: filtros que viven en la URL, orden permitido y exportación
// a CSV para el Excel en español. Funciones puras; la búsqueda la hace la base.

import { formatearFecha } from "./formato";
import { type EstadoViaje, NOMBRE_ESTADO } from "./viajes";

export const ESTADOS_VIAJE = Object.keys(NOMBRE_ESTADO) as EstadoViaje[];
export const ORDENES = ["numero", "fecha_salida", "ruta", "unidad", "autos", "estado", "facturado", "saldo"] as const;
export type Orden = (typeof ORDENES)[number];
export type Cobro = "con_saldo" | "vencidos" | "pagados";
const COBROS: Cobro[] = ["con_saldo", "vencidos", "pagados"];

export type FiltrosViajes = {
  estados: EstadoViaje[];
  cobro: Cobro | null;
  desde: string | null;
  hasta: string | null;
  unidad: string | null;
  cliente: string | null;
  texto: string;
  orden: Orden;
  dir: "asc" | "desc";
  pagina: number;
  /** Si "desde" venía después de "hasta" y se dieron vuelta (para avisarlo). */
  fechasInvertidas: boolean;
};

export const FILTROS_VACIOS: FiltrosViajes = {
  estados: [],
  cobro: null,
  desde: null,
  hasta: null,
  unidad: null,
  cliente: null,
  texto: "",
  orden: "fecha_salida",
  dir: "desc",
  pagina: 1,
  fechasInvertidas: false,
};

type Parametros = Record<string, string | string[] | undefined> | URLSearchParams;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function todos(params: Parametros, clave: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(clave);
  const v = params[clave];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
const uno = (params: Parametros, clave: string) => todos(params, clave)[0] ?? "";

/** Lee los filtros de la URL. Lo inválido se ignora (nunca rompe la pantalla). */
export function filtrosDesdeURL(params: Parametros): FiltrosViajes {
  const estados = todos(params, "estado").filter((e): e is EstadoViaje => (ESTADOS_VIAJE as string[]).includes(e));
  const cobro = uno(params, "cobro");
  let desde = FECHA.test(uno(params, "desde")) ? uno(params, "desde") : null;
  let hasta = FECHA.test(uno(params, "hasta")) ? uno(params, "hasta") : null;
  let fechasInvertidas = false;
  if (desde && hasta && desde > hasta) {
    [desde, hasta] = [hasta, desde];
    fechasInvertidas = true;
  }
  const orden = uno(params, "orden");
  const pagina = Number.parseInt(uno(params, "pagina"), 10);

  return {
    estados: [...new Set(estados)],
    cobro: (COBROS as string[]).includes(cobro) ? (cobro as Cobro) : null,
    desde,
    hasta,
    unidad: ID.test(uno(params, "unidad")) ? uno(params, "unidad") : null,
    cliente: ID.test(uno(params, "cliente")) ? uno(params, "cliente") : null,
    texto: uno(params, "q").trim().slice(0, 100),
    orden: (ORDENES as readonly string[]).includes(orden) ? (orden as Orden) : FILTROS_VACIOS.orden,
    dir: uno(params, "dir") === "asc" ? "asc" : "desc",
    pagina: Number.isInteger(pagina) && pagina > 1 ? pagina : 1,
    fechasInvertidas,
  };
}

/** Escribe los filtros en la URL, sin los valores por defecto (links cortos). */
export function filtrosAURL(f: FiltrosViajes, cambios: Partial<FiltrosViajes> = {}): string {
  const g = { ...f, ...cambios };
  const p = new URLSearchParams();
  for (const e of g.estados) p.append("estado", e);
  if (g.cobro) p.set("cobro", g.cobro);
  if (g.desde) p.set("desde", g.desde);
  if (g.hasta) p.set("hasta", g.hasta);
  if (g.unidad) p.set("unidad", g.unidad);
  if (g.cliente) p.set("cliente", g.cliente);
  if (g.texto) p.set("q", g.texto);
  if (g.orden !== FILTROS_VACIOS.orden) p.set("orden", g.orden);
  if (g.dir !== FILTROS_VACIOS.dir) p.set("dir", g.dir);
  if (g.pagina > 1) p.set("pagina", String(g.pagina));
  return p.toString();
}

/** Lo que recibe buscar_viajes() en la base. */
export function aParametrosBusqueda(f: FiltrosViajes, porPagina: number) {
  return {
    estados: f.estados,
    cobro: f.cobro,
    desde: f.desde,
    hasta: f.hasta,
    unidad: f.unidad,
    cliente: f.cliente,
    texto: f.texto,
    orden: f.orden,
    dir: f.dir,
    pagina: f.pagina,
    por_pagina: porPagina,
  };
}

// -----------------------------------------------------------------------------
// Filas y exportación
// -----------------------------------------------------------------------------

export type CobroViaje = "pendiente" | "parcial" | "pagado" | "vencido" | "cancelado" | "sin_autos";

export type FilaGrilla = {
  id: string;
  numero: number;
  fecha_salida: string;
  origen: string;
  destino: string;
  estado: EstadoViaje;
  cobro: CobroViaje;
  unidad: string | null;
  chofer: string | null;
  autos: number;
  entregados: number;
  clientes: string | null;
  facturado_ars: number;
  saldo_ars: number;
  facturado_usd: number;
  saldo_usd: number;
};

export const NOMBRE_COBRO: Record<CobroViaje, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagado: "Pagado",
  vencido: "Vencido",
  cancelado: "Cancelado",
  sin_autos: "Sin autos",
};

/** Centavos → "1200000" o "1200000,50": número que Excel en español puede sumar. */
const montoExcel = (centavos: number) =>
  centavos % 100 === 0 ? String(centavos / 100) : `${Math.trunc(centavos / 100)},${String(Math.abs(centavos % 100)).padStart(2, "0")}`;

function celda(valor: string | number | null): string {
  if (valor === null) return "";
  let texto = String(valor);
  // Un texto que empieza con = + - @ Excel lo ejecuta como fórmula: se neutraliza.
  if (typeof valor === "string" && /^[=+\-@]/.test(texto)) texto = `'${texto}`;
  return /[;"\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

const ENCABEZADO = [
  "Número", "Salida", "Origen", "Destino", "Unidad", "Chofer", "Autos", "Clientes",
  "Estado", "Cobro", "Facturado $", "Saldo $", "Facturado US$", "Saldo US$",
];

/** CSV para Excel en español: BOM, separador ";", coma decimal y fechas argentinas. */
export function aCSV(filas: FilaGrilla[]): string {
  const lineas = [ENCABEZADO.join(";")];
  for (const f of filas) {
    lineas.push(
      [
        celda(f.numero),
        celda(formatearFecha(f.fecha_salida)),
        celda(f.origen),
        celda(f.destino),
        celda(f.unidad),
        celda(f.chofer),
        celda(f.autos),
        celda(f.clientes),
        celda(NOMBRE_ESTADO[f.estado]),
        celda(NOMBRE_COBRO[f.cobro]),
        montoExcel(f.facturado_ars),
        montoExcel(f.saldo_ars),
        montoExcel(f.facturado_usd),
        montoExcel(f.saldo_usd),
      ].join(";"),
    );
  }
  return `﻿${lineas.join("\r\n")}`;
}
