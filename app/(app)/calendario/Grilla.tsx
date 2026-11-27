// Grilla del calendario (computadora): una fila por unidad, una columna por día.
// Las barras son links (viaje → su detalle; bloqueo → anularlo). Un día libre abre
// "Nuevo viaje" con esa unidad y esa fecha ya elegidas.
import Link from "next/link";
import { armarFila, type BloqueoCal, etiquetaDia, type ViajeCal } from "@/lib/calendario";
import { formatearFecha } from "@/lib/formato";
import type { EstadoViaje } from "@/lib/viajes";
import { NOMBRE_ESTADO } from "@/lib/viajes";

const COLOR: Record<EstadoViaje, string> = {
  programado: "bg-slate-100 border-slate-400 text-slate-900",
  reprogramado: "bg-violet-100 border-violet-500 text-violet-950",
  en_retiro: "bg-amber-100 border-amber-500 text-amber-950",
  en_viaje: "bg-sky-100 border-sky-600 text-sky-950",
  entregado: "bg-emerald-100 border-emerald-600 text-emerald-950",
  cerrado: "bg-slate-50 border-slate-300 text-slate-600",
  cancelado: "bg-red-50 border-red-300 text-red-900",
};
const RAYADO = { backgroundImage: "repeating-linear-gradient(135deg, #e2e8f0 0 6px, #f8fafc 6px 12px)" };
const ALTO = 34;

export function Grilla({
  dias,
  hoy,
  unidades,
  viajes,
  bloqueos,
}: {
  dias: string[];
  hoy: string;
  unidades: { id: string; nombre: string }[];
  viajes: ViajeCal[];
  bloqueos: BloqueoCal[];
}) {
  const n = dias.length;
  const pct = (i: number) => `${(i / n) * 100}%`;
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      {/* Encabezado: días */}
      <div className="flex border-b border-slate-200">
        <div className="w-32 shrink-0" />
        <div className="flex min-w-0 flex-1">
          {dias.map((d) => {
            const e = etiquetaDia(d);
            return (
              <div key={d} className={`flex-1 py-2 text-center text-xs ${d === hoy ? "bg-sky-700 font-semibold text-white" : e.finDeSemana ? "bg-slate-50 text-slate-500" : "text-slate-600"}`}>
                <span className="block">{e.semana}</span>
                <span className="block text-sm font-semibold">{e.numero}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* Filas: unidades */}
      {unidades.map((u) => {
        const fila = armarFila(u.id, dias, viajes, bloqueos);
        return (
          <div key={u.id} className="flex border-b border-slate-100 last:border-0" aria-label={`Agenda de ${u.nombre}`} role="group">
            <div className="flex w-32 shrink-0 items-center px-3 text-sm font-semibold">{u.nombre}</div>
            <div className="relative min-w-0 flex-1" style={{ height: fila.carriles * ALTO + 8 }}>
              {/* Fondo: un link por día libre */}
              <div className="absolute inset-0 flex">
                {dias.map((d) => (
                  <Link
                    key={d}
                    href={`/viajes/nuevo?unidad=${u.id}&fecha=${d}`}
                    title={`Cargar un viaje de ${u.nombre} el ${formatearFecha(d)}`}
                    aria-label={`Nuevo viaje ${u.nombre} ${formatearFecha(d)}`}
                    className={`flex-1 border-l border-slate-100 hover:bg-sky-50 ${d === hoy ? "bg-sky-50/70" : etiquetaDia(d).finDeSemana ? "bg-slate-50" : ""}`}
                  />
                ))}
              </div>
              {/* Barras */}
              {fila.segmentos.map((s) => {
                const titulo =
                  s.tipo === "viaje"
                    ? `${s.etiqueta} · ${s.detalle} · ${NOMBRE_ESTADO[s.viaje!.estado]} · ${s.viaje!.autos} ${s.viaje!.autos === 1 ? "auto" : "autos"}${s.sinLlegada ? " · sin llegada estimada" : ""}${s.choca ? " · CHOQUE" : ""}`
                    : `${s.etiqueta} del ${formatearFecha(s.bloqueo!.desde)} al ${formatearFecha(s.bloqueo!.hasta)}${s.detalle ? ` · ${s.detalle}` : ""}${s.choca ? " · CHOQUE" : ""}`;
                return (
                  <Link
                    key={s.id}
                    href={s.tipo === "viaje" ? `/viajes/${s.id}` : `/calendario/bloqueos/${s.id}`}
                    title={titulo}
                    aria-label={titulo}
                    className={`absolute z-10 flex items-center gap-1 overflow-hidden border px-1.5 text-xs font-medium whitespace-nowrap ${
                      s.tipo === "viaje" ? COLOR[s.viaje!.estado] : "border-slate-400 text-slate-800"
                    } ${s.cortadoAntes ? "rounded-l-none border-l-0" : "rounded-l-md"} ${s.cortadoDespues ? "rounded-r-none border-r-0" : "rounded-r-md"} ${
                      s.choca ? "ring-2 ring-red-600 ring-inset" : ""
                    }`}
                    style={{
                      left: `calc(${pct(s.inicio)} + 2px)`,
                      width: `calc(${pct(s.fin - s.inicio + 1)} - 4px)`,
                      top: s.carril * ALTO + 4,
                      height: ALTO - 6,
                      ...(s.tipo === "bloqueo" ? RAYADO : {}),
                    }}
                  >
                    {s.sinLlegada && <span aria-hidden="true">⚠</span>}
                    <span className="font-semibold">{s.etiqueta}</span>
                    <span className="truncate font-normal">{s.detalle}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
