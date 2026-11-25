// Subida y lectura de comprobantes en Supabase Storage (solo del lado del servidor).

import { rutaComprobante, validarComprobante } from "./comprobante";
import { crearClienteServidor } from "./supabase/server";

/** Minutos que dura un link para ver un comprobante. */
export const MINUTOS_LINK = 5;

/** Lee el comprobante del formulario. null si no se adjuntó ninguno. */
export function comprobanteDelFormulario(formData: FormData): File | null {
  const archivo = formData.get("comprobante");
  return archivo instanceof File && archivo.size > 0 ? archivo : null;
}

/**
 * Sube el comprobante a la carpeta de la empresa y del pago. Si ya estaba subido
 * (reintento del mismo formulario), reutiliza el mismo archivo.
 */
export async function subirComprobante(
  empresaId: string,
  pagoId: string,
  archivo: File,
): Promise<{ ok: true; ruta: string } | { ok: false; error: string }> {
  const problema = validarComprobante({ tipo: archivo.type, tamano: archivo.size });
  if (problema) return { ok: false, error: problema };

  const ruta = rutaComprobante(empresaId, pagoId, archivo.type);
  const supabase = await crearClienteServidor();
  const { error } = await supabase.storage
    .from("comprobantes")
    .upload(ruta, await archivo.arrayBuffer(), { contentType: archivo.type, upsert: false });

  if (error && !/exist|duplicate/i.test(error.message)) {
    return { ok: false, error: "No pudimos subir el comprobante. Revisá la conexión y probá de nuevo." };
  }
  return { ok: true, ruta };
}

/** Link temporal para ver un comprobante (vence a los pocos minutos). */
export async function linkComprobante(ruta: string): Promise<string | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(ruta, MINUTOS_LINK * 60);
  return error ? null : data.signedUrl;
}
