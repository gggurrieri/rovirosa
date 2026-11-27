import type { Metadata } from "next";
import Link from "next/link";
import { obtenerUnidadesConfig } from "@/lib/datos-configuracion";
import { Aviso, BotonNuevo, Encabezado, Inactivo } from "../componentes";
import { textoProximos } from "../proximos";

export const metadata: Metadata = { title: "Unidades · Tracker" };
const NOMBRE_TIPO = { mosquito: "Mosquito", camioneta_carro: "Camioneta con carro", otro: "Otro" } as const;

export default async function Unidades({ searchParams }: PageProps<"/configuracion/unidades">) {
  const { guardada } = await searchParams;
  const unidades = (await obtenerUnidadesConfig()).sort((a, b) => Number(b.activa) - Number(a.activa));
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <Encabezado volver={{ href: "/configuracion", texto: "Configuración" }} titulo={`Unidades (${unidades.length})`} accion={<BotonNuevo href="/configuracion/unidades/nueva">Nueva unidad</BotonNuevo>} />
      {guardada && <Aviso>Unidad guardada.</Aviso>}
      <ul className="flex flex-col gap-2">
        {unidades.map((u) => (
          <li key={u.id}>
            <Link href={`/configuracion/unidades/${u.id}`} className={`block rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50 ${u.activa ? "" : "opacity-60"}`}>
              <span className="flex items-center justify-between gap-3">
                <span className="text-base font-semibold">
                  {u.nombre} {!u.activa && <Inactivo />}
                </span>
                <span className="text-sm text-slate-600">
                  {u.capacidad_autos} {u.capacidad_autos === 1 ? "auto" : "autos"}
                </span>
              </span>
              <span className="block text-sm text-slate-500">
                {[NOMBRE_TIPO[u.tipo], u.patente, u.chofer ? `chofer habitual: ${u.chofer}` : "sin chofer habitual"].filter(Boolean).join(" · ")}
              </span>
              {textoProximos(u.proximos) && <span className="block text-sm text-slate-600">{textoProximos(u.proximos)}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
