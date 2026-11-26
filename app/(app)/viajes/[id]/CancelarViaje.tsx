"use client";

import { useActionState, useState } from "react";
import { type Anticipo, textoAnticipo, validarCancelacion } from "@/lib/entregas";
import type { Moneda } from "@/lib/formato";
import type { EstadoViaje } from "@/lib/viajes";
import { cancelarViaje, type EstadoFormulario } from "../actions";

const estadoInicial: EstadoFormulario = { error: null };

/**
 * Cancelar un viaje que todavía no salió. Si ya tiene pagos, se elige qué pasa con
 * lo cobrado: queda como seña (cobrado) o a favor del cliente para otro viaje.
 */
export function CancelarViaje({
  viajeId,
  estado,
  cobrado,
  clientes,
}: {
  viajeId: string;
  estado: EstadoViaje;
  cobrado: Partial<Record<Moneda, number>>;
  clientes: string;
}) {
  const [resultado, accion, enviando] = useActionState(cancelarViaje, estadoInicial);
  const [abierto, setAbierto] = useState(false);
  const [anticipo, setAnticipo] = useState<Anticipo | null>(null);
  const [motivo, setMotivo] = useState("");
  const tienePagos = Object.keys(cobrado).length > 0;
  const error = validarCancelacion({ tienePagos, anticipo, motivo });

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="self-end py-2 text-sm font-medium text-red-700">
        Cancelar viaje
      </button>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-3 rounded-xl bg-red-50 p-4">
      <input type="hidden" name="viaje_id" value={viajeId} />
      <input type="hidden" name="desde" value={estado} />
      <input type="hidden" name="anticipo" value={anticipo ?? ""} />
      <p className="text-base font-semibold text-red-950">¿Cancelar el viaje?</p>
      <p className="text-base text-red-900">Sus autos dejan de figurar en lo que te deben. No se puede deshacer.</p>

      {tienePagos && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-medium text-red-950">Ya se cobró parte del viaje. ¿Qué pasa con esa plata?</legend>
          {(["sena", "a_favor"] as const).map((opcion) => (
            <label
              key={opcion}
              className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-red-200 bg-white px-3 py-3 has-[:checked]:border-sky-700 has-[:checked]:bg-sky-50"
            >
              <input type="radio" name="opcion" checked={anticipo === opcion} onChange={() => setAnticipo(opcion)} className="mt-1 h-5 w-5 accent-sky-700" />
              <span className="flex flex-col">
                <span className="text-base font-semibold">{opcion === "sena" ? "Queda como seña" : "Queda a favor del cliente"}</span>
                <span className="text-sm text-slate-600">{textoAnticipo(opcion, cobrado, clientes)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm text-red-950">Motivo {tienePagos ? "(obligatorio)" : "(opcional)"}</span>
        <input
          name="motivo"
          value={motivo}
          maxLength={300}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej.: el cliente desistió"
          className="h-12 rounded-lg border border-red-200 bg-white px-3 text-base"
        />
      </label>

      {resultado.error && (
        <p role="alert" className="rounded-xl bg-white px-4 py-3 text-base text-red-800">
          {resultado.error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="h-12 rounded-xl border border-slate-300 bg-white text-base font-medium">
          No
        </button>
        <button type="submit" disabled={enviando || error !== null} className="h-12 rounded-xl bg-red-700 text-base font-semibold text-white disabled:bg-red-300">
          {enviando ? "Cancelando…" : "Sí, cancelar"}
        </button>
      </div>
    </form>
  );
}
