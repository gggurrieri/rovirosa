import type { Metadata } from "next";
import Link from "next/link";
import { Instalar } from "./Instalar";

export const metadata: Metadata = { title: "Instalá la app · Tracker" };

export default function PaginaInstalar() {
  return (
    <div className="flex flex-col gap-5 lg:max-w-3xl">
      <Link href="/mas" className="text-base font-medium text-sky-700">
        ← Más
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Instalá la app</h1>
        <p className="mt-1 text-base text-slate-600">Queda el ícono de Tracker en la pantalla del celular y se abre de un toque, sin buscar el link.</p>
      </div>
      <Instalar />
    </div>
  );
}
