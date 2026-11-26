"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type EstadoAccion, recordar } from "@/app/(app)/clientes/actions";

/** "Recordar por WhatsApp": registra el recordatorio y abre WhatsApp con el mensaje listo. */
export function BotonRecordar({ clienteId, grande = false }: { clienteId: string; grande?: boolean }) {
  const [estado, accion, enviando] = useActionState<EstadoAccion, FormData>(recordar, { error: null });
  return (
    <form action={accion} className="flex flex-col gap-1">
      <input type="hidden" name="cliente_id" value={clienteId} />
      <button
        type="submit"
        disabled={enviando}
        className={
          grande
            ? "flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-lg font-semibold text-white active:bg-emerald-800 disabled:opacity-60"
            : "flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-emerald-800 disabled:opacity-60"
        }
      >
        {enviando ? "Abriendo WhatsApp…" : "📲 Recordar por WhatsApp"}
      </button>
      {estado.error && (
        <p role="alert" className="text-sm text-red-700">
          {estado.error}{" "}
          {estado.clienteId && (
            <Link href={`/clientes/${estado.clienteId}#contacto`} className="font-medium underline">
              Cargarlo en la ficha
            </Link>
          )}
        </p>
      )}
    </form>
  );
}
