"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ZonaComprobante } from "@/components/ZonaComprobante";
import { adjuntarComprobante, type EstadoFormulario } from "../../../actions";

const estadoInicial: EstadoFormulario = { error: null };

export function FormularioAdjuntar({ id }: { id: string }) {
  const [estado, accion, enviando] = useActionState(adjuntarComprobante, estadoInicial);
  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <ZonaComprobante />
      {estado.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:opacity-60"
      >
        {enviando ? "Guardando…" : "Guardar comprobante"}
      </button>
      <Link href="/cobros" className="text-center text-base font-medium text-slate-600">
        Cancelar
      </Link>
    </form>
  );
}
