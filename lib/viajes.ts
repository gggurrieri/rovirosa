// Lógica de viajes: estados, armado del viaje antes de guardarlo y avisos de
// disponibilidad. Funciones puras; la base vuelve a validar todo.

import { parsearPlata, type ResultadoParseo } from "./cobros";
import { formatearFecha, type Moneda } from "./formato";

export type EstadoViaje =
  | "programado"
  | "en_retiro"
  | "en_viaje"
  | "entregado"
  | "cerrado"
  | "reprogramado"
  | "cancelado";

const SIGUIENTE: Partial<Record<EstadoViaje, EstadoViaje>> = {
  programado: "en_retiro",
  reprogramado: "en_retiro",
  en_retiro: "en_viaje",
  en_viaje: "entregado",
  entregado: "cerrado",
};

const ANTERIOR: Partial<Record<EstadoViaje, EstadoViaje>> = {
  en_retiro: "programado",
  en_viaje: "en_retiro",
  entregado: "en_viaje",
  cerrado: "entregado",
};

const TEXTO_AVANZAR: Partial<Record<EstadoViaje, string>> = {
  en_retiro: "Marcar en retiro",
  en_viaje: "Marcar en viaje",
  entregado: "Marcar entregado",
  cerrado: "Cerrar viaje",
};

export const NOMBRE_ESTADO: Record<EstadoViaje, string> = {
  programado: "Programado",
  en_retiro: "En retiro",
  en_viaje: "En viaje",
  entregado: "Entregado",
  cerrado: "Cerrado",
  reprogramado: "Reprogramado",
  cancelado: "Cancelado",
};

export const siguienteEstado = (estado: EstadoViaje) => SIGUIENTE[estado] ?? null;
export const estadoAnterior = (estado: EstadoViaje) => ANTERIOR[estado] ?? null;

export function textoAvanzar(estado: EstadoViaje): string | null {
  const siguiente = siguienteEstado(estado);
  return siguiente ? (TEXTO_AVANZAR[siguiente] ?? null) : null;
}

/** Se cancela solo un viaje que no salió y no tiene pagos (con anticipo: sprint 4). */
export function puedeCancelar(estado: EstadoViaje, tienePagos: boolean) {
  return !tienePagos && (estado === "programado" || estado === "reprogramado" || estado === "en_retiro");
}

export function validarCapacidad(cantidad: number, capacidad: number, unidad: string): string | null {
  return cantidad > capacidad ? `${unidad} lleva hasta ${capacidad} ${capacidad === 1 ? "auto" : "autos"}.` : null;
}

/** Como parsearPlata, pero acepta $ 0 (un favor, un viaje propio). */
export function parsearPrecio(texto: string): ResultadoParseo {
  if (/^\s*(US)?\$?\s*0+(,0{1,2})?\s*$/i.test(texto)) return { ok: true, centavos: 0 };
  return parsearPlata(texto);
}

// -----------------------------------------------------------------------------
// Armado del viaje
// -----------------------------------------------------------------------------

export type AutoBorrador = {
  cliente_id: string | null;
  cliente_nuevo: { nombre: string; whatsapp: string } | null;
  vehiculo_id: string | null;
  marca: string;
  modelo: string;
  precio: string;
};

export type ViajeBorrador = {
  origen: string;
  destino: string;
  tarifa_id: string | null;
  moneda: Moneda;
  fecha_salida: string;
  fecha_llegada: string | null;
  unidad_id: string | null;
  unidad_nombre: string;
  capacidad: number | null;
  chofer_id: string | null;
  notas: string;
  autos: AutoBorrador[];
};

export type ItemNuevo = {
  cliente_id?: string;
  cliente_nuevo?: { nombre: string; whatsapp: string | null };
  vehiculo_id?: string;
  vehiculo?: { marca: string; modelo: string };
  precio_centavos: number;
};

export type ViajeArmado =
  | { ok: true; items: ItemNuevo[]; total: number; autosEnCero: number }
  | { ok: false; error: string };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Valida un auto del formulario y lo deja listo para la base. n: número de auto (para los mensajes). */
export function armarItem(a: AutoBorrador, n: number): { ok: true; item: ItemNuevo } | { ok: false; error: string } {
  const falla = (error: string) => ({ ok: false as const, error });
  const item: Partial<ItemNuevo> = {};

  if (a.cliente_id) {
    item.cliente_id = a.cliente_id;
  } else if (a.cliente_nuevo) {
    const nombre = a.cliente_nuevo.nombre.trim().replace(/\s+/g, " ");
    if (nombre === "") return falla(`Escribí el nombre del cliente nuevo (auto ${n}).`);
    const whatsapp = a.cliente_nuevo.whatsapp.replace(/[^\d+]/g, "");
    if (whatsapp !== "" && whatsapp.replace(/\D/g, "").length < 8) {
      return falla(`Revisá el WhatsApp del cliente nuevo (auto ${n}): tiene que tener al menos 8 números.`);
    }
    item.cliente_nuevo = { nombre, whatsapp: whatsapp === "" ? null : whatsapp };
  } else {
    return falla(`Elegí el cliente del auto ${n}.`);
  }

  if (a.vehiculo_id) {
    item.vehiculo_id = a.vehiculo_id;
  } else {
    const marca = a.marca.trim();
    const modelo = a.modelo.trim();
    if (marca === "" || modelo === "") return falla(`Escribí marca y modelo del auto ${n}.`);
    item.vehiculo = { marca, modelo };
  }

  const precio = parsearPrecio(a.precio);
  if (!precio.ok) return falla(`Auto ${n}: ${precio.error}`);
  item.precio_centavos = precio.centavos;
  return { ok: true, item: item as ItemNuevo };
}

