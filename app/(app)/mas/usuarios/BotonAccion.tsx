"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "./actions";

/** Botón chico que corre una acción del servidor, con confirmación y su error al lado. */
export function BotonAccion({
  accion,
  campos,
  texto,
  confirmar,
  peligro = false,
}: {
  accion: (anterior: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  campos: Record<string, string>;
  texto: string;
  confirmar: string;
  peligro?: boolean;
}) {
  const [estado, ejecutar, enviando] = useActionState(accion, { error: null });
  return (
    <form
      action={ejecutar}
      onSubmit={(e) => {
        if (!window.confirm(confirmar)) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      <button
        type="submit"
        disabled={enviando}
        className={`min-h-11 px-2 text-sm font-medium ${peligro ? "text-red-700" : "text-sky-700"} disabled:text-slate-400`}
      >
        {enviando ? "…" : texto}
      </button>
      {estado.error && (
        <p role="alert" className="text-sm text-red-700">
          {estado.error}
        </p>
      )}
    </form>
  );
}
