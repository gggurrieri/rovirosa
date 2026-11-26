"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { mensajeDeBase } from "@/lib/errores";
import { type AutoAdeudado, armarMensaje, linkWhatsAppA, normalizarWhatsApp } from "@/lib/recordatorio";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoAccion = { error: string | null; clienteId?: string };

/**
 * Registra el recordatorio (con lo que el cliente debe AHORA, calculado en la base)
 * y abre WhatsApp con el mensaje armado. La persona solo tiene que tocar "Enviar".
 */
export async function recordar(_anterior: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const id = z.guid().safeParse(formData.get("cliente_id"));
  if (!id.success) return { error: "No se encontró el cliente." };
  const supabase = await crearClienteServidor();

  // El número se revisa ANTES de registrar: si no sirve, no queda un recordatorio que nunca salió.
  const { data: cliente, error: errorCliente } = await supabase.from("clientes").select("whatsapp").eq("id", id.data).maybeSingle();
  if (errorCliente || !cliente) return { error: "No se encontró el cliente.", clienteId: id.data };
  const numero = normalizarWhatsApp(cliente.whatsapp ?? "");
  if (!numero) return { error: "Falta el WhatsApp del cliente (o no es válido).", clienteId: id.data };

  const { data, error } = await supabase.rpc("registrar_recordatorio", { p_cliente_id: id.data });
  if (error) return { error: mensajeDeBase(error), clienteId: id.data };
  const d = data as { cliente: string; empresa: string; datos_cobro: string | null; mensaje: string | null; autos: (AutoAdeudado & { saldo: unknown })[] };
  const texto = armarMensaje({
    cliente: d.cliente,
    empresa: d.empresa,
    datosCobro: d.datos_cobro,
    plantilla: d.mensaje,
    autos: d.autos.map((a) => ({ ...a, saldo: Number(a.saldo) })),
  });
  redirect(linkWhatsAppA(numero, texto));
}

const datosCliente = z.object({
  id: z.guid(),
  nombre: z.string().trim().min(1, { error: "Escribí el nombre." }).max(120),
  tipo: z.enum(["concesionaria", "particular", "coleccionista", "otro"]),
  whatsapp: z.string().max(30),
  email: z.union([z.literal(""), z.email({ error: "Revisá el email: no parece válido." })]),
  ciudad: z.string().max(80),
  notas: z.string().max(1000),
  activo: z.boolean(),
});

export async function guardarCliente(_anterior: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const validacion = datosCliente.safeParse({
    id: formData.get("id"),
    nombre: String(formData.get("nombre") ?? ""),
    tipo: formData.get("tipo"),
    whatsapp: String(formData.get("whatsapp") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    ciudad: String(formData.get("ciudad") ?? "").trim(),
    notas: String(formData.get("notas") ?? "").trim(),
    activo: formData.get("activo") === "on",
  });
  if (!validacion.success) return { error: validacion.error.issues[0].message };
  const d = validacion.data;
  const whatsapp = d.whatsapp === "" ? null : normalizarWhatsApp(d.whatsapp);
  if (d.whatsapp !== "" && !whatsapp) return { error: "Revisá el WhatsApp: escribilo con característica, por ejemplo 11 5555-1234." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_cliente", {
    p_id: d.id,
    p_nombre: d.nombre,
    p_tipo: d.tipo,
    p_whatsapp: whatsapp ?? "",
    p_email: d.email,
    p_ciudad: d.ciudad,
    p_notas: d.notas,
    p_activo: d.activo,
  });
  if (error) return { error: mensajeDeBase(error) };
  redirect(`/clientes/${d.id}?guardado=1`);
}

const datosCobro = z.object({
  datos_cobro: z.string().trim().max(500, { error: "Los datos para cobrar son muy largos (hasta 500 letras)." }),
  mensaje: z.string().trim().max(1000, { error: "El mensaje es muy largo (hasta 1000 letras)." }),
});

export async function guardarDatosCobro(_anterior: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const validacion = datosCobro.safeParse({
    datos_cobro: String(formData.get("datos_cobro") ?? ""),
    mensaje: String(formData.get("mensaje") ?? ""),
  });
  if (!validacion.success) return { error: validacion.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_datos_cobro", { p_datos: validacion.data.datos_cobro, p_mensaje: validacion.data.mensaje });
  if (error) return { error: mensajeDeBase(error) };
  redirect("/mas/datos-cobro?guardado=1");
}