export function armarViaje(b: ViajeBorrador): ViajeArmado {
  const falla = (error: string): ViajeArmado => ({ ok: false, error });

  if (b.origen.trim() === "" || b.destino.trim() === "") return falla("Elegí la ruta o escribí origen y destino.");
  if (normalizar(b.origen) === normalizar(b.destino)) return falla("El origen y el destino son iguales.");
  if (!b.unidad_id) return falla("Elegí la unidad.");
  if (!FECHA.test(b.fecha_salida)) return falla("Revisá la fecha de salida.");
  if (b.fecha_llegada) {
    if (!FECHA.test(b.fecha_llegada)) return falla("Revisá la fecha de llegada.");
    if (b.fecha_llegada < b.fecha_salida) return falla("La llegada no puede ser antes de la salida.");
  }
  if (b.autos.length === 0) return falla("Agregá al menos un auto.");
  if (b.capacidad !== null) {
    const error = validarCapacidad(b.autos.length, b.capacidad, b.unidad_nombre);
    if (error) return falla(error);
  }

  const items: ItemNuevo[] = [];
  for (const [indice, a] of b.autos.entries()) {
    const item = armarItem(a, indice + 1);
    if (!item.ok) return falla(item.error);
    items.push(item.item);
  }

  return {
    ok: true,
    items,
    total: items.reduce((suma, i) => suma + i.precio_centavos, 0),
    autosEnCero: items.filter((i) => i.precio_centavos === 0).length,
  };
}

// -----------------------------------------------------------------------------
// Avisos de disponibilidad (avisan, no impiden)
// -----------------------------------------------------------------------------

type ViajeAgenda = {
  numero: number;
  unidad_id: string | null;
  chofer_id: string | null;
  fecha_salida: string;
  fecha_llegada_estimada: string | null;
  estado: EstadoViaje;
};

type Bloqueo = {
  unidad_id: string | null;
  chofer_id: string | null;
  desde: string;
  hasta: string;
  motivo: "service" | "vtv" | "taller" | "franco" | "vacaciones" | "otro";
};

const MOTIVO: Record<Bloqueo["motivo"], string> = {
  service: "en service",
  vtv: "en la VTV",
  taller: "en el taller",
  franco: "de franco",
  vacaciones: "de vacaciones",
  otro: "bloqueado",
};

const seSuperponen = (desde1: string, hasta1: string, desde2: string, hasta2: string) =>
  desde1 <= hasta2 && desde2 <= hasta1;

export function avisosDisponibilidad(
  consulta: {
    unidad_id: string | null;
    unidad_nombre: string;
    chofer_id: string | null;
    chofer_nombre: string;
    desde: string;
    hasta: string;
  },
  viajes: ViajeAgenda[],
  bloqueos: Bloqueo[],
): string[] {
  const avisos: string[] = [];
  const { desde, hasta } = consulta;

  for (const v of viajes) {
    if (v.estado === "cancelado") continue;
    if (!seSuperponen(desde, hasta, v.fecha_salida, v.fecha_llegada_estimada ?? v.fecha_salida)) continue;
    const cuando = `#${v.numero} (${formatearFecha(v.fecha_salida)})`;
    if (consulta.unidad_id && v.unidad_id === consulta.unidad_id) {
      avisos.push(`${consulta.unidad_nombre} ya tiene el viaje ${cuando}.`);
    }
    if (consulta.chofer_id && v.chofer_id === consulta.chofer_id) {
      avisos.push(`${consulta.chofer_nombre} ya maneja el viaje ${cuando}.`);
    }
  }

  for (const b of bloqueos) {
    if (!seSuperponen(desde, hasta, b.desde, b.hasta)) continue;
    const periodo = `${MOTIVO[b.motivo]} del ${formatearFecha(b.desde)} al ${formatearFecha(b.hasta)}`;
    if (consulta.unidad_id && b.unidad_id === consulta.unidad_id) avisos.push(`${consulta.unidad_nombre} está ${periodo}.`);
    if (consulta.chofer_id && b.chofer_id === consulta.chofer_id) avisos.push(`${consulta.chofer_nombre} está ${periodo}.`);
  }

  return avisos;
}

/** Para no crear dos veces el mismo cliente: "¿Es Juan Pérez (ficticio)?" */
export function clientesParecidos<T extends { nombre: string }>(texto: string, clientes: T[]): T[] {
  const palabras = normalizar(texto).split(/\s+/).filter((p) => p.length >= 3);
  if (palabras.length === 0) return [];
  return clientes.filter((c) => {
    const nombre = normalizar(c.nombre);
    return palabras.every((p) => nombre.includes(p));
  });
}
