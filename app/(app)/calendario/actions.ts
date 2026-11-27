"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { mensajeDeBase } from "@/lib/errores";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Estado = { error: string | null };
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Elegí las fechas." });

export async function crearBloqueo(_anterior: Estado, formData: FormData): Promise<Estado> {
  const que = String(formData.get("que") ?? "");
  const [tipo, id] = que.split(":");
  const v = z
    .object({
      tipo: z.enum(["u", "c"], { error: "Elegí qué se bloquea." }),
      id: z.guid({ error: "Elegí qué se bloquea." }),
      desde: fecha,
      hasta: fecha,
      motivo: z.enum(["service", "vtv", "taller", "franco", "vacaciones", "otro"], { error: "Elegí el motivo." }),
      notas: z.string().trim().max(300),
    })
    .safeParse({ tipo, id, desde: formData.get("desde"), hasta: formData.get("hasta"), motivo: formData.get("motivo"), notas: String(formData.get("notas") ?? "") });
  if (!v.success) return { error: v.error.issues[0].message };
  const d = v.data;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_bloqueo", {
    p_unidad_id: d.tipo === "u" ? d.id : null,
    p_chofer_id: d.tipo === "c" ? d.id : null,
    p_desde: d.desde,
    p_hasta: d.hasta,
    p_motivo: d.motivo,
    p_notas: d.notas,
  });
  if (error) return { error: mensajeDeBase(error) };
  const choques = ((data as { choques: { numero: number }[] }).choques ?? []).map((c) => c.numero).join(",");
  redirect(`/calendario?desde=${d.desde}&bloqueo=1${choques ? `&choques=${choques}` : ""}`);
}

export async function anularBloqueo(_anterior: Estado, formData: FormData): Promise<Estado> {
  const v = z
    .object({ id: z.guid(), motivo: z.string().trim().min(1, { error: "Escribí el motivo." }).max(300) })
    .safeParse({ id: formData.get("id"), motivo: String(formData.get("motivo") ?? "") });
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_bloqueo", { p_id: v.data.id, p_motivo: v.data.motivo });
  if (error) return { error: mensajeDeBase(error) };
  redirect("/calendario?anulado=1");
}
