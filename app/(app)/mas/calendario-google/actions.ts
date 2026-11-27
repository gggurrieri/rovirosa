"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoRegenerar = { error: string | null };

/** Reemplaza el link: el anterior deja de andar en todos los calendarios donde se agregó. */
export async function regenerarLink(): Promise<EstadoRegenerar> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("token_calendario", { p_nuevo: true });
  if (error) return { error: "No se pudo generar el link nuevo. Probá de nuevo." };
  redirect("/mas/calendario-google?nuevo=1");
}
