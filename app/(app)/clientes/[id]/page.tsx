import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonRecordar } from "@/components/BotonRecordar";
import { ChipEstado } from "@/components/ChipEstado";
import { Montos } from "@/components/Montos";
import { obtenerFichaCliente } from "@/lib/datos-clientes";
import { formatearFecha, formatearPlata } from "@/lib/formato";
import { haceCuanto } from "@/lib/recordatorio";
import { tieneMonto } from "@/lib/tablero";
import { FormularioCliente } from "./FormularioCliente";

export const metadata: Metadata = { title: "Cliente · Tracker" };

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COBRO: Record<string, string> = { pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado", cancelado: "Cancelado" };

export default async function FichaCliente({ params, searchParams }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  const { guardado } = await searchParams;
  if (!ES_UUID.test(id)) notFound();
  const ficha = await obtenerFichaCliente(id);
  if (!ficha) notFound();
  const { cliente: c, autos, pagos, recordatorios } = ficha;
  const vehiculos = [...new Set(autos.map((a) => a.vehiculo).filter(Boolean))];

  return (
    <div className="flex flex-col gap-5 lg:max-w-4xl">
      <Link href="/clientes" className="text-base font-medium text-sky-700">
        ← Clientes
      </Link>
      {guardado && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-900">
          ✅ Datos del cliente guardados.
        </p>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold break-words">
          {c.nombre} {!c.activo && <span className="text-base font-normal text-slate-500">(inactivo)</span>}
        </h1>
        <p className="mt-1 text-base text-slate-600">{[c.ciudad, c.whatsapp && `WhatsApp ${c.whatsapp}`].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">Debe</dt>
            <dd className="text-lg font-bold tabular-nums">
              <Montos montos={c.saldo} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Vencido</dt>
            <dd className={`text-lg font-bold tabular-nums ${tieneMonto(c.vencido) ? "text-red-700" : ""}`}>
              <Montos montos={c.vencido} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">A favor</dt>
            <dd className="text-lg font-bold tabular-nums">
              <Montos montos={c.aFavor} />
            </dd>
          </div>
        </dl>
        {c.ultimoRecordatorio && <p className="mt-3 text-sm text-slate-600">Último recordatorio: {haceCuanto(c.ultimoRecordatorio)}</p>}
        <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
          {tieneMonto(c.saldo) && (
            <>
              <div className="lg:w-72">
                <BotonRecordar clienteId={c.id} grande />
              </div>
              <Link href={`/cobros/nuevo?cliente=${c.id}`} className="flex h-12 items-center justify-center rounded-xl border border-slate-300 px-5 text-base font-medium">
                Registrar pago
              </Link>
            </>
          )}
          {tieneMonto(c.aFavor) && (
            <Link href={`/cobros/usar?cliente=${c.id}`} className="flex h-12 items-center justify-center rounded-xl border border-slate-300 px-5 text-base font-medium">
              Usar saldo a favor
            </Link>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Viajes ({autos.length} {autos.length === 1 ? "auto" : "autos"})</h2>
          {autos.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-base text-slate-600 shadow-sm">Todavía no tiene viajes.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {autos.map((a) => (
                <li key={a.item_id}>
                  <Link href={`/viajes/${a.viaje_id}`} className="block rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-slate-500">
                        <span className="font-semibold text-slate-700">#{a.viaje_numero}</span> · {formatearFecha(a.fecha_salida)}
                      </p>
                      <ChipEstado estado={a.estado_viaje} />
                    </div>
                    <p className="mt-1 text-base font-semibold break-words">
                      {a.origen} → {a.destino}
                    </p>
                    <p className="text-sm text-slate-600">
                      {a.vehiculo ?? "Auto"} · {formatearPlata(a.precio_centavos, a.moneda)} ·{" "}
                      <span className={a.vencido ? "font-semibold text-red-700" : ""}>
                        {a.vencido ? "Vencido" : COBRO[a.estado_cobro]}
                        {a.saldo_centavos > 0 && a.estado_cobro !== "cancelado" && `: debe ${formatearPlata(a.saldo_centavos, a.moneda)}`}
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Pagos ({pagos.length})</h2>
            {pagos.length === 0 ? (
              <p className="rounded-2xl bg-white p-4 text-base text-slate-600 shadow-sm">Todavía no hay pagos.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100 rounded-2xl bg-white px-4 shadow-sm">
                {pagos.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-3 text-base">
                    <span>{formatearFecha(p.fecha)}</span>
                    <span className={`tabular-nums ${p.anulado_en ? "text-slate-400 line-through" : "font-semibold"}`}>{formatearPlata(p.monto_centavos, p.moneda)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {recordatorios.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Recordatorios</h2>
              <ul className="flex flex-col divide-y divide-slate-100 rounded-2xl bg-white px-4 shadow-sm">
                {recordatorios.map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
                    <span>{haceCuanto(r.enviado_en)}</span>
                    <span className="text-slate-600 tabular-nums">
                      debía <Montos montos={{ ...(r.saldo_ars ? { ARS: r.saldo_ars } : {}), ...(r.saldo_usd ? { USD: r.saldo_usd } : {}) }} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {vehiculos.length > 0 && <p className="text-sm text-slate-600">Autos que trajo: {vehiculos.join(", ")}.</p>}
        </div>
      </div>

      <FormularioCliente cliente={c} />
    </div>
  );
}
