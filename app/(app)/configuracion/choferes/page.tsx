import type { Metadata } from "next";
import Link from "next/link";
import { obtenerChoferesConfig } from "@/lib/datos-configuracion";
import { Aviso, BotonNuevo, Encabezado, Inactivo } from "../componentes";
import { textoProximos } from "../proximos";

export const metadata: Metadata = { title: "Choferes · Rovirosa" };

export default async function Choferes({ searchParams }: PageProps<"/configuracion/choferes">) {
  const { guardado } = await searchParams;
  const choferes = (await obtenerChoferesConfig()).sort((a, b) => Number(b.activo) - Number(a.activo));
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <Encabezado volver={{ href: "/configuracion", texto: "Configuración" }} titulo={`Choferes (${choferes.length})`} accion={<BotonNuevo href="/configuracion/choferes/nuevo">Nuevo chofer</BotonNuevo>} />
      {guardado && <Aviso>Chofer guardado.</Aviso>}
      <ul className="flex flex-col gap-2">
        {choferes.map((c) => (
          <li key={c.id}>
            <Link href={`/configuracion/choferes/${c.id}`} className={`block rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50 ${c.activo ? "" : "opacity-60"}`}>
              <span className="block text-base font-semibold">
                {c.nombre} {!c.activo && <Inactivo texto="Desactivado" />}
              </span>
              <span className="block text-sm text-slate-500">{c.telefono ?? "Sin teléfono"}</span>
              {textoProximos(c.proximos) && <span className="block text-sm text-slate-600">{textoProximos(c.proximos)}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
