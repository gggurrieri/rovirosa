// Agenda para el calendario: unidades, choferes, viajes y bloqueos de un rango (RLS por empresa).

import { fallo } from "./datos";
import type { BloqueoCal, ViajeCal } from "./calendario";
import { crearClienteServidor } from "./supabase/server";

export type Agenda = {
  unidades: { id: string; nombre: string; capacidad_autos: number; chofer_habitual_id: string | null }[];
  choferes: { id: string; nombre: string }[];
  viajes: ViajeCal[];
  bloqueos: BloqueoCal[];
};

export async function obtenerAgenda(desde: string, hasta: string): Promise<Agenda> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("agenda", { p_desde: desde, p_hasta: hasta });
  if (error) fallo("la agenda", error);
  const a = data as Agenda;
  return { ...a, viajes: a.viajes.map((v) => ({ ...v, numero: Number(v.numero), autos: Number(v.autos) })) };
}

export type BloqueoDetalle = BloqueoCal & { anulado_en: string | null; anulado_motivo: string | null; quien: string };

export async function obtenerBloqueo(id: string): Promise<BloqueoDetalle | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("bloqueos_disponibilidad")
    .select("id, unidad_id, chofer_id, desde, hasta, motivo, notas, anulado_en, anulado_motivo")
    .eq("id", id)
    .maybeSingle();
  if (error) fallo("el bloqueo", error);
  if (!data) return null;
  const tabla = data.unidad_id ? "unidades" : "choferes";
  const { data: quien } = await supabase.from(tabla).select("nombre").eq("id", (data.unidad_id ?? data.chofer_id)!).maybeSingle();
  return { ...data, quien: quien?.nombre ?? "" };
}
