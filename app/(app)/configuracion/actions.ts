"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { parsearPlata } from "@/lib/cobros";
import { parsearCSVTarifas } from "@/lib/configuracion";
import { obtenerSesion, puedeVerOperacion } from "@/lib/datos";
import { calcularDistancia, type ResultadoDistancia } from "@/lib/distancias";
import { mensajeDeBase } from "@/lib/errores";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Estado = { error: string | null };

const idOpcional = z.union([z.literal("nueva"), z.guid()]).transform((v) => (v === "nueva" ? null : v));
const texto = (max: number) => z.string().trim().max(max);

export async function guardarTarifa(_anterior: Estado, formData: FormData): Promise<Estado> {
  const precio = parsearPlata(String(formData.get("precio") ?? ""));
  if (!precio.ok && String(formData.get("precio") ?? "").trim() !== "0") return { error: `Precio: ${precio.error}` };
  const v = z
    .object({ id: idOpcional, origen: texto(80), destino: texto(80), km: z.coerce.number().int(), moneda: z.enum(["ARS", "USD"]), activa: z.boolean() })
    .safeParse({
      id: formData.get("id"),
      origen: String(formData.get("origen") ?? ""),
      destino: String(formData.get("destino") ?? ""),
      km: formData.get("km"),
      moneda: formData.get("moneda"),
      activa: formData.get("activa") === "on",
    });
  if (!v.success) return { error: "Revisá los datos de la tarifa." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_tarifa", {
    p_id: v.data.id,
    p_origen: v.data.origen,
    p_destino: v.data.destino,
    p_km: v.data.km,
    p_precio_centavos: precio.ok ? precio.centavos : 0,
    p_moneda: v.data.moneda,
    p_activa: v.data.activa,
  });
  if (error) return { error: mensajeDeBase(error) };
  redirect("/configuracion/tarifas?guardada=1");
}

export async function guardarUnidad(_anterior: Estado, formData: FormData): Promise<Estado> {
  const v = z
    .object({
      id: idOpcional,
      nombre: texto(60),
      patente: texto(12),
      tipo: z.enum(["mosquito", "camioneta_carro", "otro"]),
      capacidad: z.coerce.number().int(),
      chofer: z.union([z.literal(""), z.guid()]),
      activa: z.boolean(),
    })
    .safeParse({
      id: formData.get("id"),
      nombre: String(formData.get("nombre") ?? ""),
      patente: String(formData.get("patente") ?? ""),
      tipo: formData.get("tipo"),
      capacidad: formData.get("capacidad"),
      chofer: String(formData.get("chofer") ?? ""),
      activa: formData.get("activa") === "on",
    });
  if (!v.success) return { error: "Revisá los datos de la unidad." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_unidad", {
    p_id: v.data.id,
    p_nombre: v.data.nombre,
    p_patente: v.data.patente,
    p_tipo: v.data.tipo,
    p_capacidad: v.data.capacidad,
    p_chofer_habitual_id: v.data.chofer || null,
    p_activa: v.data.activa,
  });
  if (error) return { error: mensajeDeBase(error) };
  redirect("/configuracion/unidades?guardada=1");
}

export async function guardarChofer(_anterior: Estado, formData: FormData): Promise<Estado> {
  const v = z
    .object({ id: idOpcional, nombre: texto(80), telefono: texto(30), activo: z.boolean() })
    .safeParse({
      id: formData.get("id"),
      nombre: String(formData.get("nombre") ?? ""),
      telefono: String(formData.get("telefono") ?? ""),
      activo: formData.get("activo") === "on",
    });
  if (!v.success) return { error: "Revisá los datos del chofer." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_chofer", { p_id: v.data.id, p_nombre: v.data.nombre, p_telefono: v.data.telefono, p_activo: v.data.activo });
  if (error) return { error: mensajeDeBase(error) };
  redirect("/configuracion/choferes?guardado=1");
}

export async function guardarEmpresa(_anterior: Estado, formData: FormData): Promise<Estado> {
  const v = z
    .object({ nombre: texto(120), cuit: texto(20), dias: z.coerce.number().int() })
    .safeParse({ nombre: String(formData.get("nombre") ?? ""), cuit: String(formData.get("cuit") ?? ""), dias: formData.get("dias") });
  if (!v.success) return { error: "Revisá los datos de la empresa." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_empresa", { p_nombre: v.data.nombre, p_cuit: v.data.cuit, p_dias_vencimiento: v.data.dias });
  if (error) return { error: mensajeDeBase(error) };
  redirect("/configuracion/empresa?guardada=1");
}

export type VistaPrevia = { actual: { autos: number; ars: number; usd: number }; nuevo: { autos: number; ars: number; usd: number } } | null;

export async function previsualizarVencimiento(dias: number): Promise<VistaPrevia> {
  if (!Number.isInteger(dias) || dias < 0 || dias > 180) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("vista_previa_vencimiento", { p_dias: dias });
  if (error) return null;
  const n = (x: { autos: unknown; ars: unknown; usd: unknown }) => ({ autos: Number(x.autos), ars: Number(x.ars), usd: Number(x.usd) });
  const d = data as { actual: { autos: unknown; ars: unknown; usd: unknown }; nuevo: { autos: unknown; ars: unknown; usd: unknown } };
  return { actual: n(d.actual), nuevo: n(d.nuevo) };
}

export async function importarTarifas(_anterior: Estado, formData: FormData): Promise<Estado> {
  const texto = String(formData.get("csv") ?? "");
  if (texto.length > 200_000) return { error: "El archivo es muy grande (hasta 500 tarifas por vez)." };
  // Se vuelve a leer acá: no se confía en lo que mostró el navegador.
  const { filas, errores } = parsearCSVTarifas(texto);
  if (errores.length > 0) return { error: `Corregí la fila ${errores[0].linea}: ${errores[0].error}` };
  if (filas.length === 0) return { error: "No hay tarifas para importar." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("importar_tarifas", { p_filas: filas });
  if (error) return { error: mensajeDeBase(error) };
  const r = data as { creadas: number; actualizadas: number };
  redirect(`/configuracion/tarifas?creadas=${r.creadas}&actualizadas=${r.actualizadas}`);
}

/** "Calcular km" de una tarifa: consulta OpenRouteService desde el servidor (la clave no sale de acá). */
export async function calcularKm(origen: string, destino: string): Promise<ResultadoDistancia> {
  const { perfil } = await obtenerSesion();
  if (!puedeVerOperacion(perfil)) return { ok: false, error: "No tenés permiso para calcular distancias." };
  return calcularDistancia(String(origen).slice(0, 80), String(destino).slice(0, 80), {
    clave: process.env.ORS_API_KEY ?? "",
    url: process.env.ORS_URL ?? "https://api.heigit.org", // api.openrouteservice.org se dio de baja en 2026
  });
}
