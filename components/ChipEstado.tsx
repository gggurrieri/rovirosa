import type { EstadoViaje } from "@/lib/viajes";

const ESTADOS: Record<EstadoViaje, { texto: string; clases: string }> = {
  programado: { texto: "Programado", clases: "bg-slate-200 text-slate-800" },
  en_retiro: { texto: "En retiro", clases: "bg-amber-100 text-amber-900" },
  en_viaje: { texto: "En viaje", clases: "bg-sky-100 text-sky-900" },
  entregado: { texto: "Entregado", clases: "bg-emerald-100 text-emerald-900" },
  cerrado: { texto: "Cerrado", clases: "bg-slate-100 text-slate-600" },
  reprogramado: { texto: "Reprogramado", clases: "bg-violet-100 text-violet-900" },
  cancelado: { texto: "Cancelado", clases: "bg-red-100 text-red-900" },
};

export function ChipEstado({ estado }: { estado: EstadoViaje }) {
  const { texto, clases } = ESTADOS[estado] ?? { texto: estado, clases: "bg-slate-200 text-slate-800" };
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${clases}`}>{texto}</span>
  );
}
