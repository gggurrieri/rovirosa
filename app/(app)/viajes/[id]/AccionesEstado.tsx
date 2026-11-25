"use client";

import { useActionState, useState } from "react";
import { estadoAnterior, NOMBRE_ESTADO, puedeCancelar, siguienteEstado, textoAvanzar, type EstadoViaje } from "@/lib/viajes";
import { cambiarEstado, type EstadoFormulario } from "../actions";

const estadoInicial: EstadoFormulario = { error: null };

export function AccionesEstado({
  viajeId,
  estado,
  salida,
  hoy,
  tienePagos,
}: {
  viajeId: string;
  estado: EstadoViaje;
  salida: string;
  hoy: string;
  tienePagos: boolean;
}) {
  const [resultado, accion, enviando] = useActionState(cambiarEstado, estadoInicial);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
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
              <span className="text-base font-semibold text-slate-700">¿Cuándo se entregó?</span>
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
        {puedeCancelar(estado, tienePagos) && !confirmandoCancelar && (
          <button type="button" onClick={() => setConfirmandoCancelar(true)} className="py-2 text-sm font-medium text-red-700">
            Cancelar viaje
          </button>
        )}
      </div>

      {confirmandoCancelar && (
        <form action={accion} className="flex flex-col gap-3 rounded-xl bg-red-50 p-4">
          {ocultos("cancelado")}
          <p className="text-base text-red-900">
            ¿Cancelar el viaje? Sus autos dejan de figurar en lo que te deben. No se puede deshacer.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmandoCancelar(false)} className="h-12 rounded-xl border border-slate-300 bg-white text-base font-medium">
              No
            </button>
            <button type="submit" disabled={enviando} className="h-12 rounded-xl bg-red-700 text-base font-semibold text-white">
              Sí, cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
