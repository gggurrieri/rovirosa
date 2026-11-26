"use client";

import { useActionState, useState } from "react";
import { type EstadoAccion, guardarDatosCobro } from "@/app/(app)/clientes/actions";
import { armarMensaje, MENSAJE_POR_DEFECTO } from "@/lib/recordatorio";

const EJEMPLO = [{ vehiculo: "Audi R8", origen: "Buenos Aires", destino: "Rosario", fecha_entrega: "2026-11-11", moneda: "ARS" as const, saldo: 140000000 }];

export function FormularioDatosCobro({ empresa, datos, mensaje }: { empresa: string; datos: string; mensaje: string }) {
  const [estado, accion, enviando] = useActionState<EstadoAccion, FormData>(guardarDatosCobro, { error: null });
  const [d, setD] = useState(datos);
  const [m, setM] = useState(mensaje);
  const vista = armarMensaje({ cliente: "Juan Pérez", empresa, autos: EJEMPLO, datosCobro: d, plantilla: m });

  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold text-slate-700">Datos para transferir</span>
        <span className="text-sm text-slate-500">Van al final de cada recordatorio. Por ejemplo: alias, CBU y titular.</span>
        <textarea
          name="datos_cobro"
          value={d}
          onChange={(e) => setD(e.target.value)}
          maxLength={500}
          rows={4}
          placeholder={"Alias: rovirosa.cobros\nCBU: 0000000000000000000000\nTitular: Rodrigo Rovirosa"}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
        />
      </label>
      <details className="rounded-xl bg-white p-4 shadow-sm" open={mensaje !== ""}>
        <summary className="cursor-pointer text-base font-medium text-slate-700">Cambiar el texto del mensaje (opcional)</summary>
        <p className="mt-2 text-sm text-slate-500">
          Usá estas marcas y la app las completa: <code>{"{cliente}"}</code>, <code>{"{empresa}"}</code>, <code>{"{total}"}</code>, <code>{"{detalle}"}</code> y{" "}
          <code>{"{datos}"}</code>. Vacío, se usa el mensaje de siempre.
        </p>
        <textarea name="mensaje" value={m} onChange={(e) => setM(e.target.value)} maxLength={1000} rows={4} placeholder={MENSAJE_POR_DEFECTO} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base" />
      </details>
      <section aria-label="Vista previa" className="rounded-2xl bg-emerald-50 p-4">
        <p className="text-sm font-medium text-emerald-900">Así le llega al cliente:</p>
        <p className="mt-2 text-base whitespace-pre-line text-slate-800">{vista}</p>
      </section>
      {estado.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={enviando} className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:opacity-60">
        {enviando ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
