import type { Metadata } from "next";
import Link from "next/link";
import { FormularioLogin } from "./FormularioLogin";

export const metadata: Metadata = { title: "Entrar · Rovirosa" };

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const { confirmado } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Rovirosa</h1>
      <p className="mt-2 mb-8 text-lg text-slate-600">Entrá con tu email y contraseña.</p>
      {confirmado && (
        <p role="status" className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-900">
          ✅ Tu email quedó confirmado. Entrá con tu email y contraseña.
        </p>
      )}
      <FormularioLogin />
      <Link href="/registro" className="mt-8 text-center text-base font-medium text-sky-700">
        ¿Te invitaron? Creá tu usuario
      </Link>
    </main>
  );
}
