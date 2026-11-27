import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NOMBRE_MOTIVO } from "@/lib/calendario";
import { obtenerBloqueo } from "@/lib/datos-calendario";
import { formatearFecha } from "@/lib/formato";
import { FormularioAnular } from "./FormularioAnular";

export const metadata: Metadata = { title: "Bloqueo · Rovirosa" };

export default async function Bloqueo({ params }: PageProps<"/calendario/bloqueos/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const b = await obtenerBloqueo(id);
  if (!b) notFound();
  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <Link href={`/calendario?desde=${b.desde}`} className="text-base font-medium text-sky-700">
        ← Calendario
      </Link>
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold">
          {NOMBRE_MOTIVO[b.motivo]} · {b.quien}
        </h1>
        <p className="mt-1 text-base text-slate-700">
          Del {formatearFecha(b.desde)} al {formatearFecha(b.hasta)}
        </p>
        {b.notas && <p className="mt-2 text-base text-slate-600">{b.notas}</p>}
        {b.anulado_en && <p className="mt-2 text-base font-medium text-red-700">Anulado: {b.anulado_motivo}</p>}
      </section>
      {!b.anulado_en && <FormularioAnular id={b.id} />}
    </div>
  );
}
