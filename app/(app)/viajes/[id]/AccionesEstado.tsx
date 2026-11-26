"use client";

import { useActionState } from "react";
import { estadoAnterior, NOMBRE_ESTADO, siguienteEstado, textoAvanzar, type EstadoViaje } from "@/lib/viajes";
import { cambiarEstado, type EstadoFormulario } from "../actions";

const estadoInicial: EstadoFormulario = { error: null };

export function AccionesEstado({
  viajeId,
  estado,
  salida,
  hoy,
  entregaParcial,
}: {
  viajeId: string;
  estado: EstadoViaje;
  salida: string;
  hoy: string;
  /** Con algún auto ya entregado, "Marcar entregado" completa solo los que faltan. */
  entregaParcial: boolean;
}) {
  const [resultado, accion, enviando] = useActionState(cambiarEstado, estadoInicial);
  const siguiente = siguienteEstado(estado);
  const anterior = estadoAnterior(estado);

  const ocultos = (hacia: EstadoViaje) => (
    <>
      <input type="hidden" name="viaje_id" value={viajeId} />
      <input type="hidden" name="desde" value={estado} />
      <input type="hidden" name="hacia" value={hacia} />
    </>
  );

  return (
    <section className="flex flex-col gap-3">
      {siguiente && (
        <form action={accion} className="flex flex-col gap-3">
          {ocultos(siguiente)}
          {siguiente === "entregado" && (
            <label className="flex flex-col gap-2">
              <span className="text-base font-semibold text-slate-700">
                {entregaParcial ? "¿Cuándo se entregaron los autos que faltan?" : "¿Cuándo se entregó?"}
              </span>
              <input
                type="date"
                name="fecha_entrega"
                defaultValue={hoy < salida ? salida : hoy}
                min={salida}
                max={hoy}
                required
                className="h-14 rounded-xl border border-slate-300 bg-white px-4 text-lg"
              />
            </label>
          )}
          <button
            type="submit"
            disabled={enviando}
            className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:opacity-60"
          >
            {enviando ? "Guardando…" : textoAvanzar(estado)}
          </button>
        </form>
      )}

      {resultado.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">
          {resultado.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {anterior && (
          <form action={accion}>
            {ocultos(anterior)}
            <button type="submit" disabled={enviando} className="py-2 text-sm font-medium text-slate-600 underline">
              Deshacer: volver a {NOMBRE_ESTADO[anterior]}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
