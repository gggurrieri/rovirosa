"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoLogin = { error: string | null; email: string };

const datosLogin = z.object({
  email: z.email({ error: "Revisá el email: no parece válido." }),
  password: z.string().min(1, { error: "Escribí tu contraseña." }),
});

export async function iniciarSesion(_anterior: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const validacion = datosLogin.safeParse({ email, password: formData.get("password") ?? "" });
  if (!validacion.success) {
    return { error: validacion.error.issues[0].message, email };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword(validacion.data);
  if (error) {
    return { error: mensajeDeError(error.code), email };
  }
  redirect("/");
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}

function mensajeDeError(codigo: string | undefined): string {
  switch (codigo) {
    case "invalid_credentials":
      return "El email o la contraseña no son correctos.";
    case "email_not_confirmed":
      return "Tu email todavía no está confirmado.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Hubo demasiados intentos. Esperá unos minutos y probá de nuevo.";
    default:
      return "No pudimos iniciar sesión. Revisá la conexión y probá de nuevo.";
  }
}
