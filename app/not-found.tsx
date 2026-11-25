import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">No encontramos esta página</h1>
      <p className="mt-2 text-lg text-slate-600">Puede que el link esté mal o que ya no exista.</p>
      <Link
        href="/"
        className="mt-6 flex h-14 items-center justify-center rounded-xl bg-sky-700 text-lg font-semibold text-white"
      >
        Ir al inicio
      </Link>
    </main>
  );
}
