// Consultas para cargar y seguir viajes. Como siempre, RLS filtra por empresa.

import { aCentavos, fallo } from "./datos";
import { hoyEnArgentina, type Moneda, sumarDias } from "./formato";
import type { EstadoCobro } from "./tablero";
import { crearClienteServidor } from "./supabase/server";
import type { EstadoViaje } from "./viajes";

export type Tarifa = { id: string; origen: string; destino: string; precio_base_centavos: number; moneda: Moneda };
export type Unidad = { id: string; nombre: string; capacidad_autos: number; chofer_habitual_id: string | null };
export type Chofer = { id: string; nombre: string };
export type Vehiculo = { id: string; cliente_id: string; marca: string; modelo: string };
export type ViajeAgenda = {
  numero: number;
  origen: string;
  destino: string;
  unidad_id: string | null;
  chofer_id: string | null;
  fecha_salida: string;
  fecha_llegada_estimada: string | null;
  estado: EstadoViaje;
};
export type Bloqueo = {
  unidad_id: string | null;
  chofer_id: string | null;
  desde: string;
  hasta: string;
  motivo: "service" | "vtv" | "taller" | "franco" | "vacaciones" | "otro";
};

export type OpcionesViaje = {
  tarifas: Tarifa[];
  unidades: Unidad[];
  choferes: Chofer[];
  clientes: { id: string; nombre: string }[];
  vehiculos: Vehiculo[];
  agenda: ViajeAgenda[];
  bloqueos: Bloqueo[];
};

/** Todo lo que necesita el formulario de Nuevo viaje, en una sola ida a la base. */
export async function obtenerOpcionesViaje(): Promise<OpcionesViaje> {
  const supabase = await crearClienteServidor();
  const desde = sumarDias(hoyEnArgentina(), -60);
  const [tarifas, unidades, choferes, clientes, vehiculos, agenda, bloqueos] = await Promise.all([
    supabase.from("tarifas").select("id, origen, destino, precio_base_centavos, moneda").eq("activa", true).order("origen").order("destino"),
    supabase.from("unidades").select("id, nombre, capacidad_autos, chofer_habitual_id").eq("activa", true).order("nombre"),
    supabase.from("choferes").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("clientes").select("id, nombre").order("nombre"),
    supabase.from("vehiculos").select("id, cliente_id, marca, modelo").order("marca"),
    supabase
      .from("viajes")
      .select("numero, origen, destino, unidad_id, chofer_id, fecha_salida, fecha_llegada_estimada, estado")
      .gte("fecha_salida", desde)
      .neq("estado", "cancelado"),
    supabase.from("bloqueos_disponibilidad").select("unidad_id, chofer_id, desde, hasta, motivo").gte("hasta", desde),
  ]);
  for (const [que, r] of [
    ["las tarifas", tarifas],
    ["las unidades", unidades],
    ["los choferes", choferes],
    ["los clientes", clientes],
    ["los vehículos", vehiculos],
    ["la agenda", agenda],
    ["los bloqueos", bloqueos],
  ] as const) {
    if (r.error) fallo(que, r.error);
  }

  // Rutas más usadas primero (últimos 60 días): las frecuentes quedan a un toque.
  const usos = new Map<string, number>();
  for (const v of agenda.data ?? []) {
    const clave = `${v.origen}→${v.destino}`;
    usos.set(clave, (usos.get(clave) ?? 0) + 1);
  }
  const usoDe = (t: { origen: string; destino: string }) => usos.get(`${t.origen}→${t.destino}`) ?? 0;

  return {
    tarifas: (tarifas.data ?? [])
      .map((t) => ({ ...t, precio_base_centavos: aCentavos(t.precio_base_centavos) }))
      .sort((a, b) => usoDe(b) - usoDe(a)),
    unidades: unidades.data ?? [],
    choferes: choferes.data ?? [],
    clientes: clientes.data ?? [],
    vehiculos: vehiculos.data ?? [],
    agenda: (agenda.data ?? []).map((v) => ({ ...v, numero: Number(v.numero) })),
    bloqueos: bloqueos.data ?? [],
  };
}

export async function existeViaje(id: string): Promise<boolean> {
  const supabase = await crearClienteServidor();
  const { count, error } = await supabase.from("viajes").select("id", { count: "exact", head: true }).eq("id", id);
  if (error) fallo("el viaje", error);
  return (count ?? 0) > 0;
}

export type AutoDelViaje = {
  item_id: string;
  cliente_id: string;
  cliente_nombre: string;
  vehiculo: string | null;
  moneda: Moneda;
  precio_centavos: number;
  cobrado_centavos: number;
  saldo_centavos: number;
  estado_cobro: EstadoCobro;
  vencido: boolean;
  fecha_entrega: string | null;
};

export type DetalleViaje = {
  id: string;
  numero: number;
  fecha_salida: string;
  fecha_llegada_estimada: string | null;
  origen: string;
  destino: string;
  estado: EstadoViaje;
  notas: string | null;
  unidad: string | null;
  chofer: string | null;
  autos: AutoDelViaje[];
};

export async function obtenerViaje(id: string): Promise<DetalleViaje | null> {
  const supabase = await crearClienteServidor();
  const [viaje, autos] = await Promise.all([
    supabase
      .from("viajes")
      .select("id, numero, fecha_salida, fecha_llegada_estimada, origen, destino, estado, notas, unidades(nombre), choferes(nombre)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("v_items_saldo")
      .select("id, cliente_id, cliente_nombre, vehiculo, moneda, precio_centavos, cobrado_centavos, saldo_centavos, estado_cobro, vencido, fecha_entrega")
      .eq("viaje_id", id)
      .order("cliente_nombre"),
  ]);
  if (viaje.error) fallo("el viaje", viaje.error);
  if (autos.error) fallo("los autos del viaje", autos.error);
  if (!viaje.data) return null;

  const v = viaje.data;
  return {
    id: v.id,
    numero: Number(v.numero),
    fecha_salida: v.fecha_salida,
    fecha_llegada_estimada: v.fecha_llegada_estimada,
    origen: v.origen,
    destino: v.destino,
    estado: v.estado,
    notas: v.notas,
    unidad: (v.unidades as unknown as { nombre: string } | null)?.nombre ?? null,
    chofer: (v.choferes as unknown as { nombre: string } | null)?.nombre ?? null,
    autos: (autos.data ?? []).map((a) => ({
      item_id: a.id,
      cliente_id: a.cliente_id,
      cliente_nombre: a.cliente_nombre,
      vehiculo: a.vehiculo,
      moneda: a.moneda,
      precio_centavos: aCentavos(a.precio_centavos),
      cobrado_centavos: aCentavos(a.cobrado_centavos),
      saldo_centavos: aCentavos(a.saldo_centavos),
      estado_cobro: a.estado_cobro,
      vencido: a.vencido === true,
      fecha_entrega: a.fecha_entrega,
    })),
  };
}
