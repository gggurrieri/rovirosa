import { formatearFecha } from "@/lib/formato";
import type { ViajePendiente } from "@/lib/datos-configuracion";

/** "Tiene 2 viajes por delante: #13 (01/12), #15 (03/12)". */
export function textoProximos(viajes: ViajePendiente[]): string | null {
  if (viajes.length === 0) return null;
  const lista = viajes.slice(0, 4).map((v) => `#${v.numero} (${formatearFecha(v.fecha_salida).slice(0, 5)})`).join(", ");
  return `${viajes.length} ${viajes.length === 1 ? "viaje" : "viajes"} por delante: ${lista}${viajes.length > 4 ? "…" : ""}`;
}
