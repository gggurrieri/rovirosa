"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { parsearPlata, validarAplicaciones } from "@/lib/cobros";
import { existePago, obtenerPendientes } from "@/lib/datos-cobros";
import { hoyEnArgentina } from "@/lib/formato";
import { mensajeDeBase } from "@/lib/errores";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoFormulario = { error: string | null };


const datosPago = z.object({
  id: z.guid(),
  cliente_id: z.guid({ error: "Elegí el cliente que pagó." }),
  moneda: z.enum(["ARS", "USD"]),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Revisá la fecha del pago." }),
  medio: z.enum(["transferencia", "efectivo", "cheque", "otro"]),
  titular: z.string().trim().max(120),
  notas: z.string().trim().max(500),
  aplicaciones: z.array(z.object({ item_id: z.guid(), monto_centavos: z.number().int().positive() })),
});

export async function registrarPago(_anterior: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const monto = parsearPlata(String(formData.get("monto") ?? ""));
  if (!monto.ok) return { error: monto.error };

  let aplicaciones: unknown;
  try {
    aplicaciones = JSON.parse(String(formData.get("aplicaciones") ?? "[]"));
  } catch {
    return { error: "No pudimos leer a qué autos aplicar el pago. Probá de nuevo." };
  }

  const validacion = datosPago.safeParse({
    id: formData.get("id"),
    cliente_id: formData.get("cliente_id"),
    moneda: formData.get("moneda"),
    fecha: formData.get("fecha"),
    medio: formData.get("medio"),
    titular: formData.get("titular") ?? "",
    notas: formData.get("notas") ?? "",
    aplicaciones,
  });
  if (!validacion.success) return { error: validacion.error.issues[0].message };
  const pago = validacion.data;

  if (pago.fecha > hoyEnArgentina()) return { error: "La fecha del pago no puede ser posterior a hoy." };

  // Reintento de un pago que ya se guardó (doble toque, o la respuesta se perdió por
  // mala señal): es un éxito, no un error. Se chequea antes de validar saldos, que
  // ya cambiaron por el primer envío.
  if (await existePago(pago.id)) redirect(`/cobros?registrado=${pago.id}`);

  // Se valida contra los saldos de este momento, no contra lo que vio el formulario.
  const pendientes = (await obtenerPendientes()).filter((i) => i.cliente_id === pago.cliente_id);
  const error = validarAplicaciones(pendientes, monto.centavos, pago.moneda, pago.aplicaciones);
  if (error) return { error };

  const supabase = await crearClienteServidor();
  const { error: errorBase } = await supabase.rpc("registrar_pago", {
    p_id: pago.id,
    p_cliente_id: pago.cliente_id,
    p_fecha: pago.fecha,
    p_monto_centavos: monto.centavos,
    p_moneda: pago.moneda,
    p_medio: pago.medio,
    p_titular: pago.titular,
    p_notas: pago.notas,
    p_aplicaciones: pago.aplicaciones,
  });
  if (errorBase) return { error: mensajeDeBase(errorBase) };

  redirect(`/cobros?registrado=${pago.id}`);
}

const datosAnulacion = z.object({
  id: z.guid(),
  motivo: z.string().trim().min(3, { error: "Escribí el motivo de la anulación." }).max(300),
});

export async function anularPago(_anterior: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const validacion = datosAnulacion.safeParse({ id: formData.get("id"), motivo: formData.get("motivo") ?? "" });
  if (!validacion.success) return { error: validacion.error.issues[0].message };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_pago", {
    p_pago_id: validacion.data.id,
    p_motivo: validacion.data.motivo,
  });
  if (error) return { error: mensajeDeBase(error) };

  redirect(`/cobros?anulado=${validacion.data.id}`);
}
