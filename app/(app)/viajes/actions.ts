"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { existeViaje, obtenerOpcionesViaje, obtenerViaje, viajeOriginal } from "@/lib/datos-viajes";
import { armarCambios } from "@/lib/edicion";
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

const auto = z.object({
  cliente_id: z.guid().nullable(),
  cliente_nuevo: z.object({ nombre: texto, whatsapp: z.string().max(40) }).nullable(),
  vehiculo_id: z.guid().nullable(),
  marca: z.string().max(60),
  modelo: z.string().max(80),
  precio: z.string().max(40),
});
const datosEdicion = z.object({
  viaje_id: z.guid(),
  version: z.string().max(64),
  confirmarCero: z.boolean(),
  fecha_salida: z.string().max(10),
  fecha_llegada: z.string().max(10),
  origen: texto,
  destino: texto,
  unidad_id: z.guid().nullable(),
  chofer_id: z.guid().nullable(),
  notas: z.string().max(1000),
  precios: z.record(z.guid(), z.string().max(40)),
  quitar: z.array(z.guid()).max(20),
  anticipos: z.record(z.guid(), z.enum(["sena", "a_favor"])).optional(),
  agregar: z.array(auto).max(20),
  motivo: z.string().max(300),
});

export async function editarViaje(_anterior: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(String(formData.get("edicion") ?? ""));
  } catch {
    return { error: "No pudimos leer el formulario. Probá de nuevo." };
  }
  const validacion = datosEdicion.safeParse(crudo);
  if (!validacion.success) return { error: "Revisá los datos del viaje y probá de nuevo." };
  const d = validacion.data;

  // Los cambios se arman contra el viaje como está AHORA en la base (lo cobrado,
  // el estado), no contra lo que tenía la pantalla. La unidad sale de la base.
  const armar = async () => {
    const [viaje, { unidades }] = await Promise.all([obtenerViaje(d.viaje_id), obtenerOpcionesViaje()]);
    if (!viaje) return null;
    const unidad = unidades.find((u) => u.id === d.unidad_id);
    return armarCambios(viajeOriginal(viaje), {
      ...d,
      capacidad: unidad?.capacidad_autos ?? null,
      unidad_nombre: unidad?.nombre ?? "La unidad",
    });
  };
  const armado = await armar();
  if (!armado) return { error: "No se encontró el viaje." };
  if (!armado.ok) return { error: armado.error };
  if (armado.cantidad === 0) redirect(`/viajes/${d.viaje_id}`);
  if (armado.autosEnCero > 0 && !d.confirmarCero) return { error: "Hay autos con precio $ 0. Confirmalo antes de guardar." };

  const { motivo, ...cambios } = armado.cambios;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("editar_viaje", {
    p_viaje_id: d.viaje_id,
    p_version: d.version,
    p_cambios: cambios,
    p_motivo: motivo ?? null,
  });
  if (error) {
    // Reintento de un guardado que ya entró (doble toque o mala señal): el viaje ya
    // quedó como se quería y no hay nada para cambiar. Es un éxito.
    if (error.message.startsWith("El viaje cambió mientras lo editabas")) {
      const otraVez = await armar();
      if (otraVez?.ok && otraVez.cantidad === 0) redirect(`/viajes/${d.viaje_id}?editado=${armado.cantidad}`);
    }
    return { error: mensajeDeBase(error) };
  }
  redirect(`/viajes/${d.viaje_id}?editado=${armado.cantidad}`);
}

const datosCancelar = z.object({
  viaje_id: z.guid(),
  desde: z.string().max(20),
  anticipo: z.enum(["sena", "a_favor"]).nullable(),
  motivo: z.string().max(300),
});

export async function cancelarViaje(_anterior: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const validacion = datosCancelar.safeParse({
    viaje_id: formData.get("viaje_id"),
    desde: formData.get("desde"),
    anticipo: formData.get("anticipo") || null,
    motivo: String(formData.get("motivo") ?? ""),
  });
  if (!validacion.success) return { error: "Revisá los datos y probá de nuevo." };
  const d = validacion.data;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cancelar_viaje", {
    p_viaje_id: d.viaje_id,
    p_desde: d.desde,
    p_anticipo: d.anticipo,
    p_motivo: d.motivo.trim() || null,
  });
  if (error) return { error: mensajeDeBase(error) };
  redirect(`/viajes/${d.viaje_id}?estado=cancelado`);
}

const datosEntrega = z.object({
  viaje_id: z.guid(),
  item_id: z.guid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function entregarAuto(_anterior: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const validacion = datosEntrega.safeParse({
    viaje_id: formData.get("viaje_id"),
    item_id: formData.get("item_id"),
    fecha: formData.get("fecha") || null,
  });
  if (!validacion.success) return { error: "Revisá la fecha de entrega." };
  const d = validacion.data;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("entregar_auto", { p_item_id: d.item_id, p_fecha: d.fecha });
  if (error) return { error: mensajeDeBase(error) };
  redirect(`/viajes/${d.viaje_id}?${data === "entregado" ? "estado=entregado" : "entregado=1"}`);
}

export async function deshacerEntrega(_anterior: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const validacion = datosEntrega.safeParse({ viaje_id: formData.get("viaje_id"), item_id: formData.get("item_id"), fecha: null });
  if (!validacion.success) return { error: "No se encontró el auto." };
  const d = validacion.data;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("deshacer_entrega", { p_item_id: d.item_id });
  if (error) return { error: mensajeDeBase(error) };
  redirect(`/viajes/${d.viaje_id}?entrega_deshecha=1`);
}
