// Historial de cambios de un viaje. La tabla auditoria solo la ve el dueño (RLS):
// para cualquier otro rol estas consultas devuelven vacío.

import { fallo } from "./datos";
import { type DetalleViaje, nombreAuto } from "./datos-viajes";
import { armarHistorial, type EventoAuditoria, type LineaHistorial } from "./historial";
import { crearClienteServidor } from "./supabase/server";

const COLUMNAS = "tabla, registro_id, accion, antes, despues, usuario, en, motivo";

export async function obtenerHistorial(viaje: DetalleViaje): Promise<LineaHistorial[]> {
  const supabase = await crearClienteServidor();
  const idsAutos = viaje.autos.map((a) => a.item_id);
  const [delViaje, deAutos, usuarios, unidades, choferes] = await Promise.all([
    supabase.from("auditoria").select(COLUMNAS).eq("tabla", "viajes").eq("registro_id", viaje.id),
    idsAutos.length > 0
      ? supabase.from("auditoria").select(COLUMNAS).eq("tabla", "items_viaje").in("registro_id", idsAutos)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("perfiles").select("user_id, nombre"),
    supabase.from("unidades").select("id, nombre"),
    supabase.from("choferes").select("id, nombre"),
  ]);
  for (const [que, r] of [
    ["el historial", delViaje],
    ["el historial de los autos", deAutos],
    ["los usuarios", usuarios],
    ["las unidades", unidades],
    ["los choferes", choferes],
  ] as const) {
    if (r.error) fallo(que, r.error);
  }

  const eventos = [...(delViaje.data ?? []), ...(deAutos.data ?? [])] as EventoAuditoria[];
  return armarHistorial(eventos, {
    usuarios: new Map((usuarios.data ?? []).map((u) => [u.user_id, u.nombre])),
    unidades: new Map((unidades.data ?? []).map((u) => [u.id, u.nombre])),
    choferes: new Map((choferes.data ?? []).map((c) => [c.id, c.nombre])),
    autos: new Map(viaje.autos.map((a) => [a.item_id, nombreAuto(a)])),
  });
}
