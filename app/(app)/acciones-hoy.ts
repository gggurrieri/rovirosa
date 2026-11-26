"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { mensajeDeBase } from "@/lib/errores";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoAccion = { error: string | null };

const ESTADOS = ["programado", "reprogramado", "en_retiro", "en_viaje", "entregado"] as const;
const datos = z.object({
  viaje_id: z.guid(),
  numero: z.coerce.number().int().positive(),
  desde: z.enum(ESTADOS),
  hacia: z.enum(ESTADOS),
  mes: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
});

/** Acciones de un toque desde Inicio ("Empezó el viaje", "Terminó") y su Deshacer. */
export async function accionRapida(_anterior: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const validacion = datos.safeParse({
    viaje_id: formData.get("viaje_id"),
    numero: formData.get("numero"),
    desde: formData.get("desde"),
    hacia: formData.get("hacia"),
    mes: formData.get("mes") || null,
  });
  if (!validacion.success) return { error: "No pudimos leer la acción. Recargá la página." };
  const d = validacion.data;

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cambiar_estado_viaje", {
    p_viaje_id: d.viaje_id,
    p_desde: d.desde,
    p_hacia: d.hacia,
    p_fecha_entrega: null, // "Terminó" usa la fecha de hoy
  });
  if (error) return { error: mensajeDeBase(error) };

  const params = new URLSearchParams({ hecho: d.viaje_id, n: String(d.numero), desde: d.desde, hacia: d.hacia });
  if (d.mes) params.set("mes", d.mes);
  redirect(`/?${params}`);
}
