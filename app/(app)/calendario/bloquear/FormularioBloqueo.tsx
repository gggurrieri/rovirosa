"use client";

import { useActionState, useState } from "react";
import { NOMBRE_MOTIVO } from "@/lib/calendario";
import { crearBloqueo, type Estado } from "../actions";

const campo = "h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base";

export function FormularioBloqueo({
  unidades,
  choferes,
  que,
  desde,
}: {
  unidades: { id: string; nombre: string }[];
  choferes: { id: string; nombre: string }[];
  que: string;
  desde: string;
}) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(crearBloqueo, { error: null });
  const [inicio, setInicio] = useState(desde);
  return (
    <form action={accion} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-600">¿Qué se bloquea?</span>
        <select name="que" required defaultValue={que} className={campo}>
          <option value="">Elegí…</option>
          <optgroup label="Unidades">
            {unidades.map((u) => (
              <option key={u.id} value={`u:${u.id}`}>
                {u.nombre}
              </option>
            ))}
          </optgroup>
          <optgroup label="Choferes">
            {choferes.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                {c.nombre}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-600">Motivo</span>
        <select name="motivo" required defaultValue="service" className={campo}>
          {Object.entries(NOMBRE_MOTIVO).map(([v, t]) => (
            <option key={v} value={v}>
              {v === "otro" ? "Otro" : t}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Desde</span>
          <input name="desde" type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Hasta</span>
          <input name="hasta" type="date" required min={inicio} defaultValue={desde} className={campo} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-600">Notas (opcional)</span>
        <input name="notas" maxLength={300} placeholder="Ej.: cambio de aceite y filtros" className={campo} />
      </label>
      {estado.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={enviando} className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:opacity-60">
        {enviando ? "Guardando…" : "Guardar bloqueo"}
      </button>
    </form>
  );
}
