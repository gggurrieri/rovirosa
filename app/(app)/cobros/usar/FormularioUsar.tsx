"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { armarAplicaciones } from "@/lib/cobros";
import type { ItemPendienteDetalle, PagoConSaldo } from "@/lib/datos-cobros";
import { formatearFecha, formatearPlata } from "@/lib/formato";
import { type EstadoUsar, usarSaldo } from "./actions";

const inicial: EstadoUsar = { error: null };

export function FormularioUsar({
  clienteId,
  pagos,
  pendientes,
}: {
  clienteId: string;
  pagos: PagoConSaldo[];
  pendientes: ItemPendienteDetalle[];
}) {
  const [estado, accion, enviando] = useActionState(usarSaldo, inicial);
  const [pagoId, setPagoId] = useState(pagos[0].id);
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const pago = pagos.find((p) => p.id === pagoId) ?? pagos[0];
  const candidatos = pendientes.filter((p) => p.moneda === pago.moneda);
  const { aplicaciones, aplicado, saldoAFavor } = armarAplicaciones(candidatos, pago.a_favor_centavos, pago.moneda, { excluidos });
  const montoDe = (id: string) => aplicaciones.find((a) => a.item_id === id)?.monto_centavos ?? 0;

  return (
    <form action={accion} className="flex flex-col gap-5">
      <input type="hidden" name="cliente_id" value={clienteId} />
      <input type="hidden" name="pago_id" value={pago.id} />
      <input type="hidden" name="a_favor" value={pago.a_favor_centavos} />
      <input type="hidden" name="excluidos" value={JSON.stringify(excluidos)} />

      {pagos.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-semibold text-slate-700">¿De qué pago?</legend>
          {pagos.map((p) => (
            <label key={p.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 has-[:checked]:border-sky-700 has-[:checked]:bg-sky-50">
              <input type="radio" name="pago" checked={p.id === pago.id} onChange={() => { setPagoId(p.id); setExcluidos([]); }} className="h-5 w-5 accent-sky-700" />
              <span className="text-base">
                Pago del {formatearFecha(p.fecha)}: <strong>{formatearPlata(p.a_favor_centavos, p.moneda)}</strong> a favor
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-slate-700">Autos con saldo (del más viejo al más nuevo)</h2>
        {candidatos.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-base text-slate-600 shadow-sm">No hay autos con saldo en {pago.moneda === "ARS" ? "pesos" : "dólares"}.</p>
        ) : (
          candidatos.map((i) => {
            const incluido = !excluidos.includes(i.item_id);
            return (
              <label key={i.item_id} className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
                <input
                  type="checkbox"
                  checked={incluido}
                  onChange={() => setExcluidos((l) => (incluido ? [...l, i.item_id] : l.filter((x) => x !== i.item_id)))}
                  className="mt-1 h-5 w-5 accent-sky-700"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold break-words">
                    #{i.viaje_numero} {i.origen} → {i.destino}
                  </span>
                  <span className="block text-sm text-slate-500">
                    {i.vehiculo ?? "Auto"} · debe {formatearPlata(i.saldo_centavos, i.moneda)}
                  </span>
                </span>
                <span className="shrink-0 text-base font-semibold tabular-nums">{montoDe(i.item_id) > 0 ? formatearPlata(montoDe(i.item_id), i.moneda) : "—"}</span>
              </label>
            );
          })
        )}
      </section>

      <p className="rounded-xl bg-slate-200/60 p-4 text-base">
        Se aplican <strong>{formatearPlata(aplicado, pago.moneda)}</strong>
        {saldoAFavor > 0 && <> y siguen a favor {formatearPlata(saldoAFavor, pago.moneda)}</>}.
      </p>

      {estado.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando || aplicado === 0}
        className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:bg-slate-300 disabled:text-slate-600"
      >
        {enviando ? "Aplicando…" : `Aplicar ${formatearPlata(aplicado, pago.moneda)}`}
      </button>
      <Link href="/cobros" className="text-center text-base font-medium text-slate-600">
        Cancelar
      </Link>
    </form>
  );
}
