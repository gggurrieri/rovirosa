"use client";

import { useActionState } from "react";
import { type EstadoInvitar, invitar } from "./actions";

const inicial: EstadoInvitar = { error: null, nombre: "", email: "", rol: "administrativo" };
const campo =
  "h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200";

export function FormularioInvitar() {
  const [estado, accion, enviando] = useActionState(invitar, inicial);
  return (
    <form action={accion} className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Invitar a alguien</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-600">Nombre</span>
        <input name="nombre" required maxLength={80} defaultValue={estado.nombre} autoComplete="off" className={campo} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-600">Email</span>
        <input name="email" type="email" required defaultValue={estado.email} autoComplete="off" inputMode="email" className={campo} />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm text-slate-600">Rol</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            { valor: "administrativo", texto: "Administrativo", ayuda: "Carga viajes y cobros" },
            { valor: "dueno", texto: "Dueño", ayuda: "Todo, más usuarios e historial" },
          ].map((r) => (
            <label
              key={r.valor}
              className="flex min-h-14 cursor-pointer flex-col justify-center rounded-xl border border-slate-300 px-3 py-2 has-[:checked]:border-sky-700 has-[:checked]:bg-sky-50"
            >
              <span className="flex items-center gap-2 text-base font-medium">
                <input type="radio" name="rol" value={r.valor} defaultChecked={estado.rol === r.valor} className="accent-sky-700" />
                {r.texto}
              </span>
              <span className="text-xs text-slate-500">{r.ayuda}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {estado.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:bg-slate-300"
      >
        {enviando ? "Invitando…" : "Invitar"}
      </button>
    </form>
  );
}
