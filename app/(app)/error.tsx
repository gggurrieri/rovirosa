"use client";

export default function ErrorDeCarga({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h1 className="text-xl font-semibold">No pudimos cargar los datos</h1>
      <p className="mt-2 text-base text-slate-600">Revisá la conexión y probá de nuevo.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 h-14 w-full rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800"
      >
        Reintentar
      </button>
    </section>
  );
}
