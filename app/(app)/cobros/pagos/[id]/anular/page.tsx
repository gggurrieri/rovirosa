import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerPago } from "@/lib/datos-cobros";
import { formatearFecha, formatearPlata } from "@/lib/formato";
import { FormularioAnular } from "./FormularioAnular";

export const metadata: Metadata = { title: "Anular pago · Rovirosa" };

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AnularPago({ params }: PageProps<"/cobros/pagos/[id]/anular">) {
  const { id } = await params;
  if (!ES_UUID.test(id)) notFound();
  const pago = await obtenerPago(id);
  if (!pago) notFound();

  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <h1 className="text-2xl font-bold">Anular pago</h1>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">{formatearFecha(pago.fecha)}</p>
        <p className="text-lg font-semibold">{pago.cliente_nombre}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{formatearPlata(pago.monto_centavos, pago.moneda)}</p>
        {pago.aplicaciones.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-base text-slate-700">
            {pago.aplicaciones.map((a) => (
              <li key={a.viaje_numero}>
                Viaje #{a.viaje_numero}: {formatearPlata(a.monto_centavos, pago.moneda)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pago.anulado_en ? (
        <>
          <p className="rounded-xl bg-slate-200 px-4 py-3 text-base">
            Este pago ya está anulado. Motivo: {pago.anulado_motivo}
          </p>
          <Link href="/cobros" className="text-center text-base font-medium text-sky-700">
            Volver a Cobros
          </Link>
        </>
      ) : (
        <>
          <p className="text-base text-slate-600">
            Al anularlo, los saldos de esos viajes vuelven a como estaban. El pago no se borra: queda en la
            lista como anulado, con el motivo.
          </p>
          <FormularioAnular id={pago.id} />
        </>
      )}
    </div>
  );
}
