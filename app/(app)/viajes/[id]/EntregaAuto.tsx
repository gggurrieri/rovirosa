"use client";

import { useActionState, useState } from "react";
import { validarFechaEntrega } from "@/lib/entregas";
import { formatearFecha } from "@/lib/formato";
import { deshacerEntrega, entregarAuto, type EstadoFormulario } from "../actions";

const estadoInicial: EstadoFormulario = { error: null };

/** Entregar un auto con su fecha, o deshacer su entrega. Botón grande: lo usa Rodrigo en la ruta. */
export function EntregaAuto({
  viajeId,
  itemId,
  nombre,
  fechaEntrega,
  salida,
  hoy,
  puedeEntregar,
  puedeDeshacer,
}: {
  viajeId: string;
  itemId: string;
  nombre: string;
  fechaEntrega: string | null;
  salida: string;
  hoy: string;
  puedeEntregar: boolean;
  puedeDeshacer: boolean;
}) {
  const [entrega, entregar, entregando] = useActionState(entregarAuto, estadoInicial);
  const [deshecho, deshacer, deshaciendo] = useActionState(deshacerEntrega, estadoInicial);
  const [fecha, setFecha] = useState(hoy < salida ? salida : hoy);
  const error = entrega.error ?? deshecho.error;

  if (fechaEntrega) {
    return (
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-emerald-800">✓ Entregado el {formatearFecha(fechaEntrega)}</p>
        {puedeDeshacer && (
          <form action={deshacer}>
            <input type="hidden" name="viaje_id" value={viajeId} />
            <input type="hidden" name="item_id" value={itemId} />
            <button type="submit" disabled={deshaciendo} className="min-h-11 text-sm font-medium text-slate-600 underline">
              Deshacer entrega
            </button>
          </form>
        )}
        {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
      </div>
    );
  }
  if (!puedeEntregar) return null;

  const problema = validarFechaEntrega(fecha, salida, hoy);
  return (
    <form action={entregar} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="viaje_id" value={viajeId} />
      <input type="hidden" name="item_id" value={itemId} />
      <div className="flex items-stretch gap-2">
        <input
          type="date"
          name="fecha"
          aria-label={`Fecha de entrega del ${nombre}`}
          value={fecha}
          min={salida}
          max={hoy}
          onChange={(e) => setFecha(e.target.value)}
          className="h-12 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base"
        />
        <button
          type="submit"
          disabled={entregando || problema !== null}
          aria-label={`Entregado: ${nombre}`}
          className="h-12 shrink-0 rounded-lg bg-emerald-700 px-4 text-base font-semibold text-white active:bg-emerald-800 disabled:bg-slate-300"
        >
          {entregando ? "…" : "Entregado"}
        </button>
      </div>
      {(problema || error) && <p role="alert" className="text-sm text-red-700">{problema ?? error}</p>}
    </form>
  );
}
