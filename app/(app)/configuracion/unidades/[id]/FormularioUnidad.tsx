"use client";

import { useActionState, useState } from "react";
import type { UnidadConfig } from "@/lib/datos-configuracion";
import { type Estado, guardarUnidad } from "../../actions";
import { campo, ErrorForm } from "../../componentes";

export function FormularioUnidad({ unidad, choferes, proximos }: { unidad: UnidadConfig | null; choferes: { id: string; nombre: string }[]; proximos: string | null }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(guardarUnidad, { error: null });
  const [activa, setActiva] = useState(unidad?.activa ?? true);
  return (
    <form action={accion} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <input type="hidden" name="id" value={unidad?.id ?? "nueva"} />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Nombre</span>
          <input name="nombre" required maxLength={60} defaultValue={unidad?.nombre} placeholder="Mosquito 3" className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Patente</span>
          <input name="patente" maxLength={12} defaultValue={unidad?.patente ?? ""} className={`${campo} uppercase`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Tipo</span>
          <select name="tipo" defaultValue={unidad?.tipo ?? "mosquito"} className={campo}>
            <option value="mosquito">Mosquito</option>
            <option value="camioneta_carro">Camioneta con carro</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Capacidad (autos)</span>
          <input name="capacidad" type="number" inputMode="numeric" min={1} max={20} required defaultValue={unidad?.capacidad_autos ?? 3} className={campo} />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-sm text-slate-600">Chofer habitual</span>
          <select name="chofer" defaultValue={unidad?.chofer_habitual_id ?? ""} className={campo}>
            <option value="">Sin chofer habitual</option>
            {choferes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-3">
        <input name="activa" type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} className="h-5 w-5 accent-sky-700" />
        <span className="text-base">Activa (se puede elegir en viajes nuevos)</span>
      </label>
      {!activa && proximos && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900">⚠️ Tiene {proximos}. Esos viajes no cambian: reasignalos si hace falta.</p>
      )}
      <ErrorForm error={estado.error} />
      <button type="submit" disabled={enviando} className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:opacity-60">
        {enviando ? "Guardando…" : "Guardar unidad"}
      </button>
    </form>
  );
}
