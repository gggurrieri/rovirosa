// Edición de un viaje ya cargado: qué se puede cambiar según el estado y armado de
// los cambios para la base. Funciones puras; la base vuelve a validar todo
// (editar_viaje y sus triggers), estas reglas son para avisar antes de guardar.

import { formatearPlata, type Moneda } from "./formato";
import { type AutoBorrador, armarItem, type EstadoViaje, type ItemNuevo, parsearPrecio, validarCapacidad } from "./viajes";

export type CampoViaje = "fecha_salida" | "fecha_llegada" | "origen" | "destino" | "unidad_id" | "chofer_id" | "notas";

const TODOS: CampoViaje[] = ["fecha_salida", "fecha_llegada", "origen", "destino", "unidad_id", "chofer_id", "notas"];

/** Igual que campos_editables_viaje() en la base. */
export function camposEditables(estado: EstadoViaje): CampoViaje[] {
  if (estado === "programado" || estado === "reprogramado") return TODOS;
  if (estado === "en_retiro" || estado === "en_viaje") return ["chofer_id", "notas"];
  return ["notas"];
}

export const puedeCambiarPrecios = (estado: EstadoViaje) => estado !== "cancelado";
export const precioPideMotivo = (estado: EstadoViaje) => estado === "entregado" || estado === "cerrado";
export const puedeCambiarAutos = (estado: EstadoViaje) => estado === "programado" || estado === "reprogramado";

/** Igual que mensaje_edicion_viaje() en la base. */
export function mensajeEdicion(estado: EstadoViaje): string {
  switch (estado) {
    case "en_retiro":
      return "El viaje ya está en retiro: solo se pueden cambiar el chofer, las notas y los precios.";
    case "en_viaje":
      return "El viaje ya está en viaje: solo se pueden cambiar el chofer, las notas y los precios.";
    case "entregado":
      return "El viaje ya está entregado: solo se pueden cambiar las notas y los precios (con motivo).";
    case "cerrado":
      return "El viaje ya está cerrado: solo se pueden cambiar las notas y los precios (con motivo).";
    case "cancelado":
      return "El viaje está cancelado: solo se pueden cambiar las notas.";
    default:
      return "Ese cambio no se puede hacer.";
  }
}

export type AutoOriginal = {
  item_id: string;
  /** "Audi R8 (Juan Pérez)", para los mensajes. */
  nombre: string;
  moneda: Moneda;
  precio_centavos: number;
  cobrado_centavos: number;
};

export type ViajeOriginal = {
  estado: EstadoViaje;
  fecha_salida: string;
  fecha_llegada: string | null;
  origen: string;
  destino: string;
  unidad_id: string | null;
  chofer_id: string | null;
  notas: string | null;
  /** Solo los autos activos (los cancelados no se editan). */
  autos: AutoOriginal[];
};

export type EdicionBorrador = {
  fecha_salida: string;
  /** "" = sin llegada estimada. */
  fecha_llegada: string;
  origen: string;
  destino: string;
  unidad_id: string | null;
  chofer_id: string | null;
  notas: string;
  /** Precio escrito por item_id, como lo tipeó la persona. */
  precios: Record<string, string>;
  quitar: string[];
  agregar: AutoBorrador[];
  motivo: string;
  /** De la unidad elegida. */
  capacidad: number | null;
  unidad_nombre: string;
};

export type CambiosViaje = {
  viaje?: Partial<Record<CampoViaje, string | null>>;
  precios?: { item_id: string; precio_centavos: number }[];
  quitar?: string[];
  agregar?: ItemNuevo[];
  motivo?: string;
};

export type CambiosArmados =
  | { ok: true; cambios: CambiosViaje; cantidad: number; autosEnCero: number }
  | { ok: false; error: string };

