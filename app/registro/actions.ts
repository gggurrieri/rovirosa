"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoRegistro = { error: string | null; email: string; enviado: boolean };

const datosRegistro = z.object({
  email: z.email({ error: "Revisá el email: no parece válido." }),
  password: z.string().min(8, { error: "La contraseña tiene que tener al menos 8 caracteres." }).max(72),
});

/**
 * Crea el usuario en Supabase Auth con la anon key (como cualquier registro).
 * Supabase manda un mail para confirmar el email; al primer ingreso, la base le
 * asigna empresa y rol solo si el dueño lo invitó con ese email.
 */
export async function registrarse(_anterior: EstadoRegistro, formData: FormData): Promise<EstadoRegistro> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const validacion = datosRegistro.safeParse({ email, password: formData.get("password") ?? "" });
  if (!validacion.success) return { error: validacion.error.issues[0].message, email, enviado: false };

  const encabezados = await headers();
  const host = encabezados.get("x-forwarded-host") ?? encabezados.get("host") ?? "";
  const protocolo = encabezados.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signUp({
    ...validacion.data,
    options: { emailRedirectTo: `${protocolo}://${host}/auth/confirmar` },
  });
  if (error) return { error: mensajeDeError(error.code), email, enviado: false };
  // Si el proyecto no pide confirmar el email, ya queda con sesión.
  if (data.session) redirect("/");
  return { error: null, email, enviado: true };
}

function mensajeDeError(codigo: string | undefined): string {
  switch (codigo) {
    case "user_already_exists":
    case "email_exists":
      return "Ese email ya tiene usuario. Entrá desde la pantalla de ingreso.";
    case "weak_password":
      return "La contraseña es muy fácil de adivinar. Probá con una más larga.";
    case "email_address_invalid":
      return "Revisá el email: no parece válido.";
    case "signup_disabled":
      return "El registro de usuarios está desactivado. Avisale al dueño de la empresa.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Se mandaron muchos mails en poco tiempo. Esperá unos minutos y probá de nuevo.";
    default:
      return "No pudimos crear el usuario. Revisá la conexión y probá de nuevo.";
  }
}
