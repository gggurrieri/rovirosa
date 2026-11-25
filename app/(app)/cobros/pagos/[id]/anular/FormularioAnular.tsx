"use client";

import Link from "next/link";
import { useActionState } from "react";
import { anularPago, type EstadoFormulario } from "../../../actions";

const estadoInicial: EstadoFormulario = { error: null };

export function FormularioAnular({ id }: { id: string }) {
  const [estado, accion, enviando] = useActionState(anularPago, estadoInicial);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-2">
        <span className="text-base font-semibold text-slate-700">¿Por qué lo anulás?</span>
        <textarea
          name="motivo"
          required
          minLength={3}
          maxLength={300}
          rows={3}
          placeholder="Ej.: lo cargué dos veces"
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200"
        />
      </label>

      {estado.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="h-14 rounded-xl bg-red-700 text-lg font-semibold text-white active:bg-red-800 disabled:opacity-60"
      >
        {enviando ? "Anulando…" : "Anular pago"}
      </button>
      <Link href="/cobros" className="text-center text-base font-medium text-slate-600">
        Cancelar
      </Link>
    </form>
  );
}
