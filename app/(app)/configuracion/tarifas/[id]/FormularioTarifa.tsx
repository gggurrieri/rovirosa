"use client";

import { useActionState } from "react";
import type { TarifaConfig } from "@/lib/datos-configuracion";
import { formatearPlata } from "@/lib/formato";
import { type Estado, guardarTarifa } from "../../actions";
import { campo, ErrorForm } from "../../componentes";

export function FormularioTarifa({ tarifa }: { tarifa: TarifaConfig | null }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(guardarTarifa, { error: null });
  return (
    <form action={accion} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <input type="hidden" name="id" value={tarifa?.id ?? "nueva"} />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Origen</span>
          <input name="origen" required maxLength={80} defaultValue={tarifa?.origen} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Destino</span>
          <input name="destino" required maxLength={80} defaultValue={tarifa?.destino} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Km</span>
          <input name="km" type="number" inputMode="numeric" min={1} required defaultValue={tarifa?.km} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Moneda</span>
          <select name="moneda" defaultValue={tarifa?.moneda ?? "ARS"} className={campo}>
            <option value="ARS">Pesos</option>
            <option value="USD">Dólares</option>
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-sm text-slate-600">Precio por auto</span>
          <input
            name="precio"
            inputMode="decimal"
            required
            defaultValue={tarifa ? formatearPlata(tarifa.precio_base_centavos, tarifa.moneda).replace(/^(US)?\$ /, "") : ""}
            placeholder="950.000"
            className={`${campo} text-lg tabular-nums`}
          />
        </label>
      </div>
      <label className="flex items-center gap-3">
        <input name="activa" type="checkbox" defaultChecked={tarifa?.activa ?? true} className="h-5 w-5 accent-sky-700" />
        <span className="text-base">Activa (aparece en Nuevo viaje)</span>
      </label>
      {tarifa && <p className="text-sm text-slate-500">Un precio nuevo vale para los viajes que se carguen desde ahora. Los ya cargados conservan el suyo.</p>}
      <ErrorForm error={estado.error} />
      <button type="submit" disabled={enviando} className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:opacity-60">
        {enviando ? "Guardando…" : "Guardar tarifa"}
      </button>
    </form>
  );
}
