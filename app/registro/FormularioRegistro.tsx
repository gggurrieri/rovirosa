"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type EstadoRegistro, registrarse } from "./actions";

const inicial: EstadoRegistro = { error: null, email: "", enviado: false };
const campo =
  "h-14 rounded-xl border border-slate-300 bg-white px-4 text-lg outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200";

export function FormularioRegistro() {
  const [estado, accion, enviando] = useActionState(registrarse, inicial);

  if (estado.enviado) {
    return (
      <section role="status" className="flex flex-col gap-3 rounded-2xl bg-emerald-50 p-5 text-emerald-950">
        <p className="text-lg font-semibold">📧 Revisá tu email</p>
        <p className="text-base">
          Te mandamos un mail a <strong className="break-all">{estado.email}</strong>. Abrilo y tocá el link para confirmar.
          Después entrá con tu email y contraseña.
        </p>
        <p className="text-sm">Si no lo ves en unos minutos, buscalo en Spam o Promociones.</p>
        <Link href="/login" className="mt-2 font-medium text-sky-800 underline">
          Ir a la pantalla de ingreso
        </Link>
      </section>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-5" noValidate>
      <label className="flex flex-col gap-2">
        <span className="text-base font-medium text-slate-700">Email (el mismo con el que te invitaron)</span>
        <input name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required defaultValue={estado.email} className={campo} />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-base font-medium text-slate-700">Contraseña (mínimo 8 caracteres)</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} required className={campo} />
      </label>
      {estado.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={enviando} className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:opacity-60">
        {enviando ? "Creando…" : "Crear mi usuario"}
      </button>
      <Link href="/login" className="text-center text-base font-medium text-slate-600">
        Ya tengo usuario
      </Link>
    </form>
  );
}
