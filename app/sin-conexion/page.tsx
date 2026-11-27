import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sin conexión · Tracker" };
export const dynamic = "force-static";

// Se guarda en el celular y se muestra cuando no hay señal. No lleva datos de nadie.
export default function SinConexion() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6 py-10 text-center">
      <p className="text-6xl" aria-hidden="true">
        📶
      </p>
      <h1 className="text-2xl font-bold">Sin conexión</h1>
      <p className="text-lg text-slate-600">No hay señal en este momento. Cuando vuelva, tocá el botón para seguir.</p>
      {/* <a> a propósito y no <Link>: hace falta recargar la app entera desde la red. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="mx-auto mt-2 flex h-14 w-full items-center justify-center rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800">
        Reintentar
      </a>
    </main>
  );
}
