import type { Metadata } from "next";
import { FormularioRegistro } from "./FormularioRegistro";

export const metadata: Metadata = { title: "Crear usuario · Rovirosa" };

export default function PaginaRegistro() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Crear tu usuario</h1>
      <p className="mt-2 mb-8 text-lg text-slate-600">Si te invitaron, creá tu usuario con el email de la invitación.</p>
      <FormularioRegistro />
    </main>
  );
}
