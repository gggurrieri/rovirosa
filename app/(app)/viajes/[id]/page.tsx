import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChipEstado } from "@/components/ChipEstado";
import { obtenerSesion } from "@/lib/datos";
import { obtenerHistorial } from "@/lib/datos-historial";
import { obtenerViaje } from "@/lib/datos-viajes";
import { formatearFecha, formatearPlata, hoyEnArgentina } from "@/lib/formato";
import { formatearMomento, type LineaHistorial } from "@/lib/historial";
import { NOMBRE_ESTADO } from "@/lib/viajes";
import { progresoEntrega, totalCobrado } from "@/lib/entregas";
import { puedeCancelar } from "@/lib/viajes";
import { AccionesEstado } from "./AccionesEstado";
import { CancelarViaje } from "./CancelarViaje";
import { EntregaAuto } from "./EntregaAuto";

export const metadata: Metadata = { title: "Viaje · Rovirosa" };

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COBRO: Record<string, { texto: string; clases: string }> = {
  pendiente: { texto: "Pendiente", clases: "text-red-700" },
  parcial: { texto: "Parcial", clases: "text-amber-800" },
  pagado: { texto: "Pagado", clases: "text-emerald-700" },
  cancelado: { texto: "Cancelado", clases: "text-slate-500" },
};

