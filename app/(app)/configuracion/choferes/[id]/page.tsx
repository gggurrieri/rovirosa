import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerChoferesConfig } from "@/lib/datos-configuracion";
import { Encabezado } from "../../componentes";
import { textoProximos } from "../../proximos";
import { FormularioChofer } from "./FormularioChofer";

export const metadata: Metadata = { title: "Chofer · Rovirosa" };

export default async function Chofer({ params }: PageProps<"/configuracion/choferes/[id]">) {
  const { id } = await params;
  const chofer = id === "nuevo" ? null : ((await obtenerChoferesConfig()).find((c) => c.id === id) ?? notFound());
  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <Encabezado volver={{ href: "/configuracion/choferes", texto: "Choferes" }} titulo={chofer ? chofer.nombre : "Nuevo chofer"} />
      <FormularioChofer chofer={chofer} proximos={chofer ? textoProximos(chofer.proximos) : null} />
    </div>
  );
}
