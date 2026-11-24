"use client";

import { useActionState } from "react";
import { type EstadoLogin, iniciarSesion } from "./actions";

const estadoInicial: EstadoLogin = { error: null, email: "" };

export function FormularioLogin() {
  const [estado, accion, enviando] = useActionState(iniciarSesion, estadoInicial);

  return (
    <form action={accion} className="flex flex-col gap-5" noValidate>
      <label className="flex flex-col gap-2">
        <span className="text-base font-medium text-slate-700">Email</span>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          defaultValue={estado.email}
          className="h-14 rounded-xl border border-slate-300 bg-white px-4 text-lg outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-base font-medium text-slate-700">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-14 rounded-xl border border-slate-300 bg-white px-4 text-lg outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200"
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
        className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:opacity-60"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
