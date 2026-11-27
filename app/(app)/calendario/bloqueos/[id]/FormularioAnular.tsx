"use client";

import { useActionState } from "react";
import { anularBloqueo, type Estado } from "../../actions";

export function FormularioAnular({ id }: { id: string }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(anularBloqueo, { error: null });
  return (
    <form action={accion} className="flex flex-col gap-3 rounded-2xl bg-red-50 p-5">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1">
        <span className="text-base font-medium text-red-950">¿Por qué se anula?</span>
        <input name="motivo" required maxLength={300} placeholder="Ej.: el service se pasó a enero" className="h-12 rounded-lg border border-red-200 bg-white px-3 text-base" />
      </label>
      {estado.error && (
        <p role="alert" className="text-base text-red-800">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={enviando} className="h-12 rounded-xl bg-red-700 text-base font-semibold text-white disabled:opacity-60">
        {enviando ? "Anulando…" : "Anular bloqueo"}
      </button>
    </form>
  );
}
