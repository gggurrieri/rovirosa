import type { Metadata } from "next";
import Link from "next/link";
import { Montos } from "@/components/Montos";
import {
  obtenerSaldosClientes,
  obtenerUltimosPagos,
  type Pago,
} from "@/lib/datos-cobros";
import { formatearFecha, formatearPlata } from "@/lib/formato";

export const metadata: Metadata = { title: "Cobros · Rovirosa" };

const tieneMonto = (m: Record<string, number | undefined>) =>
  Object.values(m).some((v) => (v ?? 0) > 0);

export default async function Cobros({ searchParams }: PageProps<"/cobros">) {
  const { registrado, anulado, comprobante } = await searchParams;
  const [clientes, pagos] = await Promise.all([
    obtenerSaldosClientes(),
    obtenerUltimosPagos(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Cobros</h1>

      {registrado && (
        <Aviso>Pago registrado. Los saldos ya están actualizados.</Aviso>
      )}
      {anulado && (
        <Aviso>Pago anulado. Los saldos volvieron a como estaban.</Aviso>
      )}
      {comprobante && <Aviso>Comprobante agregado al pago.</Aviso>}

      <Link
        href="/cobros/nuevo"
        className="flex h-14 items-center justify-center rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 lg:w-64 lg:self-end"
      >
        Registrar pago
      </Link>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Quién me debe</h2>
          {clientes.length === 0 ? (
            <p className="rounded-2xl bg-white p-5 text-base text-slate-600 shadow-sm">
              Nadie te debe nada. 🎉
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {clientes.map((c) => {
                const conVencido = tieneMonto(c.vencido);
                return (
                  <li key={c.cliente_id}>
                    <Link
                      href={`/cobros/nuevo?cliente=${c.cliente_id}`}
                      className={`block rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50 ${conVencido ? "border-l-4 border-red-600" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-base font-semibold break-words">
                          {c.nombre}
                        </p>
                        <p className="shrink-0 text-right text-lg font-bold tabular-nums">
                          <Montos montos={c.deuda} />
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {c.autos}{" "}
                        {c.autos === 1 ? "auto pendiente" : "autos pendientes"}
                      </p>
                      {conVencido && (
                        <p className="mt-1 text-sm font-medium text-red-700">
                          Vencido: <Montos montos={c.vencido} />
                        </p>
                      )}
                      {tieneMonto(c.aFavor) && (
                        <p className="mt-1 text-sm text-amber-800">
                          A favor: <Montos montos={c.aFavor} />
                        </p>
                      )}
                      <p className="mt-2 text-sm font-medium text-sky-700">
                        Registrar pago →
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Últimos pagos</h2>
          {pagos.length === 0 ? (
            <p className="rounded-2xl bg-white p-5 text-base text-slate-600 shadow-sm">
              Todavía no hay pagos cargados.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {pagos.map((p) => (
                <TarjetaPago key={p.id} pago={p} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function TarjetaPago({ pago }: { pago: Pago }) {
  const anulado = pago.anulado_en !== null;
  return (
    <li
      className={`rounded-2xl bg-white p-4 shadow-sm ${anulado ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{formatearFecha(pago.fecha)}</p>
          <p className="text-base font-semibold break-words">
            {pago.cliente_nombre}
          </p>
        </div>
        <p
          className={`shrink-0 text-lg font-bold tabular-nums ${anulado ? "text-slate-500 line-through" : ""}`}
        >
          {formatearPlata(pago.monto_centavos, pago.moneda)}
        </p>
      </div>

      {pago.aplicaciones.length > 0 && (
        <p className="mt-1 text-sm text-slate-600">
          {pago.aplicaciones
            .map(
              (a) =>
                `#${a.viaje_numero}: ${formatearPlata(a.monto_centavos, pago.moneda)}`,
            )
            .join(" · ")}
        </p>
      )}
      {pago.a_favor_centavos > 0 && (
        <p className="mt-1 text-sm text-amber-800">
          A favor: {formatearPlata(pago.a_favor_centavos, pago.moneda)}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
        {pago.comprobante_path ? (
          <a
            href={`/cobros/pagos/${pago.id}/comprobante`}
            target="_blank"
            rel="noopener"
            className="py-1 text-sm font-medium text-sky-700"
          >
            📎 Ver comprobante
          </a>
        ) : (
          !anulado && (
            <Link
              href={`/cobros/pagos/${pago.id}/adjuntar`}
              className="py-1 text-sm font-medium text-sky-700"
            >
              📎 Agregar comprobante
            </Link>
          )
        )}
        {anulado ? (
          <p className="text-sm font-medium text-red-700">
            Anulado: {pago.anulado_motivo}
          </p>
        ) : (
          <Link
            href={`/cobros/pagos/${pago.id}/anular`}
            className="py-1 text-sm font-medium text-red-700"
          >
            Anular
          </Link>
        )}
      </div>
    </li>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-900"
    >
      ✅ {children}
    </p>
  );
}
