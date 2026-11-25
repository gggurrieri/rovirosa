import Link from "next/link";

export default function NoEncontrado() {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h1 className="text-xl font-semibold">No encontramos lo que buscabas</h1>
      <p className="mt-2 text-base text-slate-600">Puede que el link esté mal o que ya no exista.</p>
      <Link
        href="/"
        className="mt-5 flex h-14 items-center justify-center rounded-xl bg-sky-700 text-lg font-semibold text-white"
      >
        Ir al inicio
      </Link>
    </section>
  );
}
