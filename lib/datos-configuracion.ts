// Configuración de la empresa: tarifas, unidades, choferes y datos generales. RLS filtra por empresa.

import { aCentavos, fallo } from "./datos";
import type { Moneda } from "./formato";
import { crearClienteServidor } from "./supabase/server";

export type TarifaConfig = { id: string; origen: string; destino: string; km: number; precio_base_centavos: number; moneda: Moneda; activa: boolean };
export type ViajePendiente = { numero: number; fecha_salida: string };
export type UnidadConfig = {
  id: string;
  nombre: string;
  patente: string | null;
  tipo: "mosquito" | "camioneta_carro" | "otro";
  capacidad_autos: number;
  chofer_habitual_id: string | null;
  chofer: string | null;
  activa: boolean;
  proximos: ViajePendiente[];
};
export type ChoferConfig = { id: string; nombre: string; telefono: string | null; activo: boolean; proximos: ViajePendiente[] };

export async function obtenerTarifasConfig(): Promise<TarifaConfig[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("tarifas")
    .select("id, origen, destino, km, precio_base_centavos, moneda, activa")
    .order("origen")
    .order("destino");
  if (error) fallo("las tarifas", error);
  return (data ?? []).map((t) => ({ ...t, precio_base_centavos: aCentavos(t.precio_base_centavos) }));
}

/** Viajes que todavía no salieron, por unidad y por chofer (para avisar antes de desactivar). */
async function viajesPendientes() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("viajes")
    .select("numero, fecha_salida, unidad_id, chofer_id")
    .in("estado", ["programado", "reprogramado", "en_retiro"])
    .order("fecha_salida");
  if (error) fallo("los próximos viajes", error);
  return (data ?? []).map((v) => ({ ...v, numero: Number(v.numero) }));
}

export async function obtenerUnidadesConfig(): Promise<UnidadConfig[]> {
  const supabase = await crearClienteServidor();
  const [unidades, choferes, pendientes] = await Promise.all([
    supabase.from("unidades").select("id, nombre, patente, tipo, capacidad_autos, chofer_habitual_id, activa").order("nombre"),
    supabase.from("choferes").select("id, nombre"),
    viajesPendientes(),
  ]);
  if (unidades.error) fallo("las unidades", unidades.error);
  if (choferes.error) fallo("los choferes", choferes.error);
  const nombreChofer = new Map((choferes.data ?? []).map((c) => [c.id, c.nombre]));
  return (unidades.data ?? []).map((u) => ({
    id: u.id,
    nombre: u.nombre,
    patente: u.patente,
    tipo: u.tipo,
    capacidad_autos: u.capacidad_autos,
    chofer_habitual_id: u.chofer_habitual_id,
    chofer: u.chofer_habitual_id ? (nombreChofer.get(u.chofer_habitual_id) ?? null) : null,
    activa: u.activa,
    proximos: pendientes.filter((v) => v.unidad_id === u.id).map(({ numero, fecha_salida }) => ({ numero, fecha_salida })),
  }));
}

export async function obtenerChoferesConfig(): Promise<ChoferConfig[]> {
  const supabase = await crearClienteServidor();
  const [choferes, pendientes] = await Promise.all([
    supabase.from("choferes").select("id, nombre, telefono, activo").order("nombre"),
    viajesPendientes(),
  ]);
  if (choferes.error) fallo("los choferes", choferes.error);
  return (choferes.data ?? []).map((c) => ({
    ...c,
    proximos: pendientes.filter((v) => v.chofer_id === c.id).map(({ numero, fecha_salida }) => ({ numero, fecha_salida })),
  }));
}

export async function obtenerEmpresaConfig(): Promise<{ nombre: string; cuit: string | null; dias_vencimiento: number }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("empresas").select("nombre, cuit, dias_vencimiento").maybeSingle();
  if (error) fallo("los datos de la empresa", error);
  return { nombre: data?.nombre ?? "", cuit: data?.cuit ?? null, dias_vencimiento: data?.dias_vencimiento ?? 7 };
}
