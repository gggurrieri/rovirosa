import type { Metadata } from "next";
import { obtenerOpcionesViaje } from "@/lib/datos-viajes";
import { hoyEnArgentina } from "@/lib/formato";
import { FormularioViaje } from "./FormularioViaje";

export const metadata: Metadata = { title: "Nuevo viaje · Rovirosa" };

export default async function NuevoViaje() {
  const opciones = await obtenerOpcionesViaje();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Nuevo viaje</h1>
      {/* Un id nuevo cada vez que se abre: un doble envío no crea dos viajes. */}
      <FormularioViaje id={crypto.randomUUID()} hoy={hoyEnArgentina()} opciones={opciones} />
    </div>
  );
}
