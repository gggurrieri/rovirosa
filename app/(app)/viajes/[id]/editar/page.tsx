import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChipEstado } from "@/components/ChipEstado";
import { obtenerOpcionesViaje, obtenerVersionViaje, obtenerViaje, viajeOriginal } from "@/lib/datos-viajes";
import { hayCalculoAutomatico } from "@/lib/ors";
import { FormularioEdicion } from "./FormularioEdicion";

export const metadata: Metadata = { title: "Editar viaje · Tracker" };

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarViaje({ params }: PageProps<"/viajes/[id]/editar">) {
  const { id } = await params;
  if (!ES_UUID.test(id)) notFound();
  // La versión se lee junto con el viaje: si alguien lo cambia mientras se edita,
  // al guardar la base lo detecta y no se pisa nada.
  const [viaje, version, opciones] = await Promise.all([obtenerViaje(id), obtenerVersionViaje(id), obtenerOpcionesViaje()]);
  if (!viaje) notFound();

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <Link href={`/viajes/${id}`} className="text-base font-medium text-sky-700">
        ← Viaje #{viaje.numero}
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Editar viaje #{viaje.numero}</h1>
        <ChipEstado estado={viaje.estado} />
      </div>
      <FormularioEdicion
        key={version}
        viajeId={id}
        numero={viaje.numero}
        version={version}
        original={viajeOriginal(viaje)}
        opciones={opciones}
        lugaresUsados={[...new Set([...opciones.tarifas, ...opciones.agenda].flatMap((x) => [x.origen, x.destino]))]}
        conServicio={hayCalculoAutomatico()}
      />
    </div>
  );
}
