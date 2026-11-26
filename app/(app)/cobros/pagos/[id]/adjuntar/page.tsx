import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerPago } from "@/lib/datos-cobros";
import { formatearFecha, formatearPlata } from "@/lib/formato";
import { FormularioAdjuntar } from "./FormularioAdjuntar";

export const metadata: Metadata = { title: "Agregar comprobante · Rovirosa" };

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdjuntarComprobante({ params }: PageProps<"/cobros/pagos/[id]/adjuntar">) {
  const { id } = await params;
  if (!ES_UUID.test(id)) notFound();
  const pago = await obtenerPago(id);
  if (!pago) notFound();

  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <h1 className="text-2xl font-bold">Agregar comprobante</h1>
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">{formatearFecha(pago.fecha)}</p>
        <p className="text-lg font-semibold">{pago.cliente_nombre}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{formatearPlata(pago.monto_centavos, pago.moneda)}</p>
      </section>
      {pago.comprobante_path ? (
        <>
          <p className="rounded-xl bg-slate-200 px-4 py-3 text-base">Este pago ya tiene comprobante.</p>
          <Link href="/cobros" className="text-center text-base font-medium text-sky-700">
            Volver a Cobros
          </Link>
        </>
      ) : (
        <FormularioAdjuntar id={pago.id} />
      )}
    </div>
  );
}
