import type { Metadata } from "next";
import { BotonCerrarSesion } from "@/components/BotonCerrarSesion";
import { obtenerSesion } from "@/lib/datos";

export const metadata: Metadata = { title: "Más · Rovirosa" };

export default async function Mas() {
  const { email, perfil } = await obtenerSesion();

  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <h1 className="text-2xl font-bold">Más</h1>
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-lg font-semibold">{perfil?.nombre}</p>
        <p className="text-base break-all text-slate-600">{email}</p>
      </section>
      <BotonCerrarSesion />
    </div>
  );
}