export default async function DetalleViaje({ params, searchParams }: PageProps<"/viajes/[id]">) {
  const { id } = await params;
  const { creado, estado: cambio, editado, entregado, entrega_deshecha } = await searchParams;
  if (!ES_UUID.test(id)) notFound();
  const [viaje, { perfil }] = await Promise.all([obtenerViaje(id), obtenerSesion()]);
  if (!viaje) notFound();
  // El historial sale de la auditoría, que solo ve el dueño.
  const historial = perfil?.rol === "dueno" ? await obtenerHistorial(viaje) : null;

  const hoy = hoyEnArgentina();
  const progreso = progresoEntrega(viaje.autos);
  const conEntrega = viaje.estado === "en_viaje" || viaje.estado === "entregado";
  const clientes = [...new Set(viaje.autos.filter((a) => a.estado_cobro !== "cancelado").map((a) => a.cliente_nombre))].join(" y ");

  return (
    <div className="flex flex-col gap-5 lg:max-w-3xl">
      <Link href="/viajes" className="text-base font-medium text-sky-700">
        ← Viajes
      </Link>

      {creado && <Aviso>Viaje #{viaje.numero} guardado.</Aviso>}
      {typeof editado === "string" && /^\d+$/.test(editado) && (
        <Aviso>
          Viaje #{viaje.numero} actualizado ({editado} {editado === "1" ? "cambio" : "cambios"}).
        </Aviso>
      )}
      {entregado && <Aviso>Auto entregado ({progreso.texto}).</Aviso>}
      {entrega_deshecha && <Aviso>Entrega deshecha.</Aviso>}
      {typeof cambio === "string" && cambio in NOMBRE_ESTADO && (
        <Aviso>Estado actualizado: {NOMBRE_ESTADO[cambio as keyof typeof NOMBRE_ESTADO]}.</Aviso>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-700">#{viaje.numero}</span> · {formatearFecha(viaje.fecha_salida)}
            {viaje.fecha_llegada_estimada && ` → ${formatearFecha(viaje.fecha_llegada_estimada)}`}
          </p>
          <ChipEstado estado={viaje.estado} />
        </div>
        <h1 className="mt-2 text-2xl font-bold break-words">
          {viaje.origen} → {viaje.destino}
        </h1>
        <p className="mt-1 text-base text-slate-600">
          {viaje.unidad ?? "Sin unidad"} · {viaje.chofer ?? "sin chofer"}
        </p>
        {viaje.notas && <p className="mt-3 text-base whitespace-pre-line text-slate-700">{viaje.notas}</p>}
        <Link
          href={`/viajes/${viaje.id}/editar`}
          className="mt-4 flex h-12 items-center justify-center rounded-xl border border-slate-300 text-base font-medium text-slate-800 active:bg-slate-50 lg:inline-flex lg:h-11 lg:px-6"
        >
          ✏️ Editar viaje
        </Link>
      </section>

      <AccionesEstado
        viajeId={viaje.id}
        estado={viaje.estado}
        salida={viaje.fecha_salida}
        hoy={hoy}
        entregaParcial={progreso.entregados > 0}
      />
      {puedeCancelar(viaje.estado) && (
        <CancelarViaje viajeId={viaje.id} estado={viaje.estado} cobrado={totalCobrado(viaje.autos)} clientes={clientes} />
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Autos ({viaje.autos.length})</h2>
          {conEntrega && <p className="text-sm font-medium text-slate-600">{progreso.texto}</p>}
        </div>
        <ul className="flex flex-col gap-3">
          {viaje.autos.map((a) => {
            const cobro = a.vencido ? { texto: "Vencido", clases: "text-red-700 font-semibold" } : COBRO[a.estado_cobro];
            return (
              <li key={a.item_id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/clientes/${a.cliente_id}`} className="text-base font-semibold break-words text-slate-900 underline decoration-slate-300 underline-offset-4">
                      {a.cliente_nombre}
                    </Link>
                    <p className="text-sm text-slate-500">{a.vehiculo ?? "Auto sin datos"}</p>
                  </div>
                  <p className={`shrink-0 text-sm ${cobro?.clases ?? ""}`}>{cobro?.texto}</p>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-slate-500">Precio</dt>
                    <dd className="font-medium tabular-nums">{formatearPlata(a.precio_centavos, a.moneda)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Cobrado</dt>
                    <dd className="font-medium tabular-nums">{formatearPlata(a.cobrado_centavos, a.moneda)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Saldo</dt>
                    <dd className="font-semibold tabular-nums">{formatearPlata(Math.max(a.saldo_centavos, 0), a.moneda)}</dd>
                  </div>
                </dl>
                {a.estado_cobro === "cancelado" && a.cobrado_centavos > 0 && (
                  <p className="mt-2 text-sm font-medium text-slate-700">Seña retenida: {formatearPlata(a.cobrado_centavos, a.moneda)}</p>
                )}
                {a.estado_cobro !== "cancelado" &&
                  (conEntrega ? (
                    <EntregaAuto
                      viajeId={viaje.id}
                      itemId={a.item_id}
                      nombre={a.vehiculo ?? "auto"}
                      fechaEntrega={a.fecha_entrega}
                      salida={viaje.fecha_salida}
                      hoy={hoy}
                      puedeEntregar={viaje.estado === "en_viaje"}
                      puedeDeshacer
                    />
                  ) : (
                    a.fecha_entrega && <p className="mt-2 text-sm text-slate-500">Entregado el {formatearFecha(a.fecha_entrega)}</p>
                  ))}
                {a.saldo_centavos > 0 && a.estado_cobro !== "cancelado" && (
                  <Link href={`/cobros/nuevo?cliente=${a.cliente_id}`} className="mt-2 inline-block py-1 text-sm font-medium text-sky-700">
                    Registrar pago →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {historial && <Historial lineas={historial} />}
    </div>
  );
}

function Historial({ lineas }: { lineas: LineaHistorial[] }) {
  return (
    <details className="rounded-2xl bg-white p-4 shadow-sm">
      <summary className="text-base font-semibold text-slate-700">Historial de cambios ({lineas.length})</summary>
      {lineas.length === 0 ? (
        <p className="mt-3 text-base text-slate-600">Todavía no hay cambios registrados.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          {lineas.map((l) => (
            <li key={`${l.en}-${l.quien}`} className="border-l-2 border-slate-200 pl-3">
              <p className="text-sm text-slate-500">
                {formatearMomento(l.en)} · {l.quien}
              </p>
              <ul className="text-base">
                {l.cambios.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {l.motivo && <p className="text-sm text-slate-600">Motivo: {l.motivo}</p>}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-900">
      ✅ {children}
    </p>
  );
}
