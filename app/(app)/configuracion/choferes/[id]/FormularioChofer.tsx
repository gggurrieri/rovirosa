"use client";

import { useActionState, useState } from "react";
import type { ChoferConfig } from "@/lib/datos-configuracion";
import { type Estado, guardarChofer } from "../../actions";
import { campo, ErrorForm } from "../../componentes";

export function FormularioChofer({ chofer, proximos }: { chofer: ChoferConfig | null; proximos: string | null }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(guardarChofer, { error: null });
  const [activo, setActivo] = useState(chofer?.activo ?? true);
  return (
    <form action={accion} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <input type="hidden" name="id" value={chofer?.id ?? "nueva"} />
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-600">Nombre</span>
        <input name="nombre" required maxLength={80} defaultValue={chofer?.nombre} className={campo} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-600">Teléfono</span>
        <input name="telefono" inputMode="tel" maxLength={30} defaultValue={chofer?.telefono ?? ""} className={campo} />
      </label>
      <label className="flex items-center gap-3">
        <input name="activo" type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-5 w-5 accent-sky-700" />
        <span className="text-base">Activo (se puede asignar a viajes nuevos)</span>
      </label>
      {!activo && chofer && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900">
          ⚠️ Deja de ser el chofer habitual de su unidad.{proximos && ` Tiene ${proximos}: reasignalos si hace falta.`}
        </p>
      )}
      <ErrorForm error={estado.error} />
      <button type="submit" disabled={enviando} className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:opacity-60">
        {enviando ? "Guardando…" : "Guardar chofer"}
      </button>
    </form>
  );
}
