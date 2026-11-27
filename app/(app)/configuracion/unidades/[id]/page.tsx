import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerChoferesConfig, obtenerUnidadesConfig } from "@/lib/datos-configuracion";
import { Encabezado } from "../../componentes";
import { textoProximos } from "../../proximos";
import { FormularioUnidad } from "./FormularioUnidad";

export const metadata: Metadata = { title: "Unidad · Tracker" };

export default async function Unidad({ params }: PageProps<"/configuracion/unidades/[id]">) {
  const { id } = await params;
  const [unidades, choferes] = await Promise.all([obtenerUnidadesConfig(), obtenerChoferesConfig()]);
  const unidad = id === "nueva" ? null : (unidades.find((u) => u.id === id) ?? notFound());
  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <Encabezado volver={{ href: "/configuracion/unidades", texto: "Unidades" }} titulo={unidad ? unidad.nombre : "Nueva unidad"} />
      <FormularioUnidad unidad={unidad} choferes={choferes.filter((c) => c.activo)} proximos={unidad ? textoProximos(unidad.proximos) : null} />
    </div>
  );
}
