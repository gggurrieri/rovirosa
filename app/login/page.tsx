import type { Metadata } from "next";
import { FormularioLogin } from "./FormularioLogin";

export const metadata: Metadata = { title: "Entrar · Rovirosa" };

export default function PaginaLogin() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Rovirosa</h1>
      <p className="mt-2 mb-8 text-lg text-slate-600">Entrá con tu email y contraseña.</p>
      <FormularioLogin />
    </main>
  );
}
