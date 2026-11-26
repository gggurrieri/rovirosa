"use client";

import { useActionState } from "react";
import type { ClienteResumen } from "@/lib/datos-clientes";
import { type EstadoAccion, guardarCliente } from "../actions";

const campo = "h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base";
const TIPOS = [
  ["particular", "Particular"],
  ["concesionaria", "Concesionaria"],
  ["coleccionista", "Coleccionista"],
  ["otro", "Otro"],
] as const;

export function FormularioCliente({ cliente }: { cliente: ClienteResumen }) {
  const [estado, accion, enviando] = useActionState<EstadoAccion, FormData>(guardarCliente, { error: null });
  return (
    <form action={accion} id="contacto" className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm lg:p-5">
      <h2 className="text-lg font-semibold">Datos de contacto</h2>
      <input type="hidden" name="id" value={cliente.id} />
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Nombre</span>
          <input name="nombre" required maxLength={120} defaultValue={cliente.nombre} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">WhatsApp</span>
          <input name="whatsapp" inputMode="tel" defaultValue={cliente.whatsapp ?? ""} placeholder="11 5555-1234" className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Tipo</span>
          <select name="tipo" defaultValue={cliente.tipo} className={campo}>
            {TIPOS.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Ciudad</span>
          <input name="ciudad" maxLength={80} defaultValue={cliente.ciudad ?? ""} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Email</span>
          <input name="email" type="email" defaultValue={cliente.email ?? ""} className={campo} />
        </label>
        <label className="flex items-center gap-3 self-end pb-3">
          <input name="activo" type="checkbox" defaultChecked={cliente.activo} className="h-5 w-5 accent-sky-700" />
          <span className="text-base">Cliente activo</span>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-600">Notas</span>
        <textarea name="notas" maxLength={1000} rows={2} defaultValue={cliente.notas ?? ""} className="rounded-lg border border-slate-300 px-3 py-2 text-base" />
      </label>
      {estado.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={enviando} className="h-12 rounded-xl bg-sky-700 text-base font-semibold text-white active:bg-sky-800 disabled:opacity-60 lg:w-48 lg:self-end">
        {enviando ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
