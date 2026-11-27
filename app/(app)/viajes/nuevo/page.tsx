import type { Metadata } from "next";
import { obtenerOpcionesViaje } from "@/lib/datos-viajes";
import { hoyEnArgentina } from "@/lib/formato";
import { FormularioViaje } from "./FormularioViaje";

export const metadata: Metadata = { title: "Nuevo viaje · Rovirosa" };

export default async function NuevoViaje({ searchParams }: PageProps<"/viajes/nuevo">) {
  const { unidad, fecha } = await searchParams;
  const opciones = await obtenerOpcionesViaje();
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <h1 className="text-2xl font-bold">Nuevo viaje</h1>
      {/* Un id nuevo cada vez que se abre: un doble envío no crea dos viajes. */}
      <FormularioViaje
        id={crypto.randomUUID()}
        hoy={hoyEnArgentina()}
        opciones={opciones}
        unidadInicial={typeof unidad === "string" ? unidad : null}
        fechaInicial={typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null}
      />
    </div>
  );
}
