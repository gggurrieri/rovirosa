"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { existeViaje, obtenerOpcionesViaje } from "@/lib/datos-viajes";
import { mensajeDeBase } from "@/lib/errores";
import { crearClienteServidor } from "@/lib/supabase/server";
import { armarViaje } from "@/lib/viajes";

export type EstadoFormulario = { error: string | null };


const texto = z.string().max(200);
const datosViaje = z.object({
  id: z.guid(),
  confirmarCero: z.boolean(),
  origen: texto,
  destino: texto,
  tarifa_id: z.guid().nullable(),
  moneda: z.enum(["ARS", "USD"]),
  fecha_salida: z.string(),
  fecha_llegada: z.string().nullable(),
  unidad_id: z.guid().nullable(),
  chofer_id: z.guid().nullable(),
  notas: z.string().max(1000),
  autos: z
    .array(
      z.object({
        cliente_id: z.guid().nullable(),
        cliente_nuevo: z.object({ nombre: texto, whatsapp: z.string().max(40) }).nullable(),
        vehiculo_id: z.guid().nullable(),
        marca: z.string().max(60),
        modelo: z.string().max(80),
        precio: z.string().max(40),
      }),
    )
    .max(20),
});

export async function crearViaje(_anterior: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(String(formData.get("viaje") ?? ""));
  } catch {
    return { error: "No pudimos leer el formulario. Probá de nuevo." };
  }
  const validacion = datosViaje.safeParse(crudo);
  if (!validacion.success) return { error: "Revisá los datos del viaje y probá de nuevo." };
  const datos = validacion.data;

  // Reintento de un viaje que ya se guardó (doble toque o mala señal): es un éxito.
  if (await existeViaje(datos.id)) redirect(`/viajes/${datos.id}?creado=1`);

  // La capacidad y el nombre de la unidad salen de la base, no del navegador.
  const { unidades } = await obtenerOpcionesViaje();
  const unidad = unidades.find((u) => u.id === datos.unidad_id);
  const armado = armarViaje({
    ...datos,
    unidad_nombre: unidad?.nombre ?? "La unidad",
    capacidad: unidad?.capacidad_autos ?? null,
  });
  if (!armado.ok) return { error: armado.error };
  if (!unidad) return { error: "Elegí la unidad." };
  if (armado.autosEnCero > 0 && !datos.confirmarCero) {
    return { error: "Hay autos con precio $ 0. Confirmalo antes de guardar." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("crear_viaje", {
    p_id: datos.id,
    p_fecha_salida: datos.fecha_salida,
    p_fecha_llegada: datos.fecha_llegada,
    p_origen: datos.origen,
    p_destino: datos.destino,
    p_tarifa_id: datos.tarifa_id,
    p_moneda: datos.moneda,
    p_unidad_id: datos.unidad_id,
    p_chofer_id: datos.chofer_id,
    p_notas: datos.notas,
    p_items: armado.items,
  });
  if (error) return { error: mensajeDeBase(error) };

  redirect(`/viajes/${datos.id}?creado=1`);
}

const datosEstado = z.object({
  viaje_id: z.guid(),
  desde: z.string().max(20),
  hacia: z.string().max(20),
  fecha_entrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function cambiarEstado(_anterior: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const validacion = datosEstado.safeParse({
    viaje_id: formData.get("viaje_id"),
    desde: formData.get("desde"),
    hacia: formData.get("hacia"),
    fecha_entrega: formData.get("fecha_entrega") || null,
  });
  if (!validacion.success) return { error: "Revisá la fecha de entrega." };
  const d = validacion.data;

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cambiar_estado_viaje", {
    p_viaje_id: d.viaje_id,
    p_desde: d.desde,
    p_hacia: d.hacia,
    p_fecha_entrega: d.fecha_entrega,
  });
  if (error) return { error: mensajeDeBase(error) };

  redirect(`/viajes/${d.viaje_id}?estado=${d.hacia}`);
}
