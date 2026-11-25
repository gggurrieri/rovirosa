"use client";

import { useActionState } from "react";
import { accionRapida, type EstadoAccion } from "@/app/(app)/acciones-hoy";

const estadoInicial: EstadoAccion = { error: null };

/** Un botón que cambia el estado de un viaje con un toque. variante "link" para Deshacer. */
export function BotonAccionRapida({
  viajeId,
  numero,
  desde,
  hacia,
  mes,
  texto,
  variante = "principal",
}: {
  viajeId: string;
  numero: number;
  desde: string;
  hacia: string;
  mes: string | null;
  texto: string;
  variante?: "principal" | "link";
}) {
  const [estado, accion, enviando] = useActionState(accionRapida, estadoInicial);
  return (
    <form action={accion} className="flex flex-col gap-2">
      <input type="hidden" name="viaje_id" value={viajeId} />
      <input type="hidden" name="numero" value={numero} />
      <input type="hidden" name="desde" value={desde} />
      <input type="hidden" name="hacia" value={hacia} />
      {mes && <input type="hidden" name="mes" value={mes} />}
      <button
        type="submit"
        disabled={enviando}
        className={
          variante === "principal"
            ? "h-14 w-full rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:opacity-60"
            : "py-1 text-base font-semibold text-sky-800 underline disabled:opacity-60"
        }
      >
        {enviando ? "Guardando…" : texto}
      </button>
      {estado.error && (
        <p role="alert" className="text-sm text-red-700">
          {estado.error}
        </p>
      )}
    </form>
  );
}
