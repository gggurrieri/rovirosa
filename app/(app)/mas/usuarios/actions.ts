"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { mensajeDeBase } from "@/lib/errores";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoInvitar = { error: string | null; nombre: string; email: string; rol: string };

const datosInvitacion = z.object({
  nombre: z.string().trim().min(1, { error: "Escribí el nombre." }).max(80, { error: "El nombre es muy largo." }),
  email: z.email({ error: "Revisá el email: no parece válido." }),
  rol: z.enum(["dueno", "administrativo"], { error: "Elegí el rol." }),
});

export async function invitar(_anterior: EstadoInvitar, formData: FormData): Promise<EstadoInvitar> {
  const crudo = {
    nombre: String(formData.get("nombre") ?? ""),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    rol: String(formData.get("rol") ?? ""),
  };
  const validacion = datosInvitacion.safeParse(crudo);
  if (!validacion.success) return { error: validacion.error.issues[0].message, ...crudo };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("invitar_usuario", {
    p_email: validacion.data.email,
    p_nombre: validacion.data.nombre,
    p_rol: validacion.data.rol,
  });
  if (error) return { error: mensajeDeBase(error), ...crudo };
  redirect(`/mas/usuarios?invitada=${data}`);
}

const id = z.guid();
export type EstadoAccion = { error: string | null };

export async function anularInvitacion(_anterior: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const invitacion = id.safeParse(formData.get("id"));
  if (!invitacion.success) return { error: "No se encontró la invitación." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_invitacion", { p_id: invitacion.data });
  if (error) return { error: mensajeDeBase(error) };
  redirect("/mas/usuarios?hecho=anulada");
}

export async function cambiarActivo(_anterior: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const usuario = id.safeParse(formData.get("user_id"));
  if (!usuario.success) return { error: "No se encontró el usuario." };
  const activo = formData.get("activo") === "true";
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cambiar_activo_usuario", { p_user_id: usuario.data, p_activo: activo });
  if (error) return { error: mensajeDeBase(error) };
  redirect(`/mas/usuarios?hecho=${activo ? "reactivado" : "desactivado"}`);
}
