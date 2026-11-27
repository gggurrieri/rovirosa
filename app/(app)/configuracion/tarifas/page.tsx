import type { Metadata } from "next";
import Link from "next/link";
import { obtenerTarifasConfig } from "@/lib/datos-configuracion";
import { formatearPlata } from "@/lib/formato";
import { Aviso, BotonNuevo, Encabezado, Inactivo } from "../componentes";

export const metadata: Metadata = { title: "Tarifas · Tracker" };

export default async function Tarifas({ searchParams }: PageProps<"/configuracion/tarifas">) {
  const { guardada, creadas, actualizadas } = await searchParams;
  const tarifas = (await obtenerTarifasConfig()).sort((a, b) => Number(b.activa) - Number(a.activa));
  return (
    <div className="flex flex-col gap-4 lg:max-w-4xl">
      <Encabezado
        volver={{ href: "/configuracion", texto: "Configuración" }}
        titulo={`Tarifas (${tarifas.length})`}
        accion={
          <div className="flex w-full gap-2 lg:w-auto">
            <Link href="/configuracion/tarifas/importar" className="flex h-12 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-base font-medium lg:flex-none">
              Importar desde Excel
            </Link>
            <div className="flex-1 lg:flex-none">
              <BotonNuevo href="/configuracion/tarifas/nueva">Nueva tarifa</BotonNuevo>
            </div>
          </div>
        }
      />
      {guardada && <Aviso>Tarifa guardada. Los viajes ya cargados conservan su precio.</Aviso>}
      {typeof creadas === "string" && (
        <Aviso>
          Importación lista: {creadas} {creadas === "1" ? "tarifa nueva" : "tarifas nuevas"} y {actualizadas} {actualizadas === "1" ? "actualizada" : "actualizadas"}.
        </Aviso>
      )}
      {tarifas.length === 0 ? (
        <p className="rounded-2xl bg-white p-5 text-base text-slate-600 shadow-sm">Todavía no hay tarifas. Cargalas de a una o importalas desde Excel.</p>
      ) : (
        <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2">
          {tarifas.map((t) => (
            <li key={t.id}>
              <Link href={`/configuracion/tarifas/${t.id}`} className={`flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50 ${t.activa ? "" : "opacity-60"}`}>
                <span className="min-w-0">
                  <span className="block text-base font-semibold break-words">
                    {t.origen} → {t.destino}
                  </span>
                  <span className="text-sm text-slate-500">
                    {t.km} km {!t.activa && <Inactivo />}
                  </span>
                </span>
                <span className="shrink-0 text-base font-semibold tabular-nums">{formatearPlata(t.precio_base_centavos, t.moneda)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
