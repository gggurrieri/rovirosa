"use server";

import { obtenerSesion, puedeVerOperacion } from "@/lib/datos";
import { type Lugar, sugerirLugares } from "@/lib/distancias";
import { configORS } from "@/lib/ors";

// Lo ya sugerido no se vuelve a pedir (ahorra cupo entre usuarios del mismo servidor).
const memoriaSugerencias = new Map<string, Lugar[]>();

/** Sugerencias de lugares mientras se escribe un origen o destino (tarifas y viajes). Nunca falla: sin datos, []. */
export async function sugerir(texto: string): Promise<Lugar[]> {
  const { perfil } = await obtenerSesion();
  if (!puedeVerOperacion(perfil)) return [];
  const t = String(texto).trim().slice(0, 80);
  const clave = t.toLowerCase();
  const guardado = memoriaSugerencias.get(clave);
  if (guardado) return guardado;
  const lugares = await sugerirLugares(t, configORS());
  if (lugares.length > 0) {
    if (memoriaSugerencias.size >= 500) memoriaSugerencias.delete(memoriaSugerencias.keys().next().value!);
    memoriaSugerencias.set(clave, lugares);
  }
  return lugares;
}
