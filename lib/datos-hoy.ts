// Consultas del Inicio de Rodrigo ("Hoy"). RLS filtra por empresa.

import { aCentavos, fallo } from "./datos";
import { type Moneda, sumarDias } from "./formato";
import type { Mes, ViajeHoy } from "./hoy";
import { crearClienteServidor } from "./supabase/server";
import type { Montos } from "./tablero";

export type Resultados = {
  viajes: number;
  facturado: Montos;
  cobrado: Montos;
  recuperado: Montos;
};

export async function obtenerResultados({ anio, mes }: Mes): Promise<Resultados> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("resultados_mes", { p_anio: anio, p_mes: mes });
  if (error) fallo("los resultados del mes", error);

  const r: Resultados = { viajes: Number(data?.viajes ?? 0), facturado: {}, cobrado: {}, recuperado: {} };
  for (const m of (data?.montos ?? []) as { moneda: Moneda; facturado: unknown; cobrado: unknown; recuperado: unknown }[]) {
    r.facturado[m.moneda] = aCentavos(m.facturado);
    r.cobrado[m.moneda] = aCentavos(m.cobrado);
    r.recuperado[m.moneda] = aCentavos(m.recuperado);
  }
  return r;
}

/** Viajes que no salieron o están en la ruta, con salida hasta dentro de 7 días. */
export async function obtenerViajesHoy(hoy: string): Promise<ViajeHoy[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("viajes")
    .select("id, numero, estado, fecha_salida, origen, destino, unidades(nombre), choferes(nombre)")
    .in("estado", ["programado", "reprogramado", "en_retiro", "en_viaje"])
    .lte("fecha_salida", sumarDias(hoy, 7))
    .order("fecha_salida");
  if (error) fallo("los viajes de hoy", error);
  const viajes = data ?? [];
  if (viajes.length === 0) return [];

  const { data: items, error: errorItems } = await supabase
    .from("v_items_saldo")
    .select("viaje_id, estado_cobro, fecha_entrega")
    .in("viaje_id", viajes.map((v) => v.id));
  if (errorItems) fallo("los autos de los viajes", errorItems);
  const autos = new Map<string, number>();
  const entregados = new Map<string, number>();
  for (const i of items ?? []) {
    if (i.estado_cobro === "cancelado") continue;
    autos.set(i.viaje_id, (autos.get(i.viaje_id) ?? 0) + 1);
    if (i.fecha_entrega) entregados.set(i.viaje_id, (entregados.get(i.viaje_id) ?? 0) + 1);
  }

  return viajes.map((v) => ({
    id: v.id,
    numero: Number(v.numero),
    estado: v.estado,
    fecha_salida: v.fecha_salida,
    origen: v.origen,
    destino: v.destino,
    unidad: (v.unidades as unknown as { nombre: string } | null)?.nombre ?? null,
    chofer: (v.choferes as unknown as { nombre: string } | null)?.nombre ?? null,
    autos: autos.get(v.id) ?? 0,
    entregados: entregados.get(v.id) ?? 0,
  }));
}
