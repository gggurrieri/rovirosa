import type { Metadata } from "next";
import Link from "next/link";
import { ChipEstado } from "@/components/ChipEstado";
import { Montos } from "@/components/Montos";
import { obtenerItemsSaldo, obtenerViajes } from "@/lib/datos";
import { formatearFecha } from "@/lib/formato";
import { saldoPorViaje } from "@/lib/tablero";

export const metadata: Metadata = { title: "Viajes · Rovirosa" };

export default async function Viajes() {
  const [viajes, items] = await Promise.all([obtenerViajes(), obtenerItemsSaldo()]);
  const saldos = saldoPorViaje(items);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">
        Viajes <span className="text-base font-normal text-slate-500">({viajes.length})</span>
      </h1>

      <Link
        href="/viajes/nuevo"
        className="flex h-14 items-center justify-center rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800"
      >
        Nuevo viaje
      </Link>

      {viajes.length === 0 ? (
        <p className="rounded-2xl bg-white p-5 text-base text-slate-600 shadow-sm">
          Todavía no hay viajes cargados.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {viajes.map((viaje) => {
            const saldo = saldos.get(viaje.id) ?? {};
            const debe = Object.values(saldo).some((centavos) => centavos > 0);
            return (
              <li key={viaje.id}>
                <Link href={`/viajes/${viaje.id}`} className="block rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-500">
                    <span className="font-semibold text-slate-700">#{viaje.numero}</span> ·{" "}
                    {formatearFecha(viaje.fecha_salida)}
                  </p>
                  <ChipEstado estado={viaje.estado} />
                </div>
                <p className="mt-2 text-lg font-semibold break-words">
                  {viaje.origen} → {viaje.destino}
                </p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <p className="text-base text-slate-600">{viaje.unidad ?? "Sin unidad"}</p>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Saldo</p>
                    <p
                      className={`text-base font-semibold tabular-nums ${debe ? "text-red-700" : "text-emerald-700"}`}
                    >
                      <Montos montos={saldo} />
                    </p>
                  </div>
                </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