const sinSimbolo = (centavos: number, moneda: Moneda) => formatearPlata(centavos, moneda).replace(/^(US)?\$ /, "");
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** El formulario arranca con los datos actuales del viaje. */
export function borradorDesde(v: ViajeOriginal): Omit<EdicionBorrador, "capacidad" | "unidad_nombre"> {
  return {
    fecha_salida: v.fecha_salida,
    fecha_llegada: v.fecha_llegada ?? "",
    origen: v.origen,
    destino: v.destino,
    unidad_id: v.unidad_id,
    chofer_id: v.chofer_id,
    notas: v.notas ?? "",
    precios: Object.fromEntries(v.autos.map((a) => [a.item_id, sinSimbolo(a.precio_centavos, a.moneda)])),
    quitar: [],
    agregar: [],
    motivo: "",
  };
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function armarCambios(o: ViajeOriginal, b: EdicionBorrador): CambiosArmados {
  const falla = (error: string): CambiosArmados => ({ ok: false, error });
  const cambios: CambiosViaje = {};
  let cantidad = 0;

  // 1. Datos del viaje: solo los que cambiaron
  const finales: Record<CampoViaje, string | null> = {
    fecha_salida: b.fecha_salida,
    fecha_llegada: b.fecha_llegada.trim() === "" ? null : b.fecha_llegada,
    origen: b.origen.trim(),
    destino: b.destino.trim(),
    unidad_id: b.unidad_id,
    chofer_id: b.chofer_id,
    notas: b.notas.trim() === "" ? null : b.notas.trim(),
  };
  const actuales: Record<CampoViaje, string | null> = {
    fecha_salida: o.fecha_salida,
    fecha_llegada: o.fecha_llegada,
    origen: o.origen,
    destino: o.destino,
    unidad_id: o.unidad_id,
    chofer_id: o.chofer_id,
    notas: o.notas,
  };
  const editables = camposEditables(o.estado);
  const viaje: Partial<Record<CampoViaje, string | null>> = {};
  for (const campo of TODOS) {
    if (finales[campo] === actuales[campo]) continue;
    if (!editables.includes(campo)) return falla(mensajeEdicion(o.estado));
    viaje[campo] = finales[campo];
  }
  if (finales.origen === "" || finales.destino === "") return falla("Escribí origen y destino.");
  if (normalizar(finales.origen!) === normalizar(finales.destino!)) return falla("El origen y el destino son iguales.");
  if (!FECHA.test(b.fecha_salida)) return falla("Revisá la fecha de salida.");
  if (finales.fecha_llegada) {
    if (!FECHA.test(finales.fecha_llegada)) return falla("Revisá la fecha de llegada.");
    if (finales.fecha_llegada < b.fecha_salida) return falla("La llegada no puede ser antes de la salida.");
  }
  if (!b.unidad_id) return falla("Elegí la unidad.");
  if (Object.keys(viaje).length > 0) {
    cambios.viaje = viaje;
    cantidad += Object.keys(viaje).length;
  }

  // 2. Precios
  const precios: { item_id: string; precio_centavos: number }[] = [];
  for (const a of o.autos) {
    if (b.quitar.includes(a.item_id)) continue;
    const texto = b.precios[a.item_id] ?? sinSimbolo(a.precio_centavos, a.moneda);
    const precio = parsearPrecio(texto);
    if (!precio.ok) return falla(`${a.nombre}: ${precio.error}`);
    if (precio.centavos === a.precio_centavos) continue;
    if (!puedeCambiarPrecios(o.estado)) return falla(mensajeEdicion(o.estado));
    if (precio.centavos < a.cobrado_centavos) {
      return falla(`Ya se cobraron ${formatearPlata(a.cobrado_centavos, a.moneda)} del ${a.nombre}: el precio no puede ser menor.`);
    }
    precios.push({ item_id: a.item_id, precio_centavos: precio.centavos });
  }
  if (precios.length > 0) {
    if (precioPideMotivo(o.estado) && b.motivo.trim() === "") return falla("Escribí el motivo del cambio de precio.");
    cambios.precios = precios;
    cantidad += precios.length;
  }

  // 3. Quitar y agregar autos
  if ((b.quitar.length > 0 || b.agregar.length > 0) && !puedeCambiarAutos(o.estado)) {
    return falla("Solo se agregan o quitan autos antes de que salga el viaje.");
  }
  for (const id of b.quitar) {
    const auto = o.autos.find((a) => a.item_id === id);
    if (!auto) return falla("El auto no es de este viaje.");
    if (auto.cobrado_centavos > 0) return falla(`El ${auto.nombre} tiene pagos: no se puede quitar.`);
  }
  const agregar: ItemNuevo[] = [];
  for (const [i, a] of b.agregar.entries()) {
    const item = armarItem(a, o.autos.length + i + 1);
    if (!item.ok) return falla(item.error);
    agregar.push(item.item);
  }
  const activos = o.autos.length - b.quitar.length + agregar.length;
  if (activos === 0) return falla("El viaje tiene que tener al menos un auto.");
  const cambiaCarga = b.quitar.length > 0 || agregar.length > 0 || "unidad_id" in viaje;
  if (b.capacidad !== null && cambiaCarga) {
    const error = validarCapacidad(activos, b.capacidad, b.unidad_nombre);
    if (error) return falla(error);
  }
  if (b.quitar.length > 0) {
    cambios.quitar = [...b.quitar];
    cantidad += b.quitar.length;
  }
  if (agregar.length > 0) {
    cambios.agregar = agregar;
    cantidad += agregar.length;
  }

  if (b.motivo.trim() !== "" && cantidad > 0) cambios.motivo = b.motivo.trim();
  return { ok: true, cambios, cantidad, autosEnCero: agregar.filter((i) => i.precio_centavos === 0).length };
}
