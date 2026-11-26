// Piezas compartidas por las pantallas de Configuración.
import Link from "next/link";

export const campo =
  "h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200";

export function Encabezado({ volver, titulo, accion }: { volver: { href: string; texto: string }; titulo: string; accion?: React.ReactNode }) {
  return (
    <>
      <Link href={volver.href} className="text-base font-medium text-sky-700">
        ← {volver.texto}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{titulo}</h1>
        {accion}
      </div>
    </>
  );
}

export function BotonNuevo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex h-12 items-center justify-center rounded-xl bg-sky-700 px-5 text-base font-semibold text-white active:bg-sky-800">
      {children}
    </Link>
  );
}

export function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-900">
      ✅ {children}
    </p>
  );
}

export function ErrorForm({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">
      {error}
    </p>
  ) : null;
}

export function Inactivo({ texto = "Desactivada" }: { texto?: string }) {
  return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">{texto}</span>;
}
